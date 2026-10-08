// =============================================================================
//  Smart Notice Board – Admin Logic (admin.js)
//  Auth, Achievements CRUD + Live Preview, Notices CRUD, Timetable, Settings
// =============================================================================

/* ── Auth ─────────────────────────────────────────────────────────────────── */

// js/admin.js

let isLoggedIn = false;
let authToken = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('iot_admin_token') : null) || null;

function getApiBaseUrl() {
  if (typeof window !== 'undefined' && window.getApiBase) {
    return window.getApiBase().replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.apiBase) {
    return window.APP_CONFIG.apiBase.replace(/\/+$/, '');
  }
  const ip = typeof PI_IP !== 'undefined' ? PI_IP : 'localhost';
  return `http://${ip}:5000`;
}

function getAuthToken() {
  if (authToken) return authToken;
  if (typeof sessionStorage !== 'undefined') {
    authToken = sessionStorage.getItem('iot_admin_token');
  }
  return authToken;
}

function setAuthToken(token) {
  authToken = token;
  if (typeof sessionStorage !== 'undefined') {
    if (token) {
      sessionStorage.setItem('iot_admin_token', token);
    } else {
      sessionStorage.removeItem('iot_admin_token');
    }
  }
}

async function syncToBackend(endpoint, payload) {
  const token = getAuthToken();
  if (!token) {
    return { ok: false, status: 401, error: 'Not authenticated with backend (saved in local cache only).' };
  }
  const apiBase = getApiBaseUrl();
  try {
    const response = await fetch(`${apiBase}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (response.status === 401 || response.status === 403) {
      setAuthToken(null);
      isLoggedIn = false;
      return { ok: false, status: response.status, error: 'Backend session expired — please log in again.' };
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, status: response.status, error: data.error || `Server returned HTTP ${response.status}` };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, status: 0, error: 'Backend offline/unreachable' };
  }
}

async function doLogin() {
  const user = document.getElementById('login-username').value.trim();
  const pass = document.getElementById('login-password').value.trim();
  const err = document.getElementById('login-error');

  try {
    const apiBase = getApiBaseUrl();
    const response = await fetch(`${apiBase}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass })
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok && data.success && data.token) {
      setAuthToken(data.token);
      isLoggedIn = true;
      document.getElementById('admin-login-screen').classList.remove('open');
      openAdminDashboard();
      if (err) err.classList.remove('visible');
      window.showToast('Logged in successfully!', 'success');
    } else {
      showError(err, (data && data.error) ? data.error : 'Invalid credentials. Please try again.');
    }
  } catch (error) {
    console.error('Login error:', error);
    showError(err, 'Server connection failed.');
  }
}

function showError(errElement, message) {
  if (errElement) {
    errElement.textContent = message;
    errElement.classList.add('visible');
  }
  const passInput = document.getElementById('login-password');
  if (passInput) {
    passInput.value = '';
    passInput.focus();
  }
}

function openAdminDashboard() {
  const dash = document.getElementById('admin-dashboard');
  dash.classList.add('open');
  switchAdminTab('notices');
}

function closeAdmin() {
  isLoggedIn = false;
  setAuthToken(null);
  document.getElementById('admin-dashboard').classList.remove('open');
  window.showToast('Logged out successfully.', 'info');
}

function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
  const tabEl = document.getElementById('atab-' + tab);
  const panelEl = document.getElementById('apanel-' + tab);
  if (tabEl) tabEl.classList.add('active');
  if (panelEl) panelEl.classList.add('active');

  if (tab === 'notices') renderAdminNotices();
  if (tab === 'achievements') renderAdminAchievements();
  if (tab === 'timetable') renderAdminTimetable();
  if (tab === 'settings') loadSettings();
}

/* ── ADMIN NOTICES ─────────────────────────────────────────────────────────── */
let editingNoticeId = null;

function renderAdminNotices() {
  const list = document.getElementById('admin-notices-list');
  const notices = window.App.data.notices || [];
  list.innerHTML = '';
  if (notices.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="es-icon">📋</div><p>No notices yet.</p></div>';
    return;
  }
  const pColors = { urgent: 'var(--accent-rose)', high: 'var(--accent-amber)', normal: 'var(--accent-green)' };
  notices.forEach(n => {
    const item = document.createElement('div');
    item.className = 'admin-list-item';
    const isExpired = window.isNoticeExpired ? window.isNoticeExpired(n) : false;
    const deadlineStr = n.deadline ? window.formatDate(n.deadline) : window.formatDate(n.date);
    item.innerHTML = `
      <div class="ali-content">
        <div class="ali-title">${n.title}</div>
        <div class="ali-meta" style="display:flex;gap:10px;margin-top:3px;flex-wrap:wrap">
          <span style="color:${pColors[n.priority] || 'gray'};font-weight:600;font-size:11px">${n.priority.toUpperCase()}</span>
          <span> ${n.category}</span>
          <span> Posted: ${window.formatDate(n.date)}</span>
          <span style="color:${isExpired ? 'var(--accent-rose)' : 'var(--text-secondary)'};font-weight:${isExpired ? '600' : 'normal'}">
             Deadline: ${deadlineStr} ${isExpired ? '(EXPIRED - Removed from board)' : ''}
          </span>
          <span style="color:${n.active && !isExpired ? 'var(--accent-green)' : 'var(--text-muted)'}">
            ${n.active && !isExpired ? '● Visible on Board' : (isExpired ? '✕ Expired' : '○ Hidden')}
          </span>
        </div>
      </div>
      <div class="ali-actions">
        <button class="btn-edit" onclick="editNotice('${n.id}')"> Edit</button>
        <button class="btn-danger" onclick="deleteNotice('${n.id}')"></button>
      </div>`;
    list.appendChild(item);
  });
}

function editNotice(id) {
  const n = (window.App.data.notices || []).find(x => x.id === id);
  if (!n) return;
  editingNoticeId = id;
  document.getElementById('notice-form-title').value = n.title;
  document.getElementById('notice-form-category').value = n.category;
  document.getElementById('notice-form-priority').value = n.priority;
  document.getElementById('notice-form-date').value = n.date;
  const deadlineInput = document.getElementById('notice-form-deadline');
  if (deadlineInput) deadlineInput.value = n.deadline || n.date;
  document.getElementById('notice-form-author').value = n.author;
  document.getElementById('notice-form-content').value = n.content;
  document.getElementById('notice-form-active').checked = n.active;
  document.getElementById('notice-form-heading').textContent = 'Edit Notice';
  document.getElementById('notice-form-cancel').style.display = 'inline-flex';
}

function cancelEditNotice() {
  editingNoticeId = null;
  document.getElementById('notice-form').reset();
  document.getElementById('notice-form-heading').textContent = 'Add Notice';
  document.getElementById('notice-form-cancel').style.display = 'none';
}

async function saveNotice() {
  const title = document.getElementById('notice-form-title').value.trim();
  const category = document.getElementById('notice-form-category').value;
  const priority = document.getElementById('notice-form-priority').value;
  const date = document.getElementById('notice-form-date').value;
  const deadline = document.getElementById('notice-form-deadline')?.value || date;
  const author = document.getElementById('notice-form-author').value.trim();
  const content = document.getElementById('notice-form-content').value.trim();
  const activeCheckbox = document.getElementById('notice-form-active');
  const active = activeCheckbox ? activeCheckbox.checked : true;

  if (!title || !content) { window.showToast('Title and content are required.', 'error'); return; }

  if (editingNoticeId) {
    const idx = window.App.data.notices.findIndex(x => x.id === editingNoticeId);
    if (idx !== -1) {
      window.App.data.notices[idx] = { ...window.App.data.notices[idx], title, category, priority, date, deadline, author, content, active };
    }
    editingNoticeId = null;
  } else {
    window.App.data.notices.unshift({
      id: window.uid(), title, category, priority,
      date: date || new Date().toISOString().split('T')[0],
      deadline: deadline || date || new Date().toISOString().split('T')[0],
      author: author || 'Admin', content, active
    });
  }

  window.saveData();
  window.renderNotices();
  window.updateUrgentBanner();
  renderAdminNotices();
  cancelEditNotice();

  const sync = await syncToBackend('/api/notices', { notices: window.App.data.notices });
  if (sync.ok) {
    window.showToast('Notice saved & synced to backend!', 'success');
  } else {
    window.showToast(`Saved locally (${sync.error})`, 'warning');
  }
}

async function deleteNotice(id) {
  if (!confirm('Delete this notice?')) return;
  window.App.data.notices = (window.App.data.notices || []).filter(x => x.id !== id);
  window.saveData();
  window.renderNotices();
  window.updateUrgentBanner();
  renderAdminNotices();

  const sync = await syncToBackend('/api/notices', { notices: window.App.data.notices });
  if (sync.ok) {
    window.showToast('Notice deleted & synced to backend.', 'success');
  } else {
    window.showToast(`Deleted locally (${sync.error})`, 'warning');
  }
}

/* ── ADMIN ACHIEVEMENTS ─────────────────────────────────────────────────────── */
let editingAchId = null;
let previewImageSrc = '';

function renderAdminAchievements() {
  const list = document.getElementById('admin-ach-list');
  const achs = window.App.data.achievements || [];
  list.innerHTML = '';
  if (achs.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="es-icon">🏆</div><p>No achievements yet.</p></div>';
    return;
  }
  achs.forEach(a => {
    const item = document.createElement('div');
    item.className = 'admin-list-item';
    item.innerHTML = `
      <div class="ali-content">
        <div class="ali-title">${a.title}</div>
        <div class="ali-meta" style="display:flex;gap:8px;margin-top:3px;flex-wrap:wrap">
          <span>🎓 ${a.studentName}</span>
          <span>🏆 ${a.competition}</span>
          <span style="color:${a.featured ? 'var(--accent-amber)' : 'var(--text-muted)'}">
            ${a.featured ? ' Featured' : '○ Not Featured'}
          </span>
        </div>
      </div>
      <div class="ali-actions">
        <button class="btn-edit" onclick="editAchievement('${a.id}')"> Edit</button>
        <button class="btn-danger" onclick="deleteAchievement('${a.id}')"></button>
      </div>`;
    list.appendChild(item);
  });
}

function editAchievement(id) {
  const a = (window.App.data.achievements || []).find(x => x.id === id);
  if (!a) return;
  editingAchId = id;
  document.getElementById('ach-form-name').value = a.studentName;
  document.getElementById('ach-form-rollno').value = a.rollNo || '';
  document.getElementById('ach-form-title').value = a.title;
  document.getElementById('ach-form-competition').value = a.competition;
  document.getElementById('ach-form-award').value = a.award;
  document.getElementById('ach-form-category').value = a.category;
  document.getElementById('ach-form-date').value = a.date;
  document.getElementById('ach-form-desc').value = a.description;
  document.getElementById('ach-form-imageurl').value = a.image || '';
  document.getElementById('ach-form-featured').checked = a.featured;
  previewImageSrc = a.image || '';
  updateAchPreview();
  document.getElementById('ach-form-heading').textContent = ' Edit Achievement';
  document.getElementById('ach-form-cancel').style.display = 'inline-flex';
}

function cancelEditAch() {
  editingAchId = null;
  previewImageSrc = '';
  document.getElementById('ach-form').reset();
  document.getElementById('ach-form-heading').textContent = ' Add Achievement';
  document.getElementById('ach-form-cancel').style.display = 'none';
  updateAchPreview();
}

async function saveAchievement() {
  const studentName = document.getElementById('ach-form-name').value.trim();
  const rollNo = document.getElementById('ach-form-rollno').value.trim();
  const title = document.getElementById('ach-form-title').value.trim();
  const competition = document.getElementById('ach-form-competition').value.trim();
  const award = document.getElementById('ach-form-award').value.trim();
  const category = document.getElementById('ach-form-category').value;
  const date = document.getElementById('ach-form-date').value;
  const description = document.getElementById('ach-form-desc').value.trim();
  const imageUrl = document.getElementById('ach-form-imageurl').value.trim();
  const featured = document.getElementById('ach-form-featured').checked;

  if (!studentName || !title) {
    window.showToast('Student name and title are required.', 'error'); return;
  }

  const image = previewImageSrc || imageUrl;

  if (editingAchId) {
    const idx = window.App.data.achievements.findIndex(x => x.id === editingAchId);
    if (idx !== -1) {
      window.App.data.achievements[idx] = {
        ...window.App.data.achievements[idx],
        studentName, rollNo, title, competition, award, category, date, description, image, featured
      };
    }
    editingAchId = null;
  } else {
    window.App.data.achievements.unshift({
      id: window.uid(), studentName, rollNo, title, competition,
      award, category,
      date: date || new Date().toISOString().split('T')[0],
      description, image, featured
    });
  }

  window.saveData();
  window.renderAchievements();
  renderAdminAchievements();
  cancelEditAch();

  const sync = await syncToBackend('/api/achievements', { achievements: window.App.data.achievements });
  if (sync.ok) {
    window.showToast('Achievement saved & synced to backend!', 'success');
  } else {
    window.showToast(`Saved locally (${sync.error})`, 'warning');
  }
}

async function deleteAchievement(id) {
  if (!confirm('Delete this achievement?')) return;
  window.App.data.achievements = (window.App.data.achievements || []).filter(x => x.id !== id);
  window.saveData();
  window.renderAchievements();
  renderAdminAchievements();

  const sync = await syncToBackend('/api/achievements', { achievements: window.App.data.achievements });
  if (sync.ok) {
    window.showToast('Achievement deleted & synced to backend.', 'success');
  } else {
    window.showToast(`Deleted locally (${sync.error})`, 'warning');
  }
}

function updateAchPreview() {
  const name = document.getElementById('ach-form-name')?.value.trim() || 'Student Name';
  const title = document.getElementById('ach-form-title')?.value.trim() || 'Achievement Title';
  const award = document.getElementById('ach-form-award')?.value.trim() || 'Award';
  const imgUrl = previewImageSrc || document.getElementById('ach-form-imageurl')?.value.trim() || '';

  const imgEl = document.getElementById('preview-img');
  const imgHolder = document.getElementById('preview-img-placeholder');
  if (imgUrl) {
    imgEl.src = imgUrl; imgEl.style.display = 'block';
    imgHolder.style.display = 'none';
  } else {
    imgEl.style.display = 'none'; imgHolder.style.display = 'flex';
  }
  document.getElementById('preview-title').textContent = title;
  document.getElementById('preview-student').textContent =  name;
  document.getElementById('preview-award').textContent =  award;
}

/* ── ADMIN TIMETABLE & SUBJECT CATALOG ───────────────────────────────────── */
let editingTT = null; // { day, cls, idx }
let draggedPeriodIdx = null; // index of item currently being dragged

// Retrieve unique subjects relevant ONLY to the specified class
function getSubjectsForClass(targetCls) {
  const map = new Map();
  const cls = targetCls || document.getElementById('admin-tt-class-select')?.value || 'S7 MRE';

  // 1. Scan timetable days specifically for this class
  const days = (window.App.data.timetable && window.App.data.timetable.days) || {};
  Object.values(days).forEach(dayObj => {
    if (!dayObj || typeof dayObj !== 'object') return;
    const periods = dayObj[cls];
    if (Array.isArray(periods)) {
      periods.forEach(p => {
        if (!p || !p.subject) return;
        const sub = p.subject.trim();
        if (/^(short break|lunch break|break|lunch)$/i.test(sub)) return;
        const key = sub.toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            subject: sub,
            code: (p.code || '').trim(),
            teacher: (p.teacher || '').trim(),
            cls: cls
          });
        } else {
          const existing = map.get(key);
          if (!existing.code && p.code) existing.code = p.code.trim();
          if (!existing.teacher && p.teacher) existing.teacher = p.teacher.trim();
        }
      });
    }
  });

  // 2. Add saved subjects explicitly associated with this class
  if (Array.isArray(window.App.data.savedSubjects)) {
    window.App.data.savedSubjects.forEach(s => {
      if (s && s.subject && (s.cls === cls || (!s.cls && map.has(s.subject.trim().toLowerCase())))) {
        const key = s.subject.trim().toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            subject: s.subject.trim(),
            code: (s.code || '').trim(),
            teacher: (s.teacher || '').trim(),
            cls: cls
          });
        } else {
          const existing = map.get(key);
          if (s.code) existing.code = s.code.trim();
          if (s.teacher) existing.teacher = s.teacher.trim();
        }
      }
    });
  }

  return Array.from(map.values()).sort((a, b) => a.subject.localeCompare(b.subject));
}

// Save or update a subject in the catalog for that specific class
function saveSubjectToCatalog(cls, subject, code, teacher) {
  if (!subject) return;
  const sub = subject.trim();
  if (/^(short break|lunch break|break|lunch)$/i.test(sub)) return;

  if (!Array.isArray(window.App.data.savedSubjects)) {
    window.App.data.savedSubjects = [];
  }

  const key = sub.toLowerCase();
  const existingIdx = window.App.data.savedSubjects.findIndex(
    s => s && s.subject && s.subject.trim().toLowerCase() === key && s.cls === cls
  );
  const entry = {
    cls: cls,
    subject: sub,
    code: (code || '').trim(),
    teacher: (teacher || '').trim()
  };

  if (existingIdx >= 0) {
    window.App.data.savedSubjects[existingIdx] = entry;
  } else {
    window.App.data.savedSubjects.push(entry);
  }
}

const BREAK_PRESETS = {
  morning: {
    key: 'preset_morning_break',
    label: ' Morning Short Break (10:40–10:50)',
    period: 'Break',
    time: '10:40–10:50',
    subject: 'Short Break',
    code: '-',
    teacher: '-'
  },
  lunch: {
    key: 'preset_lunch_break',
    label: 'Lunch Break (12:30-1:20)',
    period: 'Lunch',
    time: '12:30-1:20',
    subject: 'Lunch Break',
    code: '-',
    teacher: '-'
  },
  afternoon: {
    key: 'preset_afternoon_break',
    label: 'Afternoon Short Break (2:10–2:20)',
    period: 'Break',
    time: '2:10–2:20',
    subject: 'Short Break',
    code: '-',
    teacher: '-'
  }
};

function fillBreakPreset(type) {
  const p = BREAK_PRESETS[type];
  if (!p) return;
  document.getElementById('tt-form-period').value = p.period;
  document.getElementById('tt-form-time').value = p.time;
  document.getElementById('tt-form-subject').value = p.subject;
  document.getElementById('tt-form-code').value = p.code;
  document.getElementById('tt-form-teacher').value = p.teacher;

  const select = document.getElementById('tt-subject-select');
  if (select) select.value = p.key;

  window.showToast(`Selected ${p.subject} (${p.time})!`, 'info');
}
window.fillBreakPreset = fillBreakPreset;

// Populate the existing subjects dropdown with breaks and class-relevant subjects
function populateSubjectDropdown() {
  const select = document.getElementById('tt-subject-select');
  if (!select) return;
  const cls = document.getElementById('admin-tt-class-select')?.value || 'S7 MRE';
  const subjects = getSubjectsForClass(cls);

  let html = `<option value="">-- Choose existing subject, lunch, or short break --</option>`;

  // 1. Breaks & Lunch Presets
  html += `<optgroup label="☕ Breaks &amp; Lunch Timings">`;
  Object.values(BREAK_PRESETS).forEach(p => {
    html += `<option value="${p.key}">${p.label}</option>`;
  });
  html += `</optgroup>`;

  // 2. Class-specific Academic Subjects
  html += `<optgroup label=" ${cls} Academic Subjects">`;
  subjects.forEach((s, idx) => {
    const parts = [s.subject];
    if (s.code) parts.push(`[${s.code}]`);
    if (s.teacher) parts.push(`· ${s.teacher}`);
    html += `<option value="sub_${idx}">${parts.join(' ')}</option>`;
  });
  html += `</optgroup>`;

  select.innerHTML = html;
  syncSubjectDropdownWithForm();
}

// Handle subject or break selection from dropdown
function onSubjectSelectChange() {
  const select = document.getElementById('tt-subject-select');
  if (!select || !select.value) return;
  const val = select.value;

  // Check if it's one of the break presets
  const presetEntry = Object.values(BREAK_PRESETS).find(p => p.key === val);
  if (presetEntry) {
    document.getElementById('tt-form-period').value = presetEntry.period;
    document.getElementById('tt-form-time').value = presetEntry.time;
    document.getElementById('tt-form-subject').value = presetEntry.subject;
    document.getElementById('tt-form-code').value = presetEntry.code;
    document.getElementById('tt-form-teacher').value = presetEntry.teacher;
    return;
  }

  // Academic subject
  if (val.startsWith('sub_')) {
    const idx = parseInt(val.replace('sub_', ''), 10);
    const cls = document.getElementById('admin-tt-class-select')?.value || 'S7 MRE';
    const subjects = getSubjectsForClass(cls);
    const chosen = subjects[idx];
    if (chosen) {
      document.getElementById('tt-form-subject').value = chosen.subject || '';
      document.getElementById('tt-form-code').value = chosen.code || '';
      document.getElementById('tt-form-teacher').value = chosen.teacher || '';
    }
  }
}

// Sync dropdown value when user types in subject input
function syncSubjectDropdownWithForm() {
  const select = document.getElementById('tt-subject-select');
  const subInput = document.getElementById('tt-form-subject');
  const timeInput = document.getElementById('tt-form-time');
  if (!select || !subInput) return;

  const val = subInput.value.trim().toLowerCase();
  const timeVal = (timeInput?.value || '').trim();
  if (!val) {
    select.value = '';
    return;
  }

  // Check if matches a break preset
  if (val.includes('lunch')) {
    select.value = BREAK_PRESETS.lunch.key;
    return;
  }
  if (val.includes('break')) {
    if (timeVal.startsWith('15:') || timeVal.includes('15:00')) {
      select.value = BREAK_PRESETS.afternoon.key;
    } else {
      select.value = BREAK_PRESETS.morning.key;
    }
    return;
  }

  const cls = document.getElementById('admin-tt-class-select')?.value || 'S7 MRE';
  const subjects = getSubjectsForClass(cls);
  const matchIdx = subjects.findIndex(s => s.subject.trim().toLowerCase() === val);
  select.value = matchIdx >= 0 ? `sub_${matchIdx}` : '';
}

function renderAdminTimetable() {
  if (!window.App.data.timetable || !window.App.data.timetable.days) {
    window.App.data.timetable = window.DEFAULT_NOTICE_DATA.timetable;
  }
  const days = Object.keys(window.App.data.timetable.days);
  const daySel = document.getElementById('admin-tt-day-select');
  if (daySel && (!daySel.children.length || !days.includes(daySel.value))) {
    daySel.innerHTML = days.map(d => `<option value="${d}">${d}</option>`).join('');
    daySel.value = days[0] || 'Monday';
  }

  const clsSel = document.getElementById('admin-tt-class-select');
  if (clsSel && !clsSel.children.length) {
    const classes = window.App.data.timetable.classes || ["S7 MRE", "S5 MRE", "S3 MRE"];
    clsSel.innerHTML = classes.map(c => `<option value="${c}">${c}</option>`).join('');
    clsSel.value = classes[0];
  }

  populateSubjectDropdown();
  renderAdminTimetableDay();
}

/* ── DRAG AND DROP & REORDERING HANDLERS ──────────────────────────────────── */
function handleDragStart(e, idx) {
  draggedPeriodIdx = idx;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(idx));
  e.currentTarget.classList.add('dragging');
}

function handleDragEnd(e) {
  draggedPeriodIdx = null;
  document.querySelectorAll('.admin-list-item').forEach(el => {
    el.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom');
  });
}

function handleDragOver(e, idx) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (draggedPeriodIdx === null || draggedPeriodIdx === idx) return;

  const rect = e.currentTarget.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  const isTop = e.clientY < midY;

  e.currentTarget.classList.toggle('drag-over-top', isTop);
  e.currentTarget.classList.toggle('drag-over-bottom', !isTop);
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
}

function handleDrop(e, targetIdx, day, cls) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
  if (draggedPeriodIdx === null || draggedPeriodIdx === targetIdx) return;

  const rect = e.currentTarget.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  const isTop = e.clientY < midY;

  const periods = window.App.data.timetable.days[day][cls];
  const [movedItem] = periods.splice(draggedPeriodIdx, 1);

  let newIdx = targetIdx;
  if (!isTop && draggedPeriodIdx < targetIdx) {
    newIdx = targetIdx;
  } else if (!isTop && draggedPeriodIdx > targetIdx) {
    newIdx = targetIdx + 1;
  } else if (isTop && draggedPeriodIdx < targetIdx) {
    newIdx = targetIdx - 1;
  }
  newIdx = Math.max(0, Math.min(newIdx, periods.length));

  periods.splice(newIdx, 0, movedItem);

  // Sync editing pointer if this period is actively being edited
  if (editingTT && editingTT.day === day && editingTT.cls === cls) {
    if (editingTT.idx === draggedPeriodIdx) {
      editingTT.idx = newIdx;
    } else if (draggedPeriodIdx < editingTT.idx && newIdx >= editingTT.idx) {
      editingTT.idx--;
    } else if (draggedPeriodIdx > editingTT.idx && newIdx <= editingTT.idx) {
      editingTT.idx++;
    }
  }

  window.saveData();
  if (window.renderTimetable) window.renderTimetable();
  renderAdminTimetableDay();
  window.showToast('Period order updated!', 'success');
}

function ensurePeriodId(p) {
  if (!p) return '';
  if (!p.id) {
    p.id = (window.uid ? window.uid() : ('p_' + Math.random().toString(36).substring(2, 9)));
  }
  return p.id;
}

async function moveTTPeriod(day, cls, periodIdOrIdx, direction) {
  const dayData = window.App.data.timetable.days[day];
  if (!dayData || !dayData[cls]) return;
  const periods = dayData[cls];
  let idx = -1;
  if (typeof periodIdOrIdx === 'number') {
    idx = periodIdOrIdx;
  } else {
    idx = periods.findIndex(p => (p && p.id === periodIdOrIdx));
  }
  if (idx === -1) return;
  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= periods.length) return;

  // Swap
  const temp = periods[idx];
  periods[idx] = periods[targetIdx];
  periods[targetIdx] = temp;

  window.saveData();
  if (window.renderTimetable) window.renderTimetable();
  renderAdminTimetableDay();

  const sync = await syncToBackend('/api/timetable', window.App.data.timetable);
  if (sync.ok) {
    window.showToast('Period order updated & synced!', 'success');
  } else {
    window.showToast('Period order updated locally.', 'info');
  }
}

async function autoRenumberPeriods() {
  const day = document.getElementById('admin-tt-day-select')?.value || 'Monday';
  const cls = document.getElementById('admin-tt-class-select')?.value || 'S7 MRE';
  const dayData = window.App.data.timetable.days[day];
  if (!dayData || !dayData[cls] || !dayData[cls].length) {
    window.showToast('No periods to renumber for this class.', 'info');
    return;
  }

  let counter = 1;
  dayData[cls].forEach(p => {
    ensurePeriodId(p);
    const sub = (p.subject || '').trim().toLowerCase();
    const per = (p.period || '').trim().toLowerCase();
    if (sub.includes('lunch') || per === 'lunch') {
      p.period = 'Lunch';
    } else if (sub.includes('break') || per === 'break') {
      p.period = 'Break';
    } else {
      p.period = String(counter++);
    }
  });

  window.saveData();
  if (window.renderTimetable) window.renderTimetable();
  renderAdminTimetableDay();
  window.showToast('Periods renumbered sequentially!', 'success');

  syncToBackend('/api/timetable', window.App.data.timetable);
}

function renderAdminTimetableDay() {
  const day = document.getElementById('admin-tt-day-select')?.value || 'Monday';
  const cls = document.getElementById('admin-tt-class-select')?.value || 'S7 MRE';
  const dayData = window.App.data.timetable.days[day] || {};
  const periods = dayData[cls] || [];
  const list = document.getElementById('admin-tt-list');
  if (!list) return;
  list.innerHTML = '';

  periods.forEach((p, idx) => {
    ensurePeriodId(p);
    const isEditing = editingTT && editingTT.day === day && editingTT.cls === cls && editingTT.id === p.id;
    const item = document.createElement('div');
    item.className = 'admin-list-item draggable' + (isEditing ? ' active-editing' : '');
    item.draggable = true;
    item.dataset.index = idx;
    item.dataset.id = p.id;

    // Drag-and-drop listeners
    item.addEventListener('dragstart', (e) => handleDragStart(e, idx));
    item.addEventListener('dragend', handleDragEnd);
    item.addEventListener('dragover', (e) => handleDragOver(e, idx));
    item.addEventListener('dragleave', handleDragLeave);
    item.addEventListener('drop', (e) => handleDrop(e, idx, day, cls));

    item.innerHTML = `
      <div class="drag-handle" title="Drag to reorder">⠿</div>
      <div class="ali-content">
        <div class="ali-title" style="font-size:13px">
          <span style="color:var(--text-muted);font-family:var(--font-mono);margin-right:8px">P${p.period}</span>
          ${p.subject} <span style="color:var(--accent-primary);font-size:11px;margin-left:6px">${p.code || ''}</span>
          ${isEditing ? '<span style="color:var(--accent-amber);font-size:11px;margin-left:8px;font-weight:700">● EDITING</span>' : ''}
        </div>
        <div class="ali-meta" style="display:flex;gap:8px;margin-top:2px">
          <span> ${p.time}</span>
          <span> ${p.teacher || '—'}</span>
        </div>
      </div>
      <div class="ali-actions">
        <button type="button" class="btn-sm btn-ghost" onclick="moveTTPeriod('${day}', '${cls}', '${p.id}', -1)" ${idx === 0 ? 'disabled' : ''} title="Move Up">▲</button>
        <button type="button" class="btn-sm btn-ghost" onclick="moveTTPeriod('${day}', '${cls}', '${p.id}', 1)" ${idx === periods.length - 1 ? 'disabled' : ''} title="Move Down">▼</button>
        <button type="button" class="btn-sm btn-secondary" onclick="editTTPeriod('${day}', '${cls}', '${p.id}')" title="Edit period"></button>
        <button type="button" class="btn-sm btn-danger" onclick="deleteTTPeriod('${day}', '${cls}', '${p.id}')" title="Delete period"></button>
      </div>`;
    list.appendChild(item);
  });
  if (periods.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="es-icon">📅</div><p>No periods for ${cls} on ${day}.</p></div>`;
  }
}

function editTTPeriod(day, cls, periodIdOrIdx) {
  const dayData = window.App.data.timetable.days[day];
  if (!dayData || !dayData[cls]) return;
  const periods = dayData[cls];
  let p = null;
  if (typeof periodIdOrIdx === 'number') {
    p = periods[periodIdOrIdx];
  } else {
    p = periods.find(x => x && x.id === periodIdOrIdx) || periods[periodIdOrIdx];
  }
  if (!p) return;
  ensurePeriodId(p);
  editingTT = { day, cls, id: p.id };

  // Set selectors
  const daySel = document.getElementById('admin-tt-day-select');
  if (daySel) daySel.value = day;
  const clsSel = document.getElementById('admin-tt-class-select');
  if (clsSel) {
    clsSel.value = cls;
    populateSubjectDropdown();
  }

  // Fill form
  document.getElementById('tt-form-period').value = p.period || '';
  document.getElementById('tt-form-time').value = p.time || '';
  document.getElementById('tt-form-subject').value = p.subject || '';
  document.getElementById('tt-form-code').value = p.code || '';
  document.getElementById('tt-form-teacher').value = p.teacher || '';

  syncSubjectDropdownWithForm();

  // Update UI heading and buttons
  const heading = document.getElementById('tt-form-heading');
  if (heading) heading.textContent = ` Edit Period (${p.period || p.subject})`;
  const submitBtn = document.getElementById('tt-form-submit');
  if (submitBtn) submitBtn.textContent = ' Update Period';
  const cancelBtn = document.getElementById('tt-form-cancel');
  if (cancelBtn) cancelBtn.style.display = 'inline-flex';

  renderAdminTimetableDay();
}

function cancelEditTTPeriod() {
  editingTT = null;
  document.getElementById('tt-form').reset();
  const heading = document.getElementById('tt-form-heading');
  if (heading) heading.textContent = ' Add Period';
  const submitBtn = document.getElementById('tt-form-submit');
  if (submitBtn) submitBtn.textContent = ' Add Period';
  const cancelBtn = document.getElementById('tt-form-cancel');
  if (cancelBtn) cancelBtn.style.display = 'none';
  const subSel = document.getElementById('tt-subject-select');
  if (subSel) subSel.value = '';
  renderAdminTimetableDay();
}

async function addTTPeriod() {
  const day = document.getElementById('admin-tt-day-select').value;
  const cls = document.getElementById('admin-tt-class-select').value;
  const period = document.getElementById('tt-form-period').value.trim();
  const time = document.getElementById('tt-form-time').value.trim();
  const subject = document.getElementById('tt-form-subject').value.trim();
  const code = document.getElementById('tt-form-code').value.trim();
  const teacher = document.getElementById('tt-form-teacher').value.trim();

  if (!subject || !time) { window.showToast('Subject and time are required.', 'error'); return; }

  // Save subject to class-specific catalog
  saveSubjectToCatalog(cls, subject, code, teacher);

  if (!window.App.data.timetable.days[day]) window.App.data.timetable.days[day] = {};
  if (!window.App.data.timetable.days[day][cls]) window.App.data.timetable.days[day][cls] = [];

  if (editingTT) {
    const { day: eDay, cls: eCls, id: eId } = editingTT;
    const periods = window.App.data.timetable.days[eDay]?.[eCls] || [];
    const targetPeriod = periods.find(p => p && p.id === eId);
    if (targetPeriod) {
      Object.assign(targetPeriod, { period, time, subject, code, teacher });
    }
    cancelEditTTPeriod();
    window.showToast('Period updated successfully!', 'success');
  } else {
    const newPeriod = {
      id: window.uid ? window.uid() : ('p_' + Math.random().toString(36).substring(2, 9)),
      period, time, subject, code, teacher
    };
    window.App.data.timetable.days[day][cls].push(newPeriod);
    document.getElementById('tt-form').reset();
    const subSel = document.getElementById('tt-subject-select');
    if (subSel) subSel.value = '';
    window.showToast(`Period added to ${cls} on ${day}!`, 'success');
  }

  window.saveData();
  if (window.renderTimetable) window.renderTimetable();
  renderAdminTimetableDay();
  populateSubjectDropdown();

  const sync = await syncToBackend('/api/timetable', window.App.data.timetable);
  if (sync.ok) {
    window.showToast('Timetable synced to backend!', 'success');
  } else {
    window.showToast(`Saved locally (${sync.error})`, 'warning');
  }
}

async function deleteTTPeriod(day, cls, periodIdOrIdx) {
  if (!confirm(`Delete this period from ${cls}?`)) return;
  if (editingTT && editingTT.day === day && editingTT.cls === cls && (editingTT.id === periodIdOrIdx || editingTT.idx === periodIdOrIdx)) {
    cancelEditTTPeriod();
  }
  const dayData = window.App.data.timetable.days[day];
  if (dayData && dayData[cls]) {
    if (typeof periodIdOrIdx === 'number') {
      dayData[cls].splice(periodIdOrIdx, 1);
    } else {
      dayData[cls] = dayData[cls].filter(p => (p && p.id ? p.id !== periodIdOrIdx : p !== periodIdOrIdx));
    }
  }
  window.saveData();
  if (window.renderTimetable) window.renderTimetable();
  renderAdminTimetableDay();
  populateSubjectDropdown();

  const sync = await syncToBackend('/api/timetable', window.App.data.timetable);
  if (sync.ok) {
    window.showToast('Period deleted & synced to backend.', 'success');
  } else {
    window.showToast(`Deleted locally (${sync.error})`, 'warning');
  }
}

/* ── SETTINGS ─────────────────────────────────────────────────────────────── */
function loadSettings() {
  const cfg = (window.App.data && window.App.data.config) || {};
  const sbt = document.getElementById('set-board-title');
  if (sbt) sbt.value = cfg.boardTitle || '';
  const sin = document.getElementById('set-institution');
  if (sin) sin.value = cfg.institution || '';
  const swe = document.getElementById('set-weather-endpoint');
  if (swe) swe.value = cfg.weatherEndpoint || '';
  const swc = document.getElementById('set-weather-city');
  if (swc) swc.value = cfg.weatherCity || '';
  const sri = document.getElementById('set-rotate-interval');
  if (sri) sri.value = cfg.rotateInterval || 12;
  const sar = document.getElementById('set-auto-rotate');
  if (sar) sar.checked = !!cfg.autoRotate;

  const themeModeEl = document.getElementById('set-theme-mode');
  if (themeModeEl) themeModeEl.value = cfg.theme || 'auto';

  const adm = (window.App.data && window.App.data.admin) || {};
  const admUserEl = document.getElementById('set-admin-user');
  if (admUserEl) admUserEl.value = adm.username || 'admin';

  if (window.updateCollegeLogoDisplay) window.updateCollegeLogoDisplay();
}

async function saveSettings() {
  if (!window.App.data) window.App.data = {};
  if (!window.App.data.config) window.App.data.config = {};
  const cfg = window.App.data.config;

  const sbt = document.getElementById('set-board-title');
  if (sbt) cfg.boardTitle = sbt.value.trim() || cfg.boardTitle;
  const sin = document.getElementById('set-institution');
  if (sin) cfg.institution = sin.value.trim() || cfg.institution;
  const swe = document.getElementById('set-weather-endpoint');
  if (swe) cfg.weatherEndpoint = swe.value.trim();
  const swc = document.getElementById('set-weather-city');
  if (swc) cfg.weatherCity = swc.value.trim() || cfg.weatherCity;
  const sri = document.getElementById('set-rotate-interval');
  if (sri) cfg.rotateInterval = parseInt(sri.value) || 12;
  const sar = document.getElementById('set-auto-rotate');
  if (sar) sar.checked = !!sar.checked;

  const themeModeEl = document.getElementById('set-theme-mode');
  if (themeModeEl) cfg.theme = themeModeEl.value;

  const newUser = document.getElementById('set-admin-user')?.value.trim();
  const newPass = document.getElementById('set-admin-pass')?.value.trim();
  if (!window.App.data.admin) {
    window.App.data.admin = { username: 'admin' };
  }
  if (newUser) window.App.data.admin.username = newUser;
  if (newPass) {
    window.showToast('Note: Backend credentials must be configured on the server via .env (ADMIN_PASSWORD).', 'info');
  }
  delete window.App.data.admin.password;

  window.saveData();

  // Apply changes live on the page
  const bt = document.getElementById('board-title');
  if (bt) bt.textContent = cfg.boardTitle;
  const bi = document.getElementById('board-institution');
  if (bi) bi.textContent = cfg.institution;

  if (window.updateCollegeLogoDisplay) {
    window.updateCollegeLogoDisplay();
  }

  const sync = await syncToBackend('/api/settings', cfg);
  if (sync.ok) {
    window.showToast('Settings saved & synced to backend!', 'success');
  } else {
    window.showToast(`Settings saved locally (${sync.error})`, 'warning');
  }

  if (window.checkSunsetTheme) window.checkSunsetTheme();
  if (cfg.autoRotate) { window.startKiosk(); } else { window.stopKiosk(); }
  if (window.fetchWeather) window.fetchWeather();
  if (window.scheduleWeatherRefresh) window.scheduleWeatherRefresh();

  const passInput = document.getElementById('set-admin-pass');
  if (passInput) passInput.value = '';
}

function exportData() {
  const exportPayload = JSON.parse(JSON.stringify(window.App.data || {}));
  if (exportPayload.admin) {
    delete exportPayload.admin.password;
  }
  delete exportPayload.token;
  delete exportPayload.sessionToken;

  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `noticeboard_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  window.showToast('Data exported (credentials excluded)!', 'success');
}

function importData() { document.getElementById('import-file-input').click(); }

function handleImport(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async evt => {
    try {
      const parsed = JSON.parse(evt.target.result);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Root JSON must be an object');
      }

      const hasKnownKey = ('notices' in parsed) || ('achievements' in parsed) || ('timetable' in parsed) || ('config' in parsed);
      if (!hasKnownKey) {
        throw new Error('Unrecognized backup format: missing notices, achievements, timetable, or config');
      }

      if ('notices' in parsed && !Array.isArray(parsed.notices)) {
        throw new Error('Invalid format: notices must be a list');
      }
      if ('achievements' in parsed && !Array.isArray(parsed.achievements)) {
        throw new Error('Invalid format: achievements must be a list');
      }
      if ('timetable' in parsed && (typeof parsed.timetable !== 'object' || parsed.timetable === null || Array.isArray(parsed.timetable))) {
        throw new Error('Invalid format: timetable must be an object');
      }
      if ('config' in parsed && (typeof parsed.config !== 'object' || parsed.config === null || Array.isArray(parsed.config))) {
        throw new Error('Invalid format: config must be an object');
      }

      // Create pre-import recoverable backup
      try {
        const preImport = JSON.parse(JSON.stringify(window.App.data || {}));
        if (preImport.admin) delete preImport.admin.password;
        localStorage.setItem('noticeboard_pre_import_backup', JSON.stringify(preImport));
      } catch (backupErr) {
        console.warn('Could not create pre-import backup:', backupErr);
      }

      // Sanitize imported data to exclude any credentials/secrets
      if (parsed.admin) {
        delete parsed.admin.password;
      }
      delete parsed.token;
      delete parsed.sessionToken;

      // Merge safely into window.App.data
      if (Array.isArray(parsed.notices)) window.App.data.notices = parsed.notices;
      if (Array.isArray(parsed.achievements)) window.App.data.achievements = parsed.achievements;
      if (parsed.timetable && typeof parsed.timetable === 'object') window.App.data.timetable = parsed.timetable;
      if (parsed.config && typeof parsed.config === 'object') window.App.data.config = Object.assign({}, window.App.data.config, parsed.config);

      window.saveData();
      if (window.renderNotices) window.renderNotices();
      if (window.renderAchievements) window.renderAchievements();
      if (window.renderTimetable) window.renderTimetable();
      if (window.updateUrgentBanner) window.updateUrgentBanner();
      loadSettings();

      if (isLoggedIn && getAuthToken()) {
        const promises = [];
        if (parsed.notices) promises.push(syncToBackend('/api/notices', { notices: window.App.data.notices }));
        if (parsed.achievements) promises.push(syncToBackend('/api/achievements', { achievements: window.App.data.achievements }));
        if (parsed.timetable) promises.push(syncToBackend('/api/timetable', window.App.data.timetable));
        if (parsed.config) promises.push(syncToBackend('/api/settings', window.App.data.config));

        const res = await Promise.all(promises);
        if (res.every(r => r.ok)) {
          window.showToast('Data imported and synced to backend!', 'success');
        } else {
          window.showToast('Data imported locally (Backend sync had warnings).', 'warning');
        }
      } else {
        window.showToast('Data imported locally successfully!', 'success');
      }
    } catch (err) {
      console.error('Import error:', err);
      window.showToast(`Import failed: ${err.message}`, 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function resetToDefaults() {
  if (!confirm('Reset all board data to defaults? This cannot be undone.')) return;
  window.App.data = JSON.parse(JSON.stringify(window.DEFAULT_NOTICE_DATA));
  window.saveData();
  window.renderNotices();
  window.renderAchievements();
  window.updateUrgentBanner();
  loadSettings();
  window.showToast('Reset to default data.', 'success');
}

/* ── Image Upload / Preview ─────────────────────────────────────────────────*/
function handleImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = e => {
    previewImageSrc = e.target.result;
    updateAchPreview();
  };
  reader.readAsDataURL(file);
}

/* ── DOM Ready ──────────────────────────────────────────────────────────────*/
document.addEventListener('DOMContentLoaded', () => {

  // Login
  document.getElementById('login-form').addEventListener('submit', e => { e.preventDefault(); doLogin(); });
  document.getElementById('login-cancel').addEventListener('click', () => {
    document.getElementById('admin-login-screen').classList.remove('open');
  });

  // Admin tabs
  document.querySelectorAll('.admin-tab[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => switchAdminTab(btn.dataset.panel));
  });

  // Admin close
  document.getElementById('admin-close-btn').addEventListener('click', closeAdmin);

  // Notice form
  document.getElementById('notice-form').addEventListener('submit', e => { e.preventDefault(); saveNotice(); });
  document.getElementById('notice-form-cancel').addEventListener('click', cancelEditNotice);

  // Achievement form
  document.getElementById('ach-form').addEventListener('submit', e => { e.preventDefault(); saveAchievement(); });
  document.getElementById('ach-form-cancel').addEventListener('click', cancelEditAch);

  // Achievement live preview triggers
  ['ach-form-name', 'ach-form-title', 'ach-form-award', 'ach-form-imageurl'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => { if (id === 'ach-form-imageurl') previewImageSrc = ''; updateAchPreview(); });
  });

  // Image file upload (drag-drop + click)
  const uploadZone = document.getElementById('ach-upload-zone');
  const fileInput = document.getElementById('ach-file-input');
  if (uploadZone) {
    uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
    uploadZone.addEventListener('drop', e => {
      e.preventDefault(); uploadZone.classList.remove('dragover');
      handleImageFile(e.dataTransfer.files[0]);
    });
    uploadZone.addEventListener('click', () => fileInput.click());
  }
  if (fileInput) {
    fileInput.addEventListener('change', e => handleImageFile(e.target.files[0]));
  }

  // Timetable form
  const ttDaySel = document.getElementById('admin-tt-day-select');
  if (ttDaySel) ttDaySel.addEventListener('change', () => {
    if (editingTT) cancelEditTTPeriod();
    renderAdminTimetableDay();
  });
  const ttClassSel = document.getElementById('admin-tt-class-select');
  if (ttClassSel) ttClassSel.addEventListener('change', () => {
    if (editingTT) cancelEditTTPeriod();
    populateSubjectDropdown();
    renderAdminTimetableDay();
  });
  const ttSubSel = document.getElementById('tt-subject-select');
  if (ttSubSel) ttSubSel.addEventListener('change', onSubjectSelectChange);
  const ttFormSub = document.getElementById('tt-form-subject');
  if (ttFormSub) ttFormSub.addEventListener('input', syncSubjectDropdownWithForm);
  const ttCancelBtn = document.getElementById('tt-form-cancel');
  if (ttCancelBtn) ttCancelBtn.addEventListener('click', cancelEditTTPeriod);
  const autoRenumberBtn = document.getElementById('tt-auto-renumber-btn');
  if (autoRenumberBtn) autoRenumberBtn.addEventListener('click', autoRenumberPeriods);
  document.getElementById('tt-form').addEventListener('submit', e => { e.preventDefault(); addTTPeriod(); });

  // Settings
  document.getElementById('settings-save-btn').addEventListener('click', saveSettings);
  document.getElementById('settings-export-btn').addEventListener('click', exportData);
  document.getElementById('settings-import-btn').addEventListener('click', importData);
  document.getElementById('import-file-input').addEventListener('change', handleImport);
  document.getElementById('settings-reset-btn').addEventListener('click', resetToDefaults);

  // Settings Logo upload / remove
  const setLogoFile = document.getElementById('set-logo-file');
  if (setLogoFile) {
    setLogoFile.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        window.showToast('Please select a valid image file', 'error');
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        window.showToast('Logo file size exceeds 2MB limit', 'error');
        return;
      }

      const token = getAuthToken();
      const apiBase = getApiBaseUrl();

      let uploadedUrl = null;
      if (token) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          const res = await fetch(`${apiBase}/api/upload-logo`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            },
            body: formData
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.success) {
            uploadedUrl = data.url;
          } else {
            console.warn('Backend logo upload returned error:', data.error);
          }
        } catch (uploadErr) {
          console.warn('Backend logo upload failed:', uploadErr);
        }
      }

      if (uploadedUrl) {
        window.App.data.config.collegeLogo = uploadedUrl;
        window.saveData();
        await syncToBackend('/api/settings', window.App.data.config);
        if (window.updateCollegeLogoDisplay) window.updateCollegeLogoDisplay();
        window.showToast('College logo uploaded & synced to backend!', 'success');
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => {
          window.App.data.config.collegeLogo = ev.target.result;
          window.saveData();
          if (window.updateCollegeLogoDisplay) window.updateCollegeLogoDisplay();
          window.showToast('College logo saved locally (Backend offline or not synced).', 'warning');
        };
        reader.readAsDataURL(file);
      }
    });
  }

  const setLogoRemoveBtn = document.getElementById('set-logo-remove-btn');
  if (setLogoRemoveBtn) {
    setLogoRemoveBtn.addEventListener('click', async () => {
      window.App.data.config.collegeLogo = '';
      window.saveData();
      await syncToBackend('/api/settings', window.App.data.config);
      if (window.updateCollegeLogoDisplay) window.updateCollegeLogoDisplay();
      window.showToast('College logo removed', 'info');
    });
  }
});

// Expose functions globally on window
if (typeof window !== 'undefined') {
  window.doLogin = doLogin;
  window.closeAdmin = closeAdmin;
  window.switchAdminTab = switchAdminTab;
  window.saveNotice = saveNotice;
  window.deleteNotice = deleteNotice;
  window.editNotice = editNotice;
  window.cancelEditNotice = cancelEditNotice;
  window.renderAdminNotices = renderAdminNotices;
  window.saveAchievement = saveAchievement;
  window.deleteAchievement = deleteAchievement;
  window.editAchievement = editAchievement;
  window.cancelEditAch = cancelEditAch;
  window.renderAdminAchievements = renderAdminAchievements;
  window.loadSettings = loadSettings;
  window.saveSettings = saveSettings;
  window.exportData = exportData;
  window.importData = importData;
  window.handleImport = handleImport;
  window.resetToDefaults = resetToDefaults;
  window.addTTPeriod = addTTPeriod;
  window.deleteTTPeriod = deleteTTPeriod;
  window.editTTPeriod = editTTPeriod;
  window.cancelEditTTPeriod = cancelEditTTPeriod;
  window.moveTTPeriod = moveTTPeriod;
  window.autoRenumberPeriods = autoRenumberPeriods;
  window.renderAdminTimetableDay = renderAdminTimetableDay;
  window.getAuthToken = getAuthToken;
  window.setAuthToken = setAuthToken;
  window.syncToBackend = syncToBackend;
}
