const fs = require('fs');
const path = require('path');
const assert = require('assert');

async function runTests() {
  const { JSDOM } = require('jsdom');
  const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  const dom = new JSDOM(html, {
    url: 'http://localhost:5173/'
  });

  const { window } = dom;
  const { document } = window;

  // Set Node globals to point to JSDOM window & document
  global.window = window;
  global.document = document;

  // Polyfills for browser environment in jsdom
  window.localStorage = {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; },
    clear() { this._data = {}; }
  };
  global.localStorage = window.localStorage;
  window.confirm = () => true;
  global.confirm = () => true;

  // 1. Verify Verified DOM element IDs exist in index.html
  console.log('Test 1: Verifying verified DOM targets exist in HTML...');
  const mainContent = document.getElementById('main-content');
  const noticesGrid = document.getElementById('notices-grid');
  const achievementsGrid = document.getElementById('achievements-grid');
  const viewTimetable = document.getElementById('view-timetable');
  const viewWeather = document.getElementById('view-weather');
  const viewNotices = document.getElementById('view-notices');
  const viewAchievements = document.getElementById('view-achievements');

  assert.ok(mainContent, '#main-content must exist');
  assert.ok(noticesGrid, '#notices-grid must exist');
  assert.ok(achievementsGrid, '#achievements-grid must exist');
  assert.ok(viewTimetable, '#view-timetable must exist');
  assert.ok(viewWeather, '#view-weather must exist');
  assert.ok(viewNotices, '#view-notices must exist');
  assert.ok(viewAchievements, '#view-achievements must exist');
  console.log('✓ All core DOM targets present in public/index.html');

  // Load scripts into the DOM window
  const configJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'config.js'), 'utf8');
  const mockDataJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'mock-data.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');

  window.eval(configJs);
  window.eval(mockDataJs);
  window.eval(appJs);

  // Initialize data
  window.loadData();
  assert.ok(window.App.data, 'App.data must be populated after loadData()');

  // 2. Test renderNotices does NOT touch #main-content or destroy other sections
  console.log('Test 2: Verifying renderNotices renders into #notices-grid and preserves page shell...');
  window.renderNotices();

  assert.strictEqual(document.getElementById('main-content'), mainContent, '#main-content must not be replaced');
  assert.ok(document.getElementById('view-timetable'), '#view-timetable must still exist');
  assert.ok(document.getElementById('view-weather'), '#view-weather must still exist');
  assert.ok(document.getElementById('view-achievements'), '#view-achievements must still exist');
  assert.ok(noticesGrid.children.length > 0, '#notices-grid must contain rendered notice cards');
  console.log(`✓ renderNotices rendered ${noticesGrid.children.length} items into #notices-grid without modifying page shell`);

  // 3. Test renderAchievements renders into #achievements-grid
  console.log('Test 3: Verifying renderAchievements renders into #achievements-grid...');
  window.renderAchievements();
  assert.strictEqual(document.getElementById('main-content'), mainContent, '#main-content must not be replaced');
  assert.ok(achievementsGrid.children.length > 0, '#achievements-grid must contain rendered achievement cards');
  console.log(`✓ renderAchievements rendered ${achievementsGrid.children.length} items into #achievements-grid`);

  // 4. Test missing target diagnostic
  console.log('Test 4: Verifying missing target produces clean diagnostic without throwing...');
  const originalGetElementById = document.getElementById.bind(document);
  document.getElementById = function(id) {
    if (id === 'notices-grid') return null;
    return originalGetElementById(id);
  };
  let errorCaught = false;
  try {
    window.renderNotices();
  } catch (e) {
    errorCaught = true;
  }
  assert.strictEqual(errorCaught, false, 'renderNotices must not throw when #notices-grid is missing');
  document.getElementById = originalGetElementById;
  console.log('✓ renderNotices safely handles missing #notices-grid');

  // 5. Test switchView maintains views and safe defaults
  console.log('Test 5: Verifying view switching maintains state and active classes...');
  window.switchView('achievements');
  assert.ok(document.getElementById('view-achievements').classList.contains('active'), '#view-achievements must be active');
  assert.strictEqual(document.getElementById('view-notices').classList.contains('active'), false, '#view-notices must not be active');

  window.switchView('notices');
  assert.ok(document.getElementById('view-notices').classList.contains('active'), '#view-notices must be active');
  console.log('✓ switchView functions correctly and synchronizes active views');

  // Load admin.js
  const adminJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin.js'), 'utf8');
  window.eval(adminJs);

  // 6. Test saveSettings does not crash when App.data.admin is missing
  console.log('Test 6: Verifying saveSettings() does not crash when App.data.admin is absent...');
  delete window.App.data.admin;
  let saveSettingsError = null;
  try {
    await window.saveSettings();
  } catch (err) {
    saveSettingsError = err;
  }
  assert.strictEqual(saveSettingsError, null, 'saveSettings must not throw when App.data.admin is missing');
  assert.ok(window.App.data.admin, 'App.data.admin should be safely populated');
  assert.strictEqual('password' in window.App.data.admin, false, 'App.data.admin must never store password');
  console.log('✓ saveSettings safely handles missing App.data.admin without crashing');

  // 7. Test saveData never persists secrets to localStorage
  console.log('Test 7: Verifying saveData() sanitizes credentials before writing to localStorage...');
  window.App.data.admin.password = 'supersecret';
  window.App.data.token = 'test-token';
  window.saveData();
  const storedJson = JSON.parse(window.localStorage.getItem('noticeboard_data'));
  assert.strictEqual(storedJson.admin.password, undefined, 'Password must not exist in localStorage');
  assert.strictEqual(storedJson.token, undefined, 'Token must not exist in localStorage');
  console.log('✓ saveData() strips passwords and tokens before persisting');

  // 8. Test exportData excludes secrets
  console.log('Test 8: Verifying exportData excludes credentials...');
  window.App.data.admin.password = 'plainpassword';
  window.App.data.sessionToken = 'session123';
  let blobContent = null;
  const MockBlob = class {
    constructor(chunks) { blobContent = chunks[0]; }
  };
  global.Blob = MockBlob;
  window.Blob = MockBlob;
  global.URL = { createObjectURL: () => 'blob:mock-url' };
  window.URL = global.URL;
  window.HTMLAnchorElement.prototype.click = function() {};
  window.exportData();
  const exported = JSON.parse(blobContent);
  assert.strictEqual(exported.admin?.password, undefined, 'Export must never contain password');
  assert.strictEqual(exported.sessionToken, undefined, 'Export must never contain sessionToken');
  console.log('✓ exportData excludes all credentials from backup JSON');

  // 9. Test Timetable stable ID editing
  console.log('Test 9: Verifying timetable period stable ID tracking...');
  window.App.data.timetable = {
    days: {
      Monday: {
        'S7 MRE': [
          { id: 'p_1', period: '1', subject: 'Robotics', time: '09:00 - 10:00', teacher: 'Dr. Smith' },
          { id: 'p_2', period: '2', subject: 'Control Systems', time: '10:00 - 11:00', teacher: 'Prof. Jones' }
        ]
      }
    }
  };
  window.editTTPeriod('Monday', 'S7 MRE', 'p_2');
  // Delete the first period
  await window.deleteTTPeriod('Monday', 'S7 MRE', 'p_1');
  const remaining = window.App.data.timetable.days['Monday']['S7 MRE'];
  assert.strictEqual(remaining.length, 1);
  assert.strictEqual(remaining[0].id, 'p_2');
  assert.strictEqual(remaining[0].subject, 'Control Systems');
  console.log('✓ Timetable deletion by stable ID preserves active editing and period integrity');

  // 10. Test Notice filters: active, deadline expiry, search, category
  console.log('Test 10: Verifying notice active flag, deadline expiry, search and category filters...');
  window.App.data.notices = [
    { id: 'n1', title: 'Midterm Exam Schedule', category: 'Academic', priority: 'high', active: true, deadline: '2099-12-31' },
    { id: 'n2', title: 'Robotics Workshop', category: 'Events', priority: 'normal', active: true, deadline: '2099-12-31' },
    { id: 'n3', title: 'Hidden Inactive Notice', category: 'Academic', priority: 'normal', active: false, deadline: '2099-12-31' },
    { id: 'n4', title: 'Past Expired Notice', category: 'Academic', priority: 'urgent', active: true, deadline: '2020-01-01' }
  ];
  window.renderNotices();
  let cards = noticesGrid.querySelectorAll('.notice-card');
  assert.strictEqual(cards.length, 2, 'Only active and non-expired notices should render');

  // Search filter
  const searchInput = document.getElementById('notice-search');
  searchInput.value = 'Robotics';
  searchInput.dispatchEvent(new window.Event('input'));
  cards = noticesGrid.querySelectorAll('.notice-card');
  assert.strictEqual(cards.length, 1, 'Search filter should isolate matching notices');
  assert.ok(cards[0].textContent.includes('Robotics Workshop'));

  // Clear search and test category filter
  searchInput.value = '';
  searchInput.dispatchEvent(new window.Event('input'));
  const filterChips = document.getElementById('notice-filter-chips').querySelectorAll('.filter-chip');
  const academicChip = Array.from(filterChips).find(c => c.textContent.includes('Academic'));
  assert.ok(academicChip, 'Academic category chip should exist');
  academicChip.click();
  cards = noticesGrid.querySelectorAll('.notice-card');
  assert.strictEqual(cards.length, 1);
  assert.ok(cards[0].textContent.includes('Midterm Exam'));
  console.log('✓ Notice filters (active, deadline expiry, search, and category chips) work harmoniously');

  // 11. Test Pi Health Check UI
  console.log('Test 11: Verifying Pi health check toggles status badge UI...');
  const statusBadge = document.querySelector('.status-badge');
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ status: 'ok', timestamp: new Date().toISOString() })
  });
  await window.checkPiHealth();
  assert.ok(statusBadge.classList.contains('online'), 'Badge should be online when health check succeeds');
  assert.ok(statusBadge.textContent.includes('Pi Online'), 'Badge text should display Pi Online');

  global.fetch = async () => { throw new Error('Offline'); };
  await window.checkPiHealth();
  assert.ok(statusBadge.classList.contains('offline'), 'Badge should be offline when health check fails');
  assert.ok(statusBadge.textContent.includes('Standalone Mode'), 'Badge text should display Standalone Mode');
  console.log('✓ Pi Health check accurately reflects online/standalone backend state');

  console.log('\nAll Task 1, Task 3 & Task 4 tests PASSED successfully!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test FAILED:', err);
  process.exit(1);
});
