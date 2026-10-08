# Changelog

All notable changes and task progress for the IoT Smart Notice Board project are documented in this file.

---

## [Task 0] — Baseline Audit and Plan
- **Date**: 2026-10-08
- **Issues Audited**:
  - Identified frontend entry point `public/index.html` with verified DOM elements: `#notices-grid`, `#achievements-grid`, `#tt-classes-grid`, `#day-pills`, `#view-*`, `#header`, `#header-weather`, `#clock-time`, `#clock-date`, `.status-badge`.
  - Identified frontend script loading in `public/index.html`: `js/mock-data.js` -> `js/app.js` -> `js/admin.js`.
  - Identified state model: `window.DEFAULT_NOTICE_DATA` in `mock-data.js` and `App.data` in `app.js` backed by `localStorage` (`noticeboard_data`).
  - Identified critical rendering defect in `public/js/app.js`: `renderNotices()` erroneously targets `document.getElementById('notices-container') || document.getElementById('main-content')`, destroying the `#main-content` page shell and removing weather, timetable, achievements, and navigation. Similarly `renderAchievements()` targets `#achievements-container` instead of `#achievements-grid`.
  - Identified backend state: `cors.txt` contains the baseline Flask backend with several defects (`pasword` typo, unimported `send_from_directory`, invalid `SETTINGS_FILE` expression, hardcoded admin credentials, lack of token auth, wildcard CORS, `load_json` returning `[]` for dict schemas, and no timetable/health routes).
  - Identified deployment scripts and config: `package.json` had `"dev"` and `"start"` serving `.` instead of `public/`, and missing `"build"` script needed by `.github/workflows/firebase-hosting-*.yml`. Root `.gitignore` lacked `.env*`, python caches, and data directory exclusions.
  - Verified `RTK.md`: searched repository and found 0 references; confirmed it is not an existing documentation dependency.
- **Files Inspected**:
  - `public/index.html`
  - `public/js/app.js`
  - `public/js/admin.js`
  - `public/js/mock-data.js`
  - `cors.txt`
  - `package.json`
  - `firebase.json`
  - `.github/workflows/firebase-hosting-merge.yml`
  - `.github/workflows/firebase-hosting-pull-request.yml`
  - `.gitignore`
- **Graphify Verification**:
  - Graphify CLI verified and active (`graphify 0.9.71`).
  - Queried graph for frontend entry points, renderers, and call relationships.
  - Confirmed 105 nodes, 169 edges in baseline graph.
- **Plan**:
  - Task 1: Frontend state and safe DOM rendering (Fix renderNotices #notices-grid, renderAchievements #achievements-grid, safe HTML/DOM, unified state assignment).
  - Task 2: Flask API, authentication, CORS, persistence (Repair backend from `cors.txt`, token auth, scoped CORS, atomic JSON, health/timetable/settings routes, tests).
  - Task 3: Admin saves, settings, imports, exports, logo flow (Backend sync, token auth, logo flow, schema validation).
  - Task 4: Notices, navigation, filters, status, weather, timetable (Deadline expiry, search/filter wiring, live Pi health status, weather pressure, break formatting).
  - Task 5: Local startup, package scripts, deployment, ignored files (Serve `public/`, build script, workflows, root `.gitignore`).
  - Task 6: Final handoff and complete documentation (`README.md`, `ARCHITECTURE.md`, `API.md`, `DEPLOYMENT.md`).

---

## [Task 1] — Frontend State and Safe DOM Rendering
- **Date**: 2026-10-08
- **Issues Addressed**:
  - Fixed catastrophic bug where `renderNotices()` targeted `notices-container` or `main-content`, replacing `#main-content` and obliterating weather, timetable, achievements, and navigation. Target corrected to verified `#notices-grid`.
  - Fixed `renderAchievements()` targeting `achievements-container` or `stars-view` instead of verified `#achievements-grid`.
  - Added safe DOM guards in all renderers (`renderNotices`, `renderAchievements`, `renderTimetable`, `renderWeather`) returning diagnostic warnings if elements are absent without corrupting page shell.
  - Implemented safe escaping helper `escapeHTML` and URL validator `isValidHttpUrl` to prevent XSS and unsafe URLs. Removed inline event handlers on notices, achievements, and flash news items.
  - Added `rel="noopener noreferrer"` attributes for external links in flash news ticker and validated schemes (`http:`, `https:`).
  - Standardized application data model: backend fetchers `fetchNoticesFromBackend` and `fetchAchievementsFromBackend` now assign fetched data directly to shared `App.data` before rendering; navigation and admin updates render current shared state cleanly.
  - Standardized renderer argument defaults: both renderers accept optional data arrays (updating shared state) and default to shared `App.data` when arguments are omitted.
  - Added `public/config.js` static configuration to decouple frontend from hardcoded private IP `10.178.192.24`.
  - Fixed timetable break pill to display icon (`🍱` / `☕`) rather than raw boolean string.
  - Fixed weather pressure to read actual `surface_pressure` from Open-Meteo with fallback.
- **Files Changed**:
  - `public/js/app.js`
  - `public/index.html`
  - `public/config.js`
  - `tests/test_frontend_dom.js`
- **Behavior / API Contract Changed**:
  - `renderNotices()` and `renderAchievements()` now populate `#notices-grid` and `#achievements-grid` respectively.
  - Shared state is assigned before rendering.
- **Tests and Checks Run**:
  - Automated DOM test suite: `node tests/test_frontend_dom.js` (passed 5/5 tests). Verified `#notices-grid` and `#achievements-grid` render properly and `#main-content` is never destroyed or mutated.
- **Graphify Status**:
  - Graphify refreshed and verified after Task 1 changes.
- **Unresolved Limitations**:
  - Backend API persistence and authorization to be resolved in Task 2.

---

## [Task 2] — Flask API, Authentication, CORS, and Persistence
- **Date**: 2026-10-08
- **Issues Addressed**:
  - Inspected and repaired baseline Flask code provided in `cors.txt` and integrated it into `backend/app.py` with root entrypoint `app.py`.
  - Fixed typo `pasword` to `password` in login request handler and utilized constant-time comparison (`hmac.compare_digest`) against environment credentials.
  - Imported `send_from_directory` from Flask and fixed `GET /api/logo` route.
  - Removed stray invalid expression `SETTINGS_FILE+"settings.json"` and correctly initialized atomic data storage paths.
  - Fixed JSON loader to return schema-appropriate defaults: empty list `[]` for notices/achievements, and empty dict `{}` for timetable/settings.
  - Replaced wildcard CORS (`*`) with configurable allowed origins via `CORS_ORIGINS` environment variable, supporting preflight OPTIONS, `Authorization`, and `Content-Type` headers.
  - Implemented secure token-based session management (`secrets.token_hex(32)`) with expiration (`TOKEN_EXPIRY_SECONDS`), enforcing `@require_auth` on all mutating routes (`POST /api/notices`, `POST /api/achievements`, `POST /api/timetable`, `POST /api/settings`, `POST /api/upload-logo`).
  - Added public `GET /api/health` endpoint for kiosk status checks.
  - Added dedicated `GET` and `POST` routes for `/api/timetable`.
  - Added atomic JSON file writing (`save_json_atomic`) using temporary files and atomic replacement to protect against power interruption corruption on Raspberry Pi.
  - Implemented safe notice/achievement sync semantics supporting both full-list updates and individual item upserts without appending duplicate records.
  - Added logo upload validation enforcing file extension checks, image MIME type validation, 2MB size cap, and safe storage in configurable `UPLOAD_FOLDER`.
  - Created `requirements.txt` with backend dependencies.
  - Documented full API specifications in `docs/API.md`.
- **Files Changed**:
  - `backend/app.py`
  - `backend/__init__.py`
  - `app.py`
  - `requirements.txt`
  - `tests/test_api.py`
  - `tests/__init__.py`
  - `docs/API.md`
- **Behavior / API Contract Changed**:
  - Login now returns `{ success: true, token: "...", expiresIn: ... }`.
  - Mutating operations require `Authorization: Bearer <token>`.
  - Safe defaults returned for empty stores (`[]` vs `{}`).
- **Tests and Checks Run**:
  - Automated pytest suite: `python -m pytest tests/test_api.py -v` (8 passed in 1.46s).
  - Verified: health check, login success/failure, public reads, unauthorized write rejection, notice sync, timetable/settings persistence with credential stripping, CORS preflight handling.
- **Graphify Status**:
  - Graphify refreshed and verified after Task 2 changes.
- **Unresolved Limitations**:
  - Frontend admin panel integration with Bearer tokens and sync to be connected in Task 3.

---

## [Task 3] — Admin Saves, Settings, Imports, Exports, and Logo Flow
- **Date**: 2026-10-08
- **Issues Addressed**:
  - Fixed disconnect between frontend admin changes and backend persistence: admin saves for notices, achievements, timetable periods, and settings now perform atomic synchronization with the backend API via `syncToBackend()`.
  - Added explicit distinction between local cache updates and backend persistence: UI toasts explicitly notify when changes are synced to backend vs saved locally due to offline/unreachable server or session expiry.
  - Implemented token authentication flow in `public/js/admin.js`: `doLogin()` stores bearer token in `sessionStorage` (`iot_admin_token`) and attaches `Authorization: Bearer <token>` to all mutating API requests. Handled `401`/`403` session expiration by clearing session token and alerting user.
  - Fixed crash in `saveSettings()` and `loadSettings()` when `App.data.admin` is missing or undefined by providing safe fallback objects.
  - Fixed credential leakage and security defects: passwords and tokens are never persisted in `App.data`, never stored in `localStorage`, and stripped completely in `saveData()`.
  - Fixed `exportData()`: all credentials, tokens, and session secrets are strictly stripped before downloading the backup JSON.
  - Hardened `handleImport()`: validates JSON schema against expected structures (rejecting malformed/incompatible files without destroying state), creates a pre-import recoverable snapshot in `localStorage` (`noticeboard_pre_import_backup`), strips credentials from imported objects, and syncs valid data to the backend if logged in.
  - Overhauled timetable period tracking to use stable unique identifiers (`p.id`) rather than array indices: prevents period editing/deletion redirects when earlier items are removed or reordered.
  - Fixed college logo upload and display flow: logo file upload now validates file type and 2MB limit, sends `multipart/form-data` with Bearer token to `POST /api/upload-logo`, updates config with returned path, and properly resolves relative URLs (`/uploads/...`) against the API base URL in both header and settings displays.
  - Exposed admin handlers globally on `window` to support declarative HTML event bindings and headless test suites.
- **Files Changed**:
  - `public/js/admin.js`
  - `public/js/app.js`
  - `tests/test_frontend_dom.js`
  - `docs/CHANGELOG.md`
- **Behavior / API Contract Changed**:
  - `doLogin()` saves token to `sessionStorage`.
  - Notice, achievement, timetable, and settings modifications trigger authenticated backend sync.
  - Settings and export formats strictly exclude credentials.
  - Timetable periods maintain persistent `id` attributes.
- **Tests and Checks Run**:
  - `node tests/test_frontend_dom.js`: 9/9 tests passed (DOM integrity, safe rendering, view switching, crash-free settings, credential sanitization in saveData, credential exclusion in exportData, timetable stable ID editing).
  - `python -m pytest tests/test_api.py -v`: 8/8 tests passed.
- **Graphify Status**:
  - Refreshed via `graphify update .` and queried updated admin relationships.
- **Unresolved Limitations**:
  - Task 4 board interaction, filters, search, timetable midnight rollover, and status badge health polling to be addressed next.

---

## [Task 4] — Notices, Navigation, Filters, Status, Weather, and Timetable
- **Date**: 2026-10-08
- **Issues Addressed**:
  - Standardized on `deadline` for notice expiry while maintaining transparent backward compatibility for legacy `expiryDate` through an automatic migration step during `loadData()`.
  - Enforced strict filtering of inactive notices (`active === false`) and expired notices (handling date-only deadlines through 23:59:59.999 end-of-day parsing).
  - Preserved actual form value for notice active status rather than forcing new notices to `active: true`.
  - Connected the `#notice-search` input directly to notice rendering, harmonizing search queries, active-state filtering, expiry filtering, and dynamic category chips.
  - Dynamically populated category filter chips based on live active notice categories with accurate counts.
  - Bound notice card click interactions directly to `#notice-modal` using event listeners and dataset attributes, eliminating inline javascript handlers.
  - Synchronized navigation across both desktop (`.nav-btn`) and mobile (`.mobile-nav-btn`) buttons, safeguarding against navigation to nonexistent views.
  - Replaced static "Pi Online" text with a live periodic health check against `/api/health` with a 4-second timeout, updating status badge styles between "Pi Online" (green) and "Standalone Mode" (amber, offline/cached).
  - Clarified RSS feed status: differentiated live headlines from cached/archived headlines by updating the ticker badge to display "● LIVE FEED" or "○ ARCHIVE FEED" respectively.
  - Maintained weather robustness: utilized actual `surface_pressure` from Open-Meteo with fallback, guarded missing provider fields and optional DOM elements, and sliced future hourly forecasts chronologically across midnight using UTC timestamps.
  - Timetable date rollover: implemented dynamic day recomputation in `renderTimetable()`, detecting midnight rollover and preventing user day selection from becoming stale overnight while preserving manual browsing intent.
  - Rendered timetable break periods with distinct icons (`🍱` / `☕`) rather than raw booleans.
- **Files Changed**:
  - `public/js/app.js`
  - `tests/test_frontend_dom.js`
  - `docs/CHANGELOG.md`
- **Behavior / API Contract Changed**:
  - `#notice-search` triggers real-time notice filtering.
  - Status badge dynamically reflects backend connectivity (`/api/health`).
  - Timetable recomputes to the current day across midnight rollover.
  - Flash news badge accurately labels live vs archived feeds.
- **Tests and Checks Run**:
  - `node tests/test_frontend_dom.js`: 11/11 tests passed (DOM integrity, safe rendering, view switching, crash-free settings, saveData credential stripping, exportData sanitization, timetable stable ID editing, notice search/category/expiry filtering, and Pi health check UI).
  - `python -m pytest tests/test_api.py -v`: 8/8 tests passed.
- **Graphify Status**:
  - Refreshed via `graphify update .` and verified updated frontend symbols.
- **Unresolved Limitations**:
  - Task 5 startup scripts, package.json, GitHub workflows, and git ignore hygiene to be addressed next.

---

## [Task 5] — Local Startup, Package Scripts, Deployment, and Ignored Files
- **Date**: 2026-10-08
- **Issues Addressed**:
  - Fixed local startup scripts in `package.json`: updated `"dev"` and `"start"` from serving the root repository (`.`) to serving the verified frontend document root (`public/`).
  - Added meaningful `"build"` script to `package.json` that validates the existence and distribution readiness of static assets in `public/index.html` for Firebase Hosting, resolving build failures in GitHub Actions workflows without fabricating a fake bundler.
  - Added unified `"test"`, `"test:frontend"`, and `"test:backend"` npm scripts executing both the Node/JSDOM frontend test suite and the Python pytest backend test suite.
  - Inspected and verified both existing GitHub Actions deployment workflows (`firebase-hosting-merge.yml` and `firebase-hosting-pull-request.yml`), confirming that the project ID (`iot-notice-board-naina`) and service account secret name (`FIREBASE_SERVICE_ACCOUNT_IOT_NOTICE_BOARD_NAINA`) are preserved accurately.
  - Consolidated and expanded the root `.gitignore`: removed the misplaced `public/js/.gitignore` and established comprehensive ignore rules for environment files (`.env`, `.env.*`), local data/uploads directories, Python bytecode/environments, pytest caches, Firebase caches, and system files while keeping `.env.example` trackable.
  - Created `.env.example` containing documented placeholders for backend host/port, credentials, token expiry, CORS origins, and storage paths without exposing any real secrets.
  - Verified with `git ls-files` that no environment files, secrets, or sensitive credentials are inadvertently tracked in version control.
- **Files Changed**:
  - `package.json`
  - `.gitignore`
  - `.env.example`
  - Removed misplaced `public/js/.gitignore`
  - `docs/CHANGELOG.md`
- **Behavior / API Contract Changed**:
  - `npm run dev` and `npm start` now serve `public/` at port 5173.
  - `npm run build` validates distribution assets.
  - `npm test` runs all frontend and backend tests.
- **Tests and Checks Run**:
  - `npm run build`: verified static distribution check succeeded.
  - `npm test`: verified all 11 frontend assertions and 8 backend pytest assertions passed (100% pass rate).
  - `git ls-files`: verified clean tracked file status without secrets.
- **Graphify Status**:
  - Refreshed via `graphify update .` and verified updated package scripts and configuration.
- **Unresolved Limitations**:
  - Live deployment to Firebase Hosting and Raspberry Pi execution depend on user-provided repository secrets and physical Pi environment.

---

## [Task 6] — Handoff and Final Documentation
- **Date**: 2026-10-08
- **Issues Addressed**:
  - Completely rewritten root `README.md` to accurately and comprehensively describe the IoT Smart Notice Board project, key capabilities, architecture, setup instructions, testing commands, configuration options, documentation index, and Graphify workflow.
  - Authored `docs/ARCHITECTURE.md` documenting client and server component relationships, resilient DOM rendering rules, single-source state lifecycle, token security model, atomic persistence, and explicit RTK.md resolution.
  - Authored `docs/DEPLOYMENT.md` providing end-to-end guidance for local development, automated Firebase Hosting CI/CD via GitHub Actions, Raspberry Pi systemd service setup, HTTPS mixed content handling, and disaster recovery.
  - Verified and maintained `docs/API.md` describing all public read routes and protected write endpoints with schemas and status codes.
  - Investigated and formally resolved references to `RTK.md`: verified 0 references exist in repository, confirming state architecture intentionally relies on lightweight vanilla stores rather than Redux Toolkit.
  - Checked repository git status to ensure no real credentials, `.env` contents, or sensitive tokens are committed.
- **Files Changed**:
  - `README.md`
  - `docs/ARCHITECTURE.md`
  - `docs/DEPLOYMENT.md`
  - `docs/API.md`
  - `docs/CHANGELOG.md`
- **Behavior / API Contract Changed**:
  - Authoritative, synchronized documentation matching current codebase behavior and scripts.
- **Tests and Checks Run**:
  - `npm test`: all 11 frontend unit tests and 8 backend pytest tests executed and passed (100% pass rate).
  - `npm run build`: verified static distribution check succeeded.
- **Graphify Status**:
  - Final graph refreshed via `graphify update .` (213 nodes, 369 edges, 15 communities) and queried across the codebase.
- **Unresolved Limitations**:
  - Production TLS certificates, Cloudflare Tunnel/reverse proxy, and live Firebase service account secrets remain outside the local repository and must be configured in their respective deployment environments.

