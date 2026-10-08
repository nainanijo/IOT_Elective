# Deployment & Operations Guide — IoT Smart Notice Board

This guide details setup, local execution, and production deployment across **Firebase Hosting** and the **Raspberry Pi** edge backend.

---

## 1. Local Development Setup

### 1.1 Prerequisites
- **Node.js**: v18.x or later with `npm`.
- **Python**: v3.10 or later with `pip`.

### 1.2 Frontend Execution
Run the static development server from the repository root:
```bash
npm install
npm run dev
```
The application will be served at `http://localhost:5173/`, serving from the verified `public/` directory.

### 1.3 Backend Execution
1. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Configure local environment:
   ```bash
   cp .env.example .env
   ```
   For local development, the defaults in `.env.example` (`PORT=5000`, `CORS_ORIGINS=http://localhost:5173,...`) are immediately usable.
3. Start the Flask server:
   ```bash
   python app.py
   ```
   The API will listen on `http://127.0.0.1:5000/`.

### 1.4 Running Test Suites
Run the automated test suites using npm:
```bash
# Run both frontend and backend suites
npm test

# Run frontend DOM and state assertions only
npm run test:frontend

# Run backend API pytest suite only
npm run test:backend
```

---

## 2. Firebase Hosting Deployment (Client Application)

The public notice board is hosted as a static web application on Firebase Hosting.

### 2.1 Configuration
- Configuration file: `firebase.json`
- Project file: `.firebaserc` (target project: `iot-notice-board-naina`)
- Published directory: `public/` (all HTML, CSS, JS, and config assets)

### 2.2 Continuous Deployment via GitHub Actions
Two automated workflows are configured under `.github/workflows/`:
1. `firebase-hosting-pull-request.yml`: Runs on PRs to preview hosting channels.
2. `firebase-hosting-merge.yml`: Deploys directly to the `live` production channel on push to `main`.

**Required Repository Secrets in GitHub**:
- `FIREBASE_SERVICE_ACCOUNT_IOT_NOTICE_BOARD_NAINA`: Service account private key JSON string authorized for Firebase Hosting deployment on project `iot-notice-board-naina`.

### 2.3 Manual Deployment via Firebase CLI
If deploying manually:
```bash
npm install -g firebase-tools
firebase login
firebase deploy --only hosting
```

---

## 3. Raspberry Pi Edge Backend Deployment

The Flask backend is designed to run as a reliable system service on a Raspberry Pi physically installed at the department.

### 3.1 Pi Hardware & OS Setup
1. Standard Raspberry Pi OS Lite (64-bit recommended) on a microSD card.
2. Ensure static IP allocation or local mDNS (`noticeboard.local`) on the campus network.

### 3.2 Installation Steps on Raspberry Pi
```bash
# Clone the repository
git clone https://github.com/nainanijo/IOT_Elective.git /opt/noticeboard
cd /opt/noticeboard

# Set up dedicated Python virtual environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Configure environment secrets
cp .env.example .env
nano .env
```
Ensure you set:
- `ADMIN_PASSWORD`: A secure, private administrator password.
- `SECRET_KEY`: A random 64-character hex string (`python3 -c "import secrets; print(secrets.token_hex(32))"`).
- `CORS_ORIGINS`: Comma-separated list including your Firebase hosting domains (`https://iot-notice-board-naina.web.app,https://iot-notice-board-naina.firebaseapp.com`).

### 3.3 Systemd Service Setup
Create a systemd unit to ensure the backend auto-starts on boot and automatically restarts after failures:
```ini
# /etc/systemd/system/noticeboard-backend.service
[Unit]
Description=IoT Smart Notice Board Flask Backend
After=network.target

[Service]
User=pi
WorkingDirectory=/opt/noticeboard
EnvironmentFile=/opt/noticeboard/.env
ExecStart=/opt/noticeboard/.venv/bin/python app.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```
Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable noticeboard-backend
sudo systemctl start noticeboard-backend
sudo systemctl status noticeboard-backend
```

### 3.4 HTTPS & Network Connectivity Considerations
When the frontend is accessed over HTTPS (e.g. `https://iot-notice-board-naina.web.app`), modern browsers enforce **Mixed Content** security restrictions, blocking requests to insecure HTTP endpoints (`http://<pi-ip>:5000/api/...`).

To connect a Firebase-hosted HTTPS client to the Raspberry Pi backend:
1. **Option A (Recommended for Kiosk Hardware)**: If running directly on a kiosk screen connected to the Pi via HDMI, browse locally to `http://localhost:5173` or open `public/index.html` directly where both frontend and backend share `http://`.
2. **Option B (Remote / Cloud Access)**: Deploy a secure tunnel (e.g. Cloudflare Tunnel, ngrok, or Tailscale Funnel) on the Raspberry Pi providing a public HTTPS endpoint (e.g. `https://noticeboard-api.yourdomain.com`). Set that URL as `apiBase` in `public/config.js` and add it to `CORS_ORIGINS` in `.env`.
3. **Option C (Campus Reverse Proxy)**: Terminate TLS via an Nginx reverse proxy on the campus network with an institutional SSL certificate.

---

## 4. Disaster Recovery & Backups

1. **Pre-Import Backup**: The frontend automatically snapshots existing state in `localStorage` under `noticeboard_pre_import_backup` prior to applying any imported JSON backup.
2. **Atomic Writes**: All backend files (`notices.json`, `achievements.json`, `timetable.json`, `settings.json`) are updated via temporary file replacement (`os.replace`) to prevent zero-byte or corrupt files during sudden power loss.
3. **Export Backups**: The Admin portal provides a one-click `"Export Backup (JSON)"` feature which exports all content while stripping all passwords and session tokens.
