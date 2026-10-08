# System Architecture — IoT Smart Notice Board

## 1. Overview

The **IoT Smart Notice Board** is an interactive information system engineered for academic departments (specifically the Department of Mechatronics Engineering). It is designed to run in two cooperative deployment modalities:
1. **Public Kiosk Display / Mobile Web Client**: A responsive, vanilla HTML/CSS/JavaScript single-page application served via Firebase Hosting or local HTTP server.
2. **Local Edge Hardware & Persistence Server**: A lightweight Python Flask backend intended to run on a Raspberry Pi situated on the local campus network, managing persistent data, image uploads, and authorized administrator mutations.

```
+-------------------------------------------------------------------------------+
|                           CLIENT TIER (Browser / Kiosk)                       |
|                                                                               |
|  +--------------------+   +-----------------------+   +--------------------+  |
|  | public/config.js   |   | public/js/app.js      |   | public/js/admin.js |  |
|  | (API Base Config)  |   | (Renderers, Kiosk, UI)|   | (Auth, CRUD, Sync) |  |
|  +--------------------+   +-----------------------+   +--------------------+  |
|            |                         |                          |             |
|            +-----------+-------------+--------------------------+             |
|                        |                                                      |
|                 [localStorage] (Client Cache)                                 |
+------------------------|------------------------------------------------------+
                         |  HTTP / HTTPS REST API
                         v  (Bearer Token Auth for Mutations)
+-------------------------------------------------------------------------------+
|                      EDGE / BACKEND TIER (Raspberry Pi)                       |
|                                                                               |
|  +-------------------------------------------------------------------------+  |
|  | Flask Application: backend/app.py (Entrypoint: app.py)                  |  |
|  |                                                                         |  |
|  |  * GET  /api/health            (Public heartbeat / diagnostics)         |  |
|  |  * POST /api/login             (Password verification -> Session Token) |  |
|  |  * GET  /api/notices           (Public notice feed)                     |  |
|  |  * POST /api/notices           (Bearer auth -> Atomic persistence)      |  |
|  |  * GET  /api/achievements      (Public student achievements feed)       |  |
|  |  * POST /api/achievements      (Bearer auth -> Atomic persistence)      |  |
|  |  * GET  /api/timetable         (Public class schedule)                  |  |
|  |  * POST /api/timetable         (Bearer auth -> Atomic persistence)      |  |
|  |  * GET  /api/settings          (Sanitized board configuration)          |  |
|  |  * POST /api/settings          (Bearer auth -> Atomic persistence)      |  |
|  |  * POST /api/upload-logo       (Bearer auth -> 2MB image validation)    |  |
|  |  * GET  /api/logo              (Public image stream)                    |  |
|  +-------------------------------------------------------------------------+  |
|                                     |                                         |
|                   +-----------------+-----------------+                       |
|                   |                                   |                       |
|                   v                                   v                       |
|          [data/*.json] (Atomic Store)          [uploads/*] (Files)            |
+-------------------------------------------------------------------------------+
```

---

## 2. Frontend Architecture (`public/`)

### 2.1 File Organization & Loading Sequence
The static frontend is isolated in `public/` and requires no heavy compilation step:
1. `public/config.js`: Loaded first. Declares `window.APP_CONFIG.apiBase` allowing non-secret API routing configuration in different deployment environments (local vs production).
2. `public/js/mock-data.js`: Declares `window.DEFAULT_NOTICE_DATA` containing initial structures and default fallback content.
3. `public/js/app.js`: Core client controller. Manages state (`App.data`), safe DOM renderers (`renderNotices`, `renderAchievements`, `renderTimetable`, `renderWeather`), kiosk view rotation, clock, live Hindu RSS feed, theme auto-switching, and backend health polling.
4. `public/js/admin.js`: Administrative portal. Manages login authentication tokens, notice CRUD, achievement CRUD, timetable scheduling, settings persistence, JSON export/import validation, and logo uploading.

### 2.2 State Management & Resilient DOM Rendering
- **Unified Single Source of Truth**: Data fetched from backend APIs or local cache is always merged into `window.App.data` before invoking any renderer.
- **Target Isolation**:
  - `renderNotices()` renders exclusively into verified `#notices-grid`. It never mutates or falls back to `#main-content`, preserving all page shell elements (weather, timetable, achievements, navigation).
  - `renderAchievements()` renders exclusively into verified `#achievements-grid`.
  - Missing DOM elements trigger graceful diagnostic warnings without interrupting execution or breaking adjacent views.
- **Defensive Rendering & XSS Elimination**:
  - All dynamic strings are escaped via `escapeHTML()` before DOM injection.
  - Links are verified using `isValidHttpUrl()` and restricted to safe `http:` and `https:` schemes.
  - Inline JavaScript handlers (`onclick="..."`) are eliminated in favor of standard event listeners and data attributes (`data-view`, `data-id`, `data-href`).
  - Outbound links strictly include `rel="noopener noreferrer"` attributes.

### 2.3 Resilient Standalone / Offline Capability
- The frontend operates with high availability even during network disruptions:
  - Initial load pulls from `localStorage` (`noticeboard_data`) if available, falling back to defaults.
  - Active background polling (`checkPiHealth()`) checks `/api/health` every 30 seconds.
  - If the Raspberry Pi is offline, the status badge reflects `"Standalone Mode"` (amber indicator), while cached board data remains fully interactive.
  - Admin changes made while offline are saved safely to the local browser cache with clear toast messaging (`"Saved locally (Backend offline)"`).

---

## 3. Backend Architecture (`backend/app.py`, `app.py`)

### 3.1 Framework & Runtime
- Built on **Flask** with `flask-cors` and `werkzeug`.
- Run using `python app.py` (which launches `backend/app.py`).

### 3.2 Security, Authentication & Session Model
- **Constant-Time Verification**: Administrator login verifies credentials using `hmac.compare_digest` against server environment variables (`ADMIN_USERNAME` and `ADMIN_PASSWORD`), preventing timing attacks.
- **Cryptographic Bearer Tokens**: Successful login issues a high-entropy token (`secrets.token_hex(32)`) with a configurable TTL (`TOKEN_EXPIRY_SECONDS`, default 86400s / 24 hours).
- **Mutating Route Protection**: All write operations require an `Authorization: Bearer <token>` header enforced via the `@require_auth` decorator. Frontend state (`isLoggedIn`) alone is never treated as authorization.
- **Credential Segregation**: Passwords and session secrets are never returned in `/api/settings`, never saved to JSON stores, and never written to `localStorage`.

### 3.3 Atomic Data Persistence
To safeguard against filesystem corruption during unexpected power cuts on a Raspberry Pi:
- The backend utilizes `save_json_atomic(filepath, data)`:
  1. Writes JSON payload to a temporary file in the same directory using `tempfile.NamedTemporaryFile`.
  2. Flushes and syncs buffers to physical disk (`os.fsync`).
  3. Atomically replaces the target file via `os.replace`.
- Schema-appropriate defaults are guaranteed: lists `[]` for notices and achievements, and objects `{}` for timetable and settings.

### 3.4 Explicit CORS Configuration
- Production CORS is configured via `CORS_ORIGINS` environment variable (comma-delimited), replacing insecure wildcards (`*`).
- Supports preflight `OPTIONS` requests, explicit headers (`Content-Type`, `Authorization`), and mutating methods (`GET`, `POST`, `OPTIONS`).

---

## 4. Documentation References & RTK.md Resolution

During the project audit, a legacy reference to `RTK.md` was investigated.
- **Verification Result**: Zero occurrences of `RTK.md` exist across the codebase, workflows, or documentation.
- **Resolution**: Verified as a stale requirement or external reference. State management in this repository is intentionally lightweight and vanilla (`App.data` backed by `localStorage`), precluding the need for Redux Toolkit (RTK).
