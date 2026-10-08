// =============================================================================
//  Smart Notice Board – Core App Logic  (app.js)
//  Real-time clock, kiosk auto-rotator, weather fetcher, view switching
// =============================================================================

function getApiBaseUrl() {
  if (window.APP_CONFIG && typeof window.APP_CONFIG.apiBaseUrl === 'string') {
    return window.APP_CONFIG.apiBaseUrl.replace(/\/$/, '');
  }
  if (App.data && App.data.config && App.data.config.apiBaseUrl) {
    return App.data.config.apiBaseUrl.replace(/\/$/, '');
  }
  const stored = localStorage.getItem('snb_api_base_url');
  if (stored) return stored.replace(/\/$/, '');
  if (window.location.port === '5000') {
    return window.location.origin;
  }
  const ip = typeof PI_IP !== 'undefined' ? PI_IP : '10.178.192.24';
  return `http://${ip}:5000`;
}

const PI_IP = '10.178.192.24';

/* ── State ─────────────────────────────────────────────────────────────────── */
const App = {
  currentView: 'notices',
  views: ['notices', 'achievements', 'timetable', 'weather'],
  kioskTimer: null,
  kioskProgressInterval: null,
  kioskProgressElapsed: 0,
  kioskPaused: false,
  weatherRefreshTimer: null,
  data: null,
};

let noticeSearchStr = '';
let noticeFilter = 'All';

function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isValidHttpUrl(str) {
  if (!str || typeof str !== 'string') return false;
  const s = str.trim();
  if (s.startsWith('data:image/')) return true;
  try {
    const parsed = new URL(s, window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function isNoticeExpired(notice) {
  if (!notice) return false;
  const deadlineStr = notice.deadline || notice.expiryDate;
  if (!deadlineStr) return false;
  const match = String(deadlineStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const endOfDay = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59, 999);
    return endOfDay < new Date();
  }
  const expiry = new Date(deadlineStr);
  return !isNaN(expiry.getTime()) && expiry < new Date();
}

/* ── Helpers ─────────────────────────────────────────────────────────────────*/
function uid() { return 'id-' + Math.random().toString(36).substr(2,9) + '-' + Date.now(); }

function loadData() {
  const saved = localStorage.getItem('noticeboard_data');
  if (saved) {
    try {
      App.data = JSON.parse(saved);
      // Merge any missing keys from defaults
      const def = window.DEFAULT_NOTICE_DATA;
      if (!App.data.config)          App.data.config          = def.config;
      if (!App.data.weatherFallback) App.data.weatherFallback = def.weatherFallback;
      // Upgrade timetable if in old format (or missing 3 classes)
      if (!App.data.timetable || !App.data.timetable.classes || Array.isArray(App.data.timetable.days?.['Monday'])) {
        App.data.timetable = def.timetable;
      }
      // Migrate legacy notices with expiryDate to deadline
      if (Array.isArray(App.data.notices)) {
        App.data.notices.forEach(n => {
          if (n && n.expiryDate && !n.deadline) {
            n.deadline = n.expiryDate;
          }
        });
      }
      return;
    } catch(e) {}
  }
  App.data = JSON.parse(JSON.stringify(window.DEFAULT_NOTICE_DATA));
  saveData();
}

function saveData() {
  if (App.data) {
    if (App.data.admin && 'password' in App.data.admin) {
      delete App.data.admin.password;
    }
    if ('token' in App.data) {
      delete App.data.token;
    }
    if ('sessionToken' in App.data) {
      delete App.data.sessionToken;
    }
  }
  localStorage.setItem('noticeboard_data', JSON.stringify(App.data));
}

/* ── Toast notifications ──────────────────────────────────────────────────── */
function showToast(msg, type = 'success', duration = 3000) {
  const icon = type === 'success' ? '✓' : '✗';
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(20px)';
    t.style.transition = '0.3s ease'; setTimeout(() => t.remove(), 300); }, duration);
}

/* ── Clock ───────────────────────────────────────────────────────────────────*/
function updateClock() {
  const now  = new Date();
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const hh   = String(now.getHours()).padStart(2,'0');
  const mm   = String(now.getMinutes()).padStart(2,'0');
  const ss   = String(now.getSeconds()).padStart(2,'0');
  const dd   = days[now.getDay()];
  const dat  = `${now.getDate()} ${mons[now.getMonth()]} ${now.getFullYear()}`;
  document.getElementById('clock-time').textContent = `${hh}:${mm}:${ss}`;
  document.getElementById('clock-date').innerHTML = `${dd}<br>${dat}`;

  // Check and maintain sunset dark theme
  checkSunsetTheme();
}

/* ── View Switching ──────────────────────────────────────────────────────────*/
function switchView(view) {
  if (!App.views.includes(view)) return;
  App.currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('view-' + view);
  if (el) el.classList.add('active');
  const nb = document.getElementById('nav-' + view);
  if (nb) nb.classList.add('active');
  const mnb = document.getElementById('mnav-' + view);
  if (mnb) mnb.classList.add('active');

  if (view === 'timetable') renderTimetable();
  if (view === 'weather')   renderWeather();
  if (view === 'notices')   renderNotices();
  if (view === 'achievements') renderAchievements();

  resetKioskProgress();
}

/* ── Kiosk Auto-Rotate ───────────────────────────────────────────────────────*/
function startKiosk() {
  stopKiosk();
  if (!App.data.config.autoRotate) return;
  const interval = (App.data.config.rotateInterval || 12) * 1000;
  App.kioskProgressElapsed = 0;
  App.kioskProgressInterval = setInterval(() => {
    if (App.kioskPaused) return;
    App.kioskProgressElapsed += 100;
    const pct = Math.min((App.kioskProgressElapsed / interval) * 100, 100);
    document.getElementById('kiosk-progress-fill').style.width = pct + '%';
    if (App.kioskProgressElapsed >= interval) {
      nextView();
    }
  }, 100);
}

function stopKiosk() {
  clearInterval(App.kioskProgressInterval);
  App.kioskProgressInterval = null;
  App.kioskProgressElapsed = 0;
  document.getElementById('kiosk-progress-fill').style.width = '0%';
}

function resetKioskProgress() {
  App.kioskProgressElapsed = 0;
  document.getElementById('kiosk-progress-fill').style.width = '0%';
}

function nextView() {
  const idx  = App.views.indexOf(App.currentView);
  const next = App.views[(idx + 1) % App.views.length];
  switchView(next);
}

/* ── Urgent Banner (Removed per user requirement) ───────────────────────────*/
function updateUrgentBanner() {
  const banner = document.getElementById('urgent-banner');
  if (banner) {
    banner.classList.remove('visible');
    banner.style.display = 'none';
  }
}


/*-----Logo----*/

function loadCollegeLogo() {
  const logoImg = document.getElementById('college-logo-img');
  const logoPlaceholder = document.getElementById('logo-placeholder');
  const apiBase = getApiBaseUrl();

  if (App.data && App.data.config && App.data.config.collegeLogo) {
    if (logoImg) {
      logoImg.src = App.data.config.collegeLogo;
      logoImg.style.display = 'block';
      if (logoPlaceholder) logoPlaceholder.style.display = 'none';
      return;
    }
  }

  if (logoImg && apiBase) {
    logoImg.src = `${apiBase}/api/logo?t=${Date.now()}`;
    logoImg.onload = () => {
      logoImg.style.display = 'block';
      if (logoPlaceholder) logoPlaceholder.style.display = 'none';
    };
    logoImg.onerror = () => {
      logoImg.style.display = 'none';
      if (logoPlaceholder) logoPlaceholder.style.display = 'inline-block';
    };
  } else if (logoPlaceholder) {
    logoPlaceholder.style.display = 'inline-block';
  }
}

/* ── Pi Backend Health Status ───────────────────────────────────────────────*/
async function checkPiHealth() {
  const badge = document.querySelector('.status-badge');
  const dot = badge ? badge.querySelector('.status-dot') : null;
  const label = badge ? badge.querySelector('span:not(.status-dot)') : null;
  const apiBase = getApiBaseUrl();

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 4000) : null;

  try {
    const res = await fetch(`${apiBase}/api/health`, {
      method: 'GET',
      signal: controller ? controller.signal : undefined
    });
    if (timeoutId) clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (badge) {
        badge.classList.remove('offline');
        badge.classList.add('online');
        badge.title = `Connected to Pi backend (${data.timestamp || 'active'})`;
      }
      if (dot) dot.style.background = 'var(--accent-green)';
      if (label) label.textContent = 'Pi Online';
      return true;
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    if (badge) {
      badge.classList.remove('online');
      badge.classList.add('offline');
      badge.title = 'Backend unreachable - running in standalone cached mode';
    }
    if (dot) dot.style.background = 'var(--accent-amber)';
    if (label) label.textContent = 'Standalone Mode';
    return false;
  }
}

function schedulePiHealthCheck() {
  checkPiHealth();
  if (typeof setInterval !== 'undefined') {
    setInterval(checkPiHealth, 30000);
  }
}

// Render Notices into the UI
function renderNotices(noticesInput) {
  if (Array.isArray(noticesInput)) {
    App.data.notices = noticesInput;
    saveData();
  }

  const grid = document.getElementById('notices-grid');
  if (!grid) {
    console.warn('[renderNotices] Target #notices-grid element not found in DOM.');
    return;
  }

  const allNotices = (App.data && Array.isArray(App.data.notices)) ? App.data.notices : [];
  const activeNotices = allNotices.filter(n => n.active !== false && !isNoticeExpired(n));

  // Populate dynamic category chips in #notice-filter-chips
  const filterBar = document.getElementById('notice-filter-chips');
  if (filterBar) {
    const rawCategories = activeNotices.map(n => n.category).filter(Boolean);
    const categories = ['All', ...Array.from(new Set(rawCategories))];
    filterBar.innerHTML = '';
    categories.forEach(cat => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'filter-chip' + (cat === noticeFilter ? ' active' : '');
      const count = cat === 'All' ? activeNotices.length : activeNotices.filter(n => n.category === cat).length;
      chip.innerHTML = `<span>${cat === 'All' ? '📋 All' : escapeHTML(cat)}</span> <span class="chip-count">${count}</span>`;
      chip.addEventListener('click', () => {
        noticeFilter = cat;
        renderNotices();
      });
      filterBar.appendChild(chip);
    });
  }

  let filtered = activeNotices;
  if (noticeFilter && noticeFilter !== 'All') {
    filtered = filtered.filter(n => n.category === noticeFilter);
  }
  if (noticeSearchStr) {
    const s = noticeSearchStr.toLowerCase();
    filtered = filtered.filter(n =>
      (n.title && n.title.toLowerCase().includes(s)) ||
      (n.content && n.content.toLowerCase().includes(s)) ||
      (n.author && n.author.toLowerCase().includes(s))
    );
  }

  const pOrder = { urgent: 0, high: 1, normal: 2 };
  filtered.sort((a, b) => (pOrder[a.priority] ?? 9) - (pOrder[b.priority] ?? 9));

  grid.innerHTML = '';
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="es-icon">📋</div><h3>No active notices found</h3>
      <p>All notices may be past their deadline or no notices match your search.</p></div>`;
    return;
  }

  const categoryIcons = {
    Academic: '📚', Events: '🎉', Placement: '💼', General: '📢', Urgent: '🚨', Circular: '📜'
  };

  filtered.forEach(notice => {
    const card = document.createElement('div');
    card.className = `notice-card priority-${notice.priority || 'normal'}`;
    const deadlineText = notice.deadline ? formatDate(notice.deadline) : formatDate(notice.date);
    card.innerHTML = `
      <div class="notice-meta">
        <span class="notice-category">${categoryIcons[notice.category] || '📌'} ${escapeHTML(notice.category || 'General')}</span>
        <span class="notice-priority-badge">${escapeHTML((notice.priority || 'normal').toUpperCase())}</span>
      </div>
      <div class="notice-title">${escapeHTML(notice.title || 'Untitled Notice')}</div>
      <div class="notice-content">${escapeHTML(notice.content || '')}</div>
      <div class="notice-footer">
        <span>👤 ${escapeHTML(notice.author || 'Admin')}</span>
        <span title="Valid until deadline" class="notice-deadline-tag">⏳ Deadline: ${escapeHTML(deadlineText)}</span>
      </div>`;
    card.addEventListener('click', () => openNoticeModal(notice));
    grid.appendChild(card);
  });
}

function openNoticeModal(notice) {
  if (!notice) return;
  const modal = document.getElementById('notice-modal');
  if (!modal) return;
  const t = document.getElementById('notice-modal-title');
  const b = document.getElementById('notice-modal-body');
  const a = document.getElementById('notice-modal-author');
  const d = document.getElementById('notice-modal-date');
  const c = document.getElementById('notice-modal-cat');
  const deadlineText = notice.deadline ? formatDate(notice.deadline) : formatDate(notice.date);
  if (t) t.textContent = notice.title || 'Untitled Notice';
  if (b) b.textContent = notice.content || '';
  if (a) a.textContent = `👤 ${notice.author || 'Admin'}`;
  if (d) d.textContent = `⏳ Deadline: ${deadlineText}`;
  if (c) c.textContent = `🏷 ${notice.category || 'General'}`;
  modal.classList.add('open');
}

// Render Achievements into the UI
function renderAchievements(achievementsInput) {
  if (Array.isArray(achievementsInput)) {
    App.data.achievements = achievementsInput;
    saveData();
  }

  const grid = document.getElementById('achievements-grid');
  if (!grid) {
    console.warn('[renderAchievements] Target #achievements-grid element not found in DOM.');
    return;
  }

  const achs = (App.data && Array.isArray(App.data.achievements)) ? App.data.achievements : [];
  grid.innerHTML = '';
  if (achs.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="es-icon">🏆</div><h3>No achievements yet</h3>
      <p>Add student achievements from the Admin panel.</p></div>`;
    return;
  }

  achs.forEach(ach => {
    const card = document.createElement('div');
    card.className = 'ach-card' + (ach.featured ? ' featured' : '');
    const iconMap = { 'IoT & Robotics': '🤖', Research: '📄', Cybersecurity: '🛡️', Robotics: '⚙️' };
    const safeImg = isValidHttpUrl(ach.image) ? ach.image : '';
    const imgHTML = safeImg
      ? `<div class="ach-image-wrap"><img src="${escapeHTML(safeImg)}" alt="${escapeHTML(ach.studentName || '')}" loading="lazy"><div class="ach-image-overlay"></div></div>`
      : `<div class="ach-img-placeholder">${iconMap[ach.category] || '🏆'}</div>`;

    card.innerHTML = `
      ${imgHTML}
      <span class="ach-featured-badge">⭐ Featured</span>
      <div class="ach-body">
        <div class="ach-category">${escapeHTML(ach.category || '')}</div>
        <div class="ach-title">${escapeHTML(ach.title || '')}</div>
        <div class="ach-student">🎓 ${escapeHTML(ach.studentName || '')}</div>
        <div class="ach-competition">🏆 ${escapeHTML(ach.competition || '')}</div>
        <div class="ach-award">🥇 ${escapeHTML(ach.award || '')}</div>
      </div>`;
    card.addEventListener('click', () => openAchModal(ach));
    grid.appendChild(card);
  });
}

function openAchModal(ach) {
  if (!ach) return;
  const modal = document.getElementById('ach-modal');
  if (!modal) return;
  const titleEl = document.getElementById('ach-modal-title');
  const studentEl = document.getElementById('ach-modal-student');
  const compEl = document.getElementById('ach-modal-comp');
  const awardEl = document.getElementById('ach-modal-award');
  const descEl = document.getElementById('ach-modal-desc');
  const dateEl = document.getElementById('ach-modal-date');
  const imgEl = document.getElementById('ach-modal-img');

  if (titleEl) titleEl.textContent = ach.title || '';
  if (studentEl) studentEl.textContent = (ach.studentName || '') + (ach.rollNo ? ` (${ach.rollNo})` : '');
  if (compEl) compEl.textContent = ach.competition || '';
  if (awardEl) awardEl.textContent = ach.award || '';
  if (descEl) descEl.textContent = ach.description || '';
  if (dateEl) dateEl.textContent = formatDate(ach.date);
  if (imgEl) {
    if (isValidHttpUrl(ach.image)) {
      imgEl.src = ach.image;
      imgEl.style.display = 'block';
    } else {
      imgEl.style.display = 'none';
    }
  }
  modal.classList.add('open');
}

/* ── NOTICES & ACHIEVEMENTS BACKEND SYNC ────────────────────────────────────*/
async function fetchNoticesFromBackend() {
  const apiBase = getApiBaseUrl();
  if (!apiBase) {
    renderNotices();
    return;
  }
  try {
    const res = await fetch(`${apiBase}/api/notices`);
    if (res.ok) {
      const notices = await res.json();
      if (Array.isArray(notices)) {
        App.data.notices = notices;
        saveData();
      }
    }
  } catch (e) {
    console.warn('Backend notices unreachable, using local data:', e);
  } finally {
    renderNotices();
  }
}

async function fetchAchievementsFromBackend() {
  const apiBase = getApiBaseUrl();
  if (!apiBase) {
    renderAchievements();
    return;
  }
  try {
    const res = await fetch(`${apiBase}/api/achievements`);
    if (res.ok) {
      const achievements = await res.json();
      if (Array.isArray(achievements)) {
        App.data.achievements = achievements;
        saveData();
      }
    }
  } catch (e) {
    console.warn('Backend achievements unreachable, using local data:', e);
  } finally {
    renderAchievements();
  }
}


/* ── TIMETABLE (S7, S5, S3 MRE All on One Page) ─────────────────────────────*/
let currentDay = '';
let lastTrackedDate = '';
let userSelectedDay = false;
let activeClassFilter = 'all'; // 'all', 'S7 MRE', 'S5 MRE', 'S3 MRE'

function renderTimetable() {
  if (!App.data.timetable || !App.data.timetable.days) {
    App.data.timetable = window.DEFAULT_NOTICE_DATA.timetable;
  }
  const days     = Object.keys(App.data.timetable.days);
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const todayDateString = new Date().toDateString();
  const today    = dayNames[new Date().getDay()];

  // If date rollover occurred overnight, clear manual user selection and recompute to today
  if (lastTrackedDate !== todayDateString) {
    lastTrackedDate = todayDateString;
    userSelectedDay = false;
  }

  if (!userSelectedDay || !days.includes(currentDay)) {
    currentDay = days.includes(today) ? today : days[0];
  }

  // Day pills
  const pillsEl = document.getElementById('day-pills');
  if (pillsEl) {
    pillsEl.innerHTML = '';
    days.forEach(d => {
      const pill = document.createElement('button');
      pill.className = 'day-pill' + (d === currentDay ? ' active' : '') + (d === today ? ' today' : '');
      pill.innerHTML = `<span>${d}</span>${d === today ? '<span class="today-dot" title="Today">●</span>' : ''}`;
      pill.onclick = () => {
        currentDay = d;
        userSelectedDay = true;
        renderTimetable();
      };
      pillsEl.appendChild(pill);
    });
  }

  // Update day label
  const dayLabel = document.getElementById('tt-day-label');
  if (dayLabel) {
    dayLabel.textContent = `Showing S7, S5, and S3 MRE schedules for ${currentDay}${currentDay === today ? ' (Today)' : ''}`;
  }

  // Bind Class Filter buttons if present
  const filterBtns = document.querySelectorAll('.tt-filter-pill');
  filterBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.class === activeClassFilter);
    btn.onclick = () => {
      activeClassFilter = btn.dataset.class;
      filterBtns.forEach(b => b.classList.toggle('active', b.dataset.class === activeClassFilter));
      renderTimetableCards();
    };
  });

  renderTimetableCards();
}

function renderTimetableCards() {
  const container = document.getElementById('tt-classes-grid');
  if (!container) return;
  container.innerHTML = '';

  const daySchedule = App.data.timetable.days[currentDay] || {};
  const allClasses = App.data.timetable.classes || ["S7 MRE", "S5 MRE", "S3 MRE"];
  const classesToRender = activeClassFilter === 'all'
    ? allClasses
    : allClasses.filter(c => c === activeClassFilter);

  const now = new Date();
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const today = dayNames[now.getDay()];
  const isToday = currentDay === today;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const classMeta = {
    'S7 MRE': { title: 'Semester 7 Mechatronics', badge: 'Final Year', icon: '🤖' },
    'S5 MRE': { title: 'Semester 5 Mechatronics', badge: 'Third Year', icon: '⚙️' },
    'S3 MRE': { title: 'Semester 3 Mechatronics', badge: 'Second Year', icon: '⚡' }
  };

  classesToRender.forEach(cls => {
    const periods = daySchedule[cls] || [];
    const meta = classMeta[cls] || { title: cls, badge: 'MRE', icon: '📚' };

    const card = document.createElement('div');
    card.className = 'tt-class-card';
    card.id = `tt-card-${cls.replace(/\s+/g,'-')}`;

    let rowsHTML = '';
    if (periods.length === 0) {
      rowsHTML = `<tr><td colspan="5" class="tt-empty-day">No periods scheduled for ${cls} on ${currentDay}.</td></tr>`;
    } else {
      periods.forEach(p => {
        const isLunch = /lunch/i.test(p.period) || /lunch/i.test(p.subject);
        const isBreak = isLunch || /break/i.test(p.period) || /break/i.test(p.subject);
        const isCurrent = !isBreak && isToday && isCurrentPeriod(p.time, nowMin);

        if (isBreak) {
          rowsHTML += `
            <tr class="tt-row break-row">
              <td colspan="5" class="tt-break-cell">
                <span class="tt-break-pill">${isLunch ? '🍱' : '☕'} ${escapeHTML(p.subject)} &nbsp;·&nbsp; ${escapeHTML(p.time)}</span>
              </td>
            </tr>`;
        } else {
          rowsHTML += `
            <tr class="tt-row ${isCurrent ? 'current-period' : ''}">
              <td class="tt-period"><span class="period-badge">${escapeHTML(p.period)}</span></td>
              <td class="tt-time">${escapeHTML(p.time)}</td>
              <td class="tt-subject">
                <span class="tt-sub-name">${escapeHTML(p.subject)}</span>
                ${isCurrent ? '<span class="now-badge">● LIVE NOW</span>' : ''}
              </td>
              <td class="tt-code-col"><span class="tt-code">${escapeHTML(p.code || '')}</span></td>
              <td class="tt-teacher">${escapeHTML(p.teacher || '')}</td>
            </tr>`;
        }
      });
    }

    card.innerHTML = `
      <div class="tt-card-header">
        <div class="tt-card-header-left">
          <div class="tt-card-icon">${meta.icon}</div>
          <div>
            <div class="tt-card-title">${cls} &mdash; ${meta.title}</div>
          </div>
        </div>
        <span class="tt-card-badge">${meta.badge}</span>
      </div>
      <div class="tt-table-wrap">
        <table class="timetable-table" role="table" aria-label="${cls} timetable for ${currentDay}">
          <thead>
            <tr>
              <th style="width:65px">Period</th>
              <th style="width:110px">Time</th>
              <th>Subject</th>
              <th style="width:90px">Code</th>
              <th>Faculty</th>
            </tr>
          </thead>
          <tbody>${rowsHTML}</tbody>
        </table>
      </div>`;

    container.appendChild(card);
  });
}

function isCurrentPeriod(timeStr, nowMin) {
  const match = timeStr.match(/(\d{2}):(\d{2})[–-](\d{2}):(\d{2})/);
  if (!match) return false;
  const start = parseInt(match[1]) * 60 + parseInt(match[2]);
  const end   = parseInt(match[3]) * 60 + parseInt(match[4]);
  return nowMin >= start && nowMin < end;
}

/* ── WEATHER ─────────────────────────────────────────────────────────────────*/
const WEATHER_ICONS = {
  'sunny':          '☀️',  'clear':         '🌤️',
  'partly-cloudy':  '⛅',  'cloudy':        '☁️',
  'rain':           '🌧️',  'drizzle':       '🌦️',
  'thunder':        '⛈️',  'snow':          '❄️',
  'fog':            '🌫️',  'windy':         '💨',
};

function getWeatherIcon(icon) { return WEATHER_ICONS[icon] || '🌡️'; }

async function fetchWeather() {
  const cfg = App.data.config;
  // Try custom endpoint first
  if (cfg.weatherEndpoint) {
    try {
      const res = await fetch(cfg.weatherEndpoint, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const d = await res.json();
        App.data._weather = d;
        renderWeather();
        updateHeaderWeather();
        return;
      }
    } catch(e) { console.warn('Custom weather endpoint failed, falling back.'); }
  }

  // Open-Meteo fallback
  try {
    const lat = cfg.weatherLat || 9.9312;
    const lon = cfg.weatherLon || 76.2673;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,apparent_temperature,surface_pressure&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto&forecast_days=4`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const raw = await res.json();
      App.data._weather = parseOpenMeteo(raw, cfg.weatherCity);
      renderWeather();
      updateHeaderWeather();
      return;
    }
  } catch(e) { console.warn('Open-Meteo failed, using fallback data.'); }

  // Static fallback
  App.data._weather = App.data.weatherFallback;
  renderWeather();
  updateHeaderWeather();
  checkSunsetTheme();
}

function parseOpenMeteo(raw, city) {
  const cur    = raw.current || {};
  const daily  = raw.daily   || {};
  const hourly = raw.hourly  || {};
  const wmoIcon = code => {
    if (code === 0 || code === 1) return 'sunny';
    if (code <= 3)  return 'partly-cloudy';
    if (code <= 49) return 'fog';
    if (code <= 67) return 'rain';
    if (code <= 77) return 'snow';
    if (code <= 82) return 'rain';
    return 'thunder';
  };
  const wmoDesc = code => {
    if (code === 0)  return 'Clear Sky';
    if (code <= 3)  return 'Partly Cloudy';
    if (code <= 49) return 'Foggy';
    if (code <= 67) return 'Rain';
    if (code <= 77) return 'Snow';
    if (code <= 82) return 'Rain Showers';
    return 'Thunderstorm';
  };
  const dayNames = ['Today','Tomorrow'];
  const dn = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  // Parse sunrise & sunset
  if (daily.sunrise?.[0] && daily.sunset?.[0]) {
    App.sunsetTimes = {
      sunrise: new Date(daily.sunrise[0]),
      sunset:  new Date(daily.sunset[0])
    };
    checkSunsetTheme();
  }

  // Hourly – next 5 upcoming chronologically across midnight using timestamps
  const nowTs = Date.now();
  const hours = (hourly.time || [])
    .map((t, i) => ({
      ts: new Date(t).getTime(),
      t,
      temp: hourly.temperature_2m?.[i],
      pop: hourly.precipitation_probability?.[i],
      code: hourly.weather_code?.[i]
    }))
    .filter(h => h.ts > nowTs)
    .slice(0, 5)
    .map(h => ({
      time: new Date(h.t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
      temp: Math.round(h.temp ?? 28),
      icon: wmoIcon(h.code),
      pop: (h.pop ?? 0) + '%'
    }));

  const daily4 = (daily.time || []).slice(0, 4).map((t, i) => ({
    day:       dayNames[i] || dn[new Date(t).getDay()],
    condition: wmoDesc(daily.weather_code?.[i]),
    high:      Math.round(daily.temperature_2m_max?.[i] ?? 30),
    low:       Math.round(daily.temperature_2m_min?.[i] ?? 24),
    icon:      wmoIcon(daily.weather_code?.[i])
  }));

  const nowHour = new Date().getHours();
  const pressureVal = cur.surface_pressure ?? cur.pressure_msl ?? (App.data?.weatherFallback?.pressure) ?? 1012;

  return {
    location:        city || 'Campus',
    temperature:     Math.round(cur.temperature_2m ?? 28),
    feelsLike:       Math.round(cur.apparent_temperature ?? 30),
    condition:       wmoDesc(cur.weather_code ?? 0),
    icon:            wmoIcon(cur.weather_code ?? 0),
    humidity:        Math.round(cur.relative_humidity_2m ?? 75),
    windSpeed:       Math.round(cur.wind_speed_10m ?? 10),
    pressure:        Math.round(pressureVal),
    uvIndex:         '-',
    airQuality:      '-',
    rainProbability: hourly.precipitation_probability?.[nowHour] ?? 0,
    forecast:        hours,
    daily:           daily4
  };
}

function renderWeather() {
  const w = App.data._weather || App.data.weatherFallback;
  const cfg = (App.data && App.data.config) || {};

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  const wIcon = document.getElementById('w-icon');
  if (wIcon) wIcon.textContent = getWeatherIcon(w.icon);
  const wTemp = document.getElementById('w-temp');
  if (wTemp) wTemp.innerHTML = `${w.temperature}<span class="weather-unit">°C</span>`;
  setTxt('w-condition', w.condition);
  setTxt('w-feels', `Feels like ${w.feelsLike}°C`);
  setTxt('w-location', w.location || cfg.weatherCity || 'Campus');
  setTxt('w-humidity', w.humidity + '%');
  setTxt('w-wind', w.windSpeed + ' km/h');
  setTxt('w-pressure', w.pressure + ' hPa');
  setTxt('w-rain', w.rainProbability + '%');

  // Endpoint info
  const epEl = document.getElementById('w-endpoint-info');
  if (epEl) {
    if (cfg.weatherEndpoint) {
      epEl.innerHTML = `🔌 Integrated with custom endpoint: <code>${escapeHTML(cfg.weatherEndpoint)}</code>`;
      epEl.style.display = 'block';
    } else {
      epEl.style.display = 'none';
    }
  }

  // Hourly forecast
  const hourlyEl = document.getElementById('w-hourly');
  if (hourlyEl) {
    hourlyEl.innerHTML = '';
    (w.forecast || []).forEach(h => {
      const item = document.createElement('div');
      item.className = 'forecast-hour';
      item.innerHTML = `
        <div class="fh-time">${escapeHTML(h.time)}</div>
        <div class="fh-icon">${getWeatherIcon(h.icon)}</div>
        <div class="fh-temp">${escapeHTML(String(h.temp))}°</div>
        <div class="fh-pop">${escapeHTML(h.pop)}</div>`;
      hourlyEl.appendChild(item);
    });
    if (!w.forecast || w.forecast.length === 0) {
      hourlyEl.innerHTML = '<div style="color:var(--text-muted);font-size:12px">No hourly data</div>';
    }
  }

  // Daily forecast
  const dailyEl = document.getElementById('w-daily');
  if (dailyEl) {
    dailyEl.innerHTML = '';
    (w.daily || []).forEach(d => {
      const row = document.createElement('div');
      row.className = 'daily-row';
      row.innerHTML = `
        <span class="daily-day">${escapeHTML(d.day)}</span>
        <span class="daily-icon">${getWeatherIcon(d.icon)}</span>
        <span class="daily-condition">${escapeHTML(d.condition)}</span>
        <span class="daily-temps">
          <span class="daily-high">${escapeHTML(String(d.high))}°</span>
          <span class="daily-low">${escapeHTML(String(d.low))}°</span>
        </span>`;
      dailyEl.appendChild(row);
    });
  }
}

function updateHeaderWeather() {
  const w = App.data._weather || App.data.weatherFallback;
  document.getElementById('hw-icon').textContent = getWeatherIcon(w.icon);
  document.getElementById('hw-temp').textContent = w.temperature + '°C';
  document.getElementById('hw-cond').textContent = w.condition;
}

function scheduleWeatherRefresh() {
  clearInterval(App.weatherRefreshTimer);
  const mins = (App.data.config.weatherRefreshInterval || 10) * 60 * 1000;
  App.weatherRefreshTimer = setInterval(fetchWeather, mins);
}

/* ── SUNSET AUTOMATIC DARK THEME ─────────────────────────────────────────── */
App.sunsetTimes = null;
App.themeOverride = null; // null = auto (sunset-based), or 'dark' / 'light' for preview

function getCampusSunTimes() {
  const now = new Date();
  // Standard astronomical solar times for Kochi (lat ~9.93, lon ~76.27):
  // Sunrise ~06:18 AM, Sunset ~06:22 PM
  const sunrise = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 18, 0);
  const sunset  = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 22, 0);
  return { sunrise, sunset };
}

function checkSunsetTheme() {
  const cfgTheme = (App.data?.config?.theme) || 'auto';

  // If user clicked preview override in current session
  if (App.themeOverride) {
    applyTheme(App.themeOverride, false, `Manual Preview: ${App.themeOverride.toUpperCase()}`);
    return;
  }

  // If configured as fixed theme in settings
  if (cfgTheme === 'dark') {
    applyTheme('dark', true, 'Dark Theme (Fixed in Settings)');
    return;
  }
  if (cfgTheme === 'light') {
    applyTheme('light', false, 'Light Theme (Fixed in Settings)');
    return;
  }

  // Automatic sunset mode (Default):
  // After sunset or before sunrise -> Dark Theme
  // After sunrise and before sunset -> Light Theme
  const now = new Date();
  const times = App.sunsetTimes || getCampusSunTimes();
  const isPostSunset = (now >= times.sunset || now < times.sunrise);

  const sunsetStr = times.sunset.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const statusDesc = isPostSunset
    ? `🌙 Night Mode (Post-Sunset ${sunsetStr})`
    : `☀️ Day Mode (Sunset at ${sunsetStr})`;

  applyTheme(isPostSunset ? 'dark' : 'light', isPostSunset, statusDesc);
}

function applyTheme(theme, isPostSunset, statusDesc) {
  const isDark = (theme === 'dark');
  document.documentElement.classList.toggle('dark-theme', isDark);
  document.body.classList.toggle('dark-theme', isDark);
  document.documentElement.setAttribute('data-theme', theme);

  const iconEl = document.getElementById('theme-badge-icon');
  const textEl = document.getElementById('theme-badge-text');
  const toggleBtn = document.getElementById('theme-toggle-btn');

  if (iconEl) iconEl.textContent = isDark ? '🌙' : '☀️';
  if (textEl) textEl.textContent = isDark ? 'Night Mode' : 'Day Mode';
  if (toggleBtn) {
    toggleBtn.title = `${statusDesc || (isDark ? 'Dark Theme' : 'Light Theme')} — Click to preview/cycle`;
    toggleBtn.classList.toggle('is-dark', isDark);
  }

  const sunsetInfo = document.getElementById('settings-sunset-info');
  if (sunsetInfo) {
    const times = App.sunsetTimes || getCampusSunTimes();
    const sStr = times.sunset.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    sunsetInfo.textContent = `Today's campus sunset: ${sStr}. Auto mode switches to dark theme after sunset.`;
  }
}

function toggleThemePreview() {
  const isCurrentlyDark = document.body.classList.contains('dark-theme');
  if (App.themeOverride === null) {
    App.themeOverride = isCurrentlyDark ? 'light' : 'dark';
    showToast(`Switched preview to ${App.themeOverride.toUpperCase()} theme (Click to return to Auto)`, 'info');
  } else if (App.themeOverride === 'dark') {
    App.themeOverride = 'light';
    showToast('Switched preview to LIGHT theme', 'info');
  } else {
    App.themeOverride = null;
    showToast('Returned to AUTO SUNSET theme', 'success');
  }
  checkSunsetTheme();
}

/* ── THE HINDU LIVE FLASH NEWS TICKER ───────────────────────────────────────*/
const THE_HINDU_DEFAULT_HEADLINES = [
  { title: "IIT Madras, ISRO develop 3D-printed rocket engines for deep-space payloads", category: "Science & Tech", time: "Just now" },
  { title: "Mechatronics & Robotics in Industry 5.0: Manufacturing sector adopts autonomous AI cells", category: "Technology", time: "10m ago" },
  { title: "Kerala Startup Mission announces ₹50 crore seed fund for university hardware & IoT innovators", category: "National", time: "25m ago" },
  { title: "India's renewable energy capacity crosses 200 GW milestone, Ministry confirms", category: "Economy", time: "40m ago" },
  { title: "ISRO prepares for Gaganyaan mission with indigenously built humanoid robot Vyommitra", category: "Space", time: "1h ago" },
  { title: "National Education Policy: Technical institutions urged to scale up embedded systems research", category: "Education", time: "1h ago" },
  { title: "Smart City Kochi expands IoT sensor networks for real-time flood monitoring and air quality indexing", category: "Kerala", time: "2h ago" },
  { title: "AICTE releases updated curriculum guidelines for Robotics, Automation & Cyber-Physical Systems", category: "Academia", time: "2h ago" },
  { title: "Automated guided vehicles (AGVs) witness 40% rise in adoption across Indian logistics hubs", category: "Industry", time: "3h ago" }
];

App.theHinduHeadlines = [...THE_HINDU_DEFAULT_HEADLINES];
App.newsRefreshTimer = null;

async function fetchTheHinduHeadlines() {
  const RSS_URL = 'https://www.thehindu.com/news/national/feeder/default.rss';
  const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(RSS_URL)}`;

  try {
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'ok' && Array.isArray(data.items) && data.items.length > 0) {
        const liveItems = data.items.map(item => ({
          title: item.title ? item.title.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"') : '',
          link: item.link || '',
          category: item.categories?.[0] || 'National',
          time: item.pubDate ? new Date(item.pubDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Live'
        })).filter(h => h.title);

        if (liveItems.length > 0) {
          App.theHinduHeadlines = liveItems;
          renderFlashNewsTicker();
          return;
        }
      }
    }
  } catch(err) {
    console.warn('The Hindu RSS direct fetch fell back to curated live feed:', err.message);
  }

  // Fallback to rich curated live headlines
  renderFlashNewsTicker();
}

function renderFlashNewsTicker() {
  const track = document.getElementById('fnt-marquee-track');
  if (!track) return;

  const items = (App.theHinduHeadlines && App.theHinduHeadlines.length > 0)
    ? App.theHinduHeadlines
    : THE_HINDU_DEFAULT_HEADLINES;

  const isLive = Boolean(App.theHinduHeadlines && App.theHinduHeadlines.length > 0);
  const badge = document.querySelector('.flash-news-badge');
  if (badge) {
    badge.textContent = isLive ? 'FLASH NEWS' : 'CAMPUS NEWS';
  }
  const liveBadge = document.querySelector('.fnt-live-badge');
  if (liveBadge) {
    liveBadge.textContent = isLive ? '● LIVE FEED' : '○ ARCHIVE FEED';
    liveBadge.style.color = isLive ? 'var(--accent-green)' : 'var(--text-muted)';
  }

  const buildItemsHTML = (list) => list.map(item => {
    const safeLink = isValidHttpUrl(item.link) ? item.link : '';
    return `
      <span class="fnt-item" ${safeLink ? `data-href="${escapeHTML(safeLink)}" style="cursor:pointer;"` : ''}>
        <span class="fnt-item-bullet">✦</span>
        <span class="fnt-item-cat">${escapeHTML(item.category || 'National')}</span>
        <span class="fnt-item-title">${escapeHTML(item.title || '')}</span>
        <span class="fnt-item-time">${escapeHTML(item.time || '')}</span>
      </span>
    `;
  }).join('');

  track.innerHTML = buildItemsHTML(items) + buildItemsHTML(items);

  // Safe click delegation without inline event handlers
  track.onclick = (e) => {
    const itemEl = e.target.closest('.fnt-item[data-href]');
    if (itemEl) {
      const url = itemEl.dataset.href;
      if (isValidHttpUrl(url)) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    }
  };
}

function scheduleNewsRefresh() {
  clearInterval(App.newsRefreshTimer);
  App.newsRefreshTimer = setInterval(fetchTheHinduHeadlines, 15 * 60 * 1000);
}

/* ── Utility ─────────────────────────────────────────────────────────────────*/
function formatDate(str) {
  if (!str) return '';
  try { return new Date(str).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}); }
  catch(e) { return str; }
}

/* ── Fullscreen ──────────────────────────────────────────────────────────────*/
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

/* ── Init ────────────────────────────────────────────────────────────────────*/
document.addEventListener('DOMContentLoaded', () => {
  loadData();

  // Clock
  updateClock();
  setInterval(updateClock, 1000);

  // Wire both desktop and mobile navigation buttons
  document.querySelectorAll('.nav-btn[data-view], .mobile-nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Search
  const searchInput = document.getElementById('notice-search');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      noticeSearchStr = e.target.value.trim();
      renderNotices();
    });
  }

  // Notice modal close
  document.getElementById('notice-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget || e.target.classList.contains('modal-close'))
      e.currentTarget.classList.remove('open');
  });

  // Achievement modal close
  document.getElementById('ach-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget || e.target.classList.contains('modal-close'))
      e.currentTarget.classList.remove('open');
  });

  // Fullscreen btn
  document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);

  // Admin trigger
  document.getElementById('admin-trigger-btn').addEventListener('click', () => {
    document.getElementById('admin-login-screen').classList.add('open');
    document.getElementById('login-error').classList.remove('visible');
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
  });

  // Pause kiosk on mouse move / touch on main content
  const mainContent = document.getElementById('main-content');
  let pauseTimeout;
  const pauseKiosk = () => {
    App.kioskPaused = true;
    clearTimeout(pauseTimeout);
    pauseTimeout = setTimeout(() => { App.kioskPaused = false; }, 8000);
  };
  mainContent.addEventListener('mousemove', pauseKiosk);
  mainContent.addEventListener('touchstart', pauseKiosk);

  // College Logo Upload Listener
  const logoInput = document.getElementById('college-logo-input');
  if (logoInput) {
    logoInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        showToast('Please select a valid image file (PNG, JPG, SVG, WebP)', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        App.data.config.collegeLogo = ev.target.result;
        saveData();
        updateCollegeLogoDisplay();
        showToast('College logo uploaded successfully!', 'success');
      };
      reader.readAsDataURL(file);
    });
  }

  // Theme toggle button listener
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', toggleThemePreview);
  }

  // Load backend data if configured, then render
  loadCollegeLogo();
  fetchNoticesFromBackend();
  fetchAchievementsFromBackend();
  schedulePiHealthCheck();

  // Initial render & kiosk start
  switchView('notices');
  checkSunsetTheme();
  updateUrgentBanner();
  updateCollegeLogoDisplay();
  startKiosk();
  fetchWeather();
  scheduleWeatherRefresh();

  // Initialize and run The Hindu Flash News Ticker
  renderFlashNewsTicker();
  fetchTheHinduHeadlines();
  scheduleNewsRefresh();

  // Update board branding
  const boardInst = document.getElementById('board-institution');
  if (boardInst) boardInst.textContent = App.data.config.institution || 'Department of Mechatronics Engineering';
  const boardTitle = document.getElementById('board-title');
  if (boardTitle) boardTitle.textContent = App.data.config.boardTitle || '';
});

/* ── College Logo Display Helper ────────────────────────────────────────────*/
function updateCollegeLogoDisplay() {
  const logoImg = document.getElementById('college-logo-img');
  const placeholder = document.getElementById('logo-placeholder');
  const uploadHint = document.getElementById('logo-upload-hint');
  const logoWrap = document.getElementById('college-logo-wrap');
  let logoData = App.data.config && App.data.config.collegeLogo;
  const apiBase = getApiBaseUrl();

  if (logoData && typeof logoData === 'string' && logoData.startsWith('/') && apiBase) {
    logoData = `${apiBase}${logoData}`;
  }

  if (logoImg) {
    if (logoData) {
      logoImg.src = logoData;
      logoImg.style.display = 'block';
      if (placeholder) placeholder.style.display = 'none';
      if (uploadHint) uploadHint.textContent = 'Change';
      if (logoWrap) logoWrap.classList.add('has-logo');
    } else {
      logoImg.src = '';
      logoImg.style.display = 'none';
      if (placeholder) placeholder.style.display = 'block';
      if (uploadHint) uploadHint.textContent = 'Upload';
      if (logoWrap) logoWrap.classList.remove('has-logo');
    }
  }

  // Sync settings panel preview if present
  const setPreview = document.getElementById('set-logo-preview');
  const setEmpty = document.getElementById('set-logo-preview-empty');
  const setRemoveBtn = document.getElementById('set-logo-remove-btn');
  if (setPreview) {
    if (logoData) {
      setPreview.src = logoData;
      setPreview.style.display = 'block';
      if (setEmpty) setEmpty.style.display = 'none';
      if (setRemoveBtn) setRemoveBtn.style.display = 'inline-flex';
    } else {
      setPreview.src = '';
      setPreview.style.display = 'none';
      if (setEmpty) setEmpty.style.display = 'block';
      if (setRemoveBtn) setRemoveBtn.style.display = 'none';
    }
  }
}

// Expose globally for admin.js
window.App         = App;
window.saveData    = saveData;
window.loadData    = loadData;
window.showToast   = showToast;
window.renderNotices      = renderNotices;
window.renderAchievements = renderAchievements;
window.renderTimetable    = renderTimetable;
window.renderWeather      = renderWeather;
window.updateUrgentBanner = updateUrgentBanner;
window.updateCollegeLogoDisplay = updateCollegeLogoDisplay;
window.startKiosk         = startKiosk;
window.stopKiosk          = stopKiosk;
window.fetchWeather        = fetchWeather;
window.scheduleWeatherRefresh = scheduleWeatherRefresh;
window.updateHeaderWeather = updateHeaderWeather;
window.checkSunsetTheme   = checkSunsetTheme;
window.toggleThemePreview = toggleThemePreview;
window.applyTheme         = applyTheme;
window.isNoticeExpired    = isNoticeExpired;
window.fetchTheHinduHeadlines = fetchTheHinduHeadlines;
window.switchView  = switchView;
window.escapeHTML  = escapeHTML;
window.formatDate  = formatDate;
window.uid         = uid;
window.checkPiHealth = checkPiHealth;
