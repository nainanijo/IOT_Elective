import os
import json
import time
import secrets
import tempfile
import hmac
from functools import wraps
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from werkzeug.utils import secure_filename

load_dotenv()

# Configuration
ADMIN_USER = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASS = os.getenv("ADMIN_PASSWORD", "Admin@123")
TOKEN_EXPIRY_SECONDS = int(os.getenv("TOKEN_EXPIRY_SECONDS", "86400"))  # 24 hours
MAX_UPLOAD_SIZE_BYTES = int(os.getenv("MAX_UPLOAD_SIZE_BYTES", str(2 * 1024 * 1024)))  # 2MB

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.getenv("DATA_DIR", os.path.join(BASE_DIR, "data"))
UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", os.path.join(BASE_DIR, "uploads"))

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

NOTICES_FILE = os.path.join(DATA_DIR, "notices.json")
ACHIEVEMENTS_FILE = os.path.join(DATA_DIR, "achievements.json")
TIMETABLE_FILE = os.path.join(DATA_DIR, "timetable.json")
SETTINGS_FILE = os.path.join(DATA_DIR, "settings.json")

# In-memory token store: { token: expiry_timestamp }
TOKEN_STORE = {}

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = MAX_UPLOAD_SIZE_BYTES

# Configure CORS with explicit allowed origins
cors_env = os.getenv("CORS_ORIGINS", "")
if cors_env.strip():
    allowed_origins = [o.strip() for o in cors_env.split(",") if o.strip()]
else:
    allowed_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5000",
        "http://127.0.0.1:5000",
        "https://iot-notice-board-naina.web.app",
        "https://iot-notice-board-naina.firebaseapp.com"
    ]

CORS(
    app,
    resources={r"/api/*": {"origins": allowed_origins}},
    supports_credentials=True,
    allow_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"]
)

# Persistence Helpers
def load_json(filepath, default_factory):
    if not os.path.exists(filepath):
        return default_factory()
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default_factory()

def save_json_atomic(filepath, data):
    dir_name = os.path.dirname(filepath)
    os.makedirs(dir_name, exist_ok=True)
    fd, temp_path = tempfile.mkstemp(dir=dir_name, prefix=".tmp_")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        os.replace(temp_path, filepath)
    except Exception:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass
        raise

# Authentication Helpers
def generate_token():
    token = secrets.token_hex(32)
    TOKEN_STORE[token] = time.time() + TOKEN_EXPIRY_SECONDS
    return token

def is_valid_token(token):
    if not token or token not in TOKEN_STORE:
        return False
    expiry = TOKEN_STORE[token]
    if time.time() > expiry:
        del TOKEN_STORE[token]
        return False
    return True

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"status": "error", "message": "Missing or invalid authorization token"}), 401
        token = auth_header.split(" ", 1)[1].strip()
        if not is_valid_token(token):
            return jsonify({"status": "error", "message": "Session expired or invalid token"}), 401
        return f(*args, **kwargs)
    return decorated

# API Routes
@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "healthy",
        "service": "iot-smart-notice-board",
        "timestamp": int(time.time()),
        "uptime": "online"
    })

@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", "")).strip()

    # Use constant-time comparison
    user_ok = hmac.compare_digest(username, ADMIN_USER)
    pass_ok = hmac.compare_digest(password, ADMIN_PASS)

    if user_ok and pass_ok:
        token = generate_token()
        return jsonify({
            "success": True,
            "status": "success",
            "token": token,
            "expiresIn": TOKEN_EXPIRY_SECONDS,
            "message": "Authenticated successfully"
        })

    return jsonify({"success": False, "status": "error", "message": "Invalid username or password"}), 401

@app.route("/api/notices", methods=["GET", "POST"])
def api_notices():
    if request.method == "POST":
        return _handle_notices_save()
    notices = load_json(NOTICES_FILE, list)
    return jsonify(notices)

@require_auth
def _handle_notices_save():
    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify({"status": "error", "message": "Invalid JSON payload"}), 400

    notices = load_json(NOTICES_FILE, list)

    # Sync semantics: if payload is a list, replace/synchronize the full list safely
    if isinstance(payload, list):
        notices = payload
    elif isinstance(payload, dict):
        notice_id = payload.get("id")
        if not notice_id:
            payload["id"] = f"not-{secrets.token_hex(4)}"
        # Check if already exists; update if so, append otherwise
        idx = next((i for i, n in enumerate(notices) if isinstance(n, dict) and n.get("id") == payload.get("id")), -1)
        if idx >= 0:
            notices[idx] = payload
        else:
            notices.insert(0, payload)
    else:
        return jsonify({"status": "error", "message": "Payload must be a notice object or list of notices"}), 400

    save_json_atomic(NOTICES_FILE, notices)
    return jsonify({"status": "success", "data": notices})

@app.route("/api/achievements", methods=["GET", "POST"])
def api_achievements():
    if request.method == "POST":
        return _handle_achievements_save()
    achievements = load_json(ACHIEVEMENTS_FILE, list)
    return jsonify(achievements)

@require_auth
def _handle_achievements_save():
    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify({"status": "error", "message": "Invalid JSON payload"}), 400

    achievements = load_json(ACHIEVEMENTS_FILE, list)

    if isinstance(payload, list):
        achievements = payload
    elif isinstance(payload, dict):
        ach_id = payload.get("id")
        if not ach_id:
            payload["id"] = f"ach-{secrets.token_hex(4)}"
        idx = next((i for i, a in enumerate(achievements) if isinstance(a, dict) and a.get("id") == payload.get("id")), -1)
        if idx >= 0:
            achievements[idx] = payload
        else:
            achievements.insert(0, payload)
    else:
        return jsonify({"status": "error", "message": "Payload must be an achievement object or list"}), 400

    save_json_atomic(ACHIEVEMENTS_FILE, achievements)
    return jsonify({"status": "success", "data": achievements})

@app.route("/api/timetable", methods=["GET", "POST"])
def api_timetable():
    if request.method == "POST":
        return _handle_timetable_save()
    timetable = load_json(TIMETABLE_FILE, dict)
    return jsonify(timetable)

@require_auth
def _handle_timetable_save():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"status": "error", "message": "Timetable payload must be a JSON object"}), 400

    save_json_atomic(TIMETABLE_FILE, payload)
    return jsonify({"status": "success", "data": payload})

@app.route("/api/settings", methods=["GET", "POST"])
def api_settings():
    if request.method == "POST":
        return _handle_settings_save()
    settings = load_json(SETTINGS_FILE, dict)
    return jsonify(settings)

@require_auth
def _handle_settings_save():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"status": "error", "message": "Settings payload must be a JSON object"}), 400

    # Ensure passwords and credentials are never stored in settings.json
    clean_settings = {k: v for k, v in payload.items() if k not in ("password", "adminPassword", "token")}
    save_json_atomic(SETTINGS_FILE, clean_settings)
    return jsonify({"status": "success", "data": clean_settings})

ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".svg", ".webp"}

@app.route("/api/upload-logo", methods=["POST"])
@require_auth
def upload_logo():
    if "logo" not in request.files:
        return jsonify({"status": "error", "message": "No logo file provided in multipart form data"}), 400

    file = request.files["logo"]
    if not file or file.filename == "":
        return jsonify({"status": "error", "message": "No file selected"}), 400

    filename = secure_filename(file.filename)
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        return jsonify({
            "status": "error",
            "message": f"Unsupported file extension '{ext}'. Allowed: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}"
        }), 400

    # Content type check
    content_type = file.content_type or ""
    if not (content_type.startswith("image/") or ext == ".svg"):
        return jsonify({"status": "error", "message": "Uploaded file must be a valid image"}), 400

    dest_filename = "logo.png"
    filepath = os.path.join(UPLOAD_FOLDER, dest_filename)
    file.save(filepath)

    return jsonify({"status": "success", "url": "/api/logo"})

@app.route("/api/logo", methods=["GET"])
def get_logo():
    logo_path = os.path.join(UPLOAD_FOLDER, "logo.png")
    if not os.path.exists(logo_path):
        return jsonify({"status": "error", "message": "No logo uploaded"}), 404
    return send_from_directory(UPLOAD_FOLDER, "logo.png")

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_ENV") == "development"
    app.run(host="0.0.0.0", port=port, debug=debug)
