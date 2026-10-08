# 📢 IoT Smart Digital Notice Board

An interactive, resilient digital notice board and campus kiosk application designed for the **Department of Mechatronics Engineering**. Features a responsive single-page frontend (deployable via Firebase Hosting or local kiosk) and a lightweight Python Flask backend intended for edge execution on a Raspberry Pi.

---

## ✨ Features

- **📋 Dynamic Notices & Expiry Management**:
  - Notices with priority badges (`Urgent`, `High`, `Normal`) and categories (`Academic`, `Events`, `Placement`, `General`, `Circular`).
  - Automatic filtering of inactive notices (`active: false`) and expired deadlines (`deadline` with date-only end-of-day parsing).
  - Real-time search by title, content, or author coupled with interactive dynamic category filter chips.
  - Safe detail modals with XSS sanitization and URL validation.
- **🏆 Student Achievements Showcase**:
  - Highlights student competitions, roll numbers, awards, categories, and photos with featured spotlight banners.
- **📅 Multi-Class Timetable Schedule**:
  - Displays S7, S5, and S3 Mechatronics schedules side-by-side.
  - Highlights currently active periods (`● LIVE NOW`).
  - Automatically formats break and lunch intervals with custom iconography.
  - Date rollover detection: dynamically updates the active schedule overnight without getting stuck on a previous day.
- **⛅ Real-Time Open-Meteo Weather**:
  - Live temperature, apparent temperature, relative humidity, wind speed, and barometric pressure.
  - Chronological hourly forecast across midnight using UTC timestamps.
  - Sunrise and sunset detection with automatic dark mode switching.
- **📰 The Hindu Flash News Ticker**:
  - Continuous bottom marquee featuring headlines from The Hindu RSS feed.
  - Clearly differentiates live RSS feeds from offline/archived fallback content.
- **🛠️ Administrative Dashboard**:
  - Token-authenticated session login (`Bearer` token issued by the Flask backend).
  - Complete CRUD for notices, achievements, timetable periods (tracked by stable IDs), and board branding.
  - Secure college logo uploading (2MB cap, image MIME validation) and display.
  - JSON backup export and schema-validated import with automated pre-import recovery snapshots.
  - Zero credential leakage: passwords and session tokens are strictly excluded from state backups and browser storage.
- **🖥️ Kiosk Auto-Rotation Mode**:
  - Smooth automated rotation through board views with a visual progress bar.
  - User interaction pause: temporarily pauses rotation upon mouse movement or touch interactions.
- **📶 Resilient Offline / Standalone Capability**:
  - Live heartbeat checking against `/api/health` every 30 seconds.
  - Displays `"Pi Online"` when connected and falls back seamlessly to `"Standalone Mode"` using local cache when disconnected.

---

## 🏛️ System Architecture

```
+-------------------------------------------------------------+
|                      STATIC FRONTEND                        |
|   public/index.html · public/js/app.js · public/js/admin.js |
|   (Served via Firebase Hosting or local HTTP on Port 5173)   |
+------------------------------+------------------------------+
                               |
                   HTTP / REST API (Bearer Auth)
                               |
+------------------------------v------------------------------+
|                    RASPBERRY PI BACKEND                     |
|            backend/app.py (Entrypoint: app.py)              |
|        (Atomic JSON Stores: data/ · Uploads: uploads/)      |
+-------------------------------------------------------------+
```

For comprehensive architectural design, refer to [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** v18+ and `npm`
- **Python** 3.10+ and `pip`

### 2. Frontend Local Development
```bash
npm install
npm run dev
```
Serves the `public/` directory at `http://localhost:5173/`.

### 3. Backend Local Development
```bash
# Install dependencies
pip install -r requirements.txt

# Copy environment template
cp .env.example .env

# Run Flask server
python app.py
```
Listens at `http://127.0.0.1:5000/`.

---

## 🧪 Testing

The repository includes comprehensive automated tests covering DOM rendering, XSS protections, state persistence, timetable ID stability, admin CRUD, and Flask API behavior:

```bash
# Run both frontend (JSDOM) and backend (pytest) test suites
npm test

# Run frontend tests only
npm run test:frontend

# Run backend pytest suite only
npm run test:backend
```

---

## ⚙️ Configuration & Environment Variables

Copy `.env.example` to `.env` on your backend server:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Backend listening port | `5000` |
| `HOST` | Backend listening interface | `0.0.0.0` |
| `ADMIN_USERNAME` | Administrator login username | `admin` |
| `ADMIN_PASSWORD` | Administrator login password | `admin123` (Change in production!) |
| `SECRET_KEY` | Cryptographic key for session tokens | Randomly generated |
| `TOKEN_EXPIRY_SECONDS` | Token lifespan in seconds | `86400` (24 hours) |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated) | `http://localhost:5173,https://iot-notice-board-naina.web.app` |
| `DATA_DIR` | Atomic JSON storage directory | `data` |
| `UPLOAD_FOLDER` | Uploaded images directory | `uploads` |

Frontend API base URL can be customized in `public/config.js` without touching backend secrets:
```javascript
window.APP_CONFIG = {
  apiBase: 'http://localhost:5000' // or https://your-pi-domain.com
};
```

---

## 📚 Documentation Index

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Detailed client/server architecture, state flow, and security model.
- [docs/API.md](docs/API.md) — Complete REST API specification (endpoints, payloads, schemas, status codes).
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Firebase Hosting, Raspberry Pi systemd service, and HTTPS setup.
- [docs/CHANGELOG.md](docs/CHANGELOG.md) — Full changelog recording tasks, repairs, and test results.

> **Note on RTK.md**: References to `RTK.md` were investigated during project audit. No occurrences exist in the codebase; the project intentionally utilizes a vanilla single-source state model rather than Redux Toolkit.

---

## 🔍 Graphify Knowledge Graph

This repository utilizes [Graphify](https://github.com) for structural knowledge graph tracking:
- Graph files are located in `graphify-out/` (`graph.json`, `graph.html`, `GRAPH_REPORT.md`).
- To refresh the graph after code modifications:
  ```bash
  graphify update .
  ```
- To query code relationships:
  ```bash
  graphify query "<question>"
  ```
