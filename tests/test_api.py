import os
import json
import pytest
from backend.app import app, TOKEN_STORE

@pytest.fixture
def client(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    uploads_dir = tmp_path / "uploads"
    data_dir.mkdir()
    uploads_dir.mkdir()

    monkeypatch.setenv("DATA_DIR", str(data_dir))
    monkeypatch.setenv("UPLOAD_FOLDER", str(uploads_dir))
    monkeypatch.setenv("ADMIN_USERNAME", "testadmin")
    monkeypatch.setenv("ADMIN_PASSWORD", "Secret123!")

    import backend.app as backend_module
    monkeypatch.setattr(backend_module, "DATA_DIR", str(data_dir))
    monkeypatch.setattr(backend_module, "UPLOAD_FOLDER", str(uploads_dir))
    monkeypatch.setattr(backend_module, "NOTICES_FILE", str(data_dir / "notices.json"))
    monkeypatch.setattr(backend_module, "ACHIEVEMENTS_FILE", str(data_dir / "achievements.json"))
    monkeypatch.setattr(backend_module, "TIMETABLE_FILE", str(data_dir / "timetable.json"))
    monkeypatch.setattr(backend_module, "SETTINGS_FILE", str(data_dir / "settings.json"))
    monkeypatch.setattr(backend_module, "ADMIN_USER", "testadmin")
    monkeypatch.setattr(backend_module, "ADMIN_PASS", "Secret123!")

    TOKEN_STORE.clear()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client

def test_health_check(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "healthy"
    assert data["service"] == "iot-smart-notice-board"
    assert "timestamp" in data

def test_login_success(client):
    res = client.post("/api/login", json={"username": "testadmin", "password": "Secret123!"})
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert "token" in data
    assert len(data["token"]) > 20

def test_login_failure(client):
    res = client.post("/api/login", json={"username": "testadmin", "password": "WrongPassword"})
    assert res.status_code == 401
    data = res.get_json()
    assert data["success"] is False

def test_public_read_endpoints(client):
    # Empty defaults should be lists for notices and achievements, dicts for timetable and settings
    assert client.get("/api/notices").get_json() == []
    assert client.get("/api/achievements").get_json() == []
    assert client.get("/api/timetable").get_json() == {}
    assert client.get("/api/settings").get_json() == {}

def test_unauthorized_writes_rejected(client):
    assert client.post("/api/notices", json={"title": "Test"}).status_code == 401
    assert client.post("/api/achievements", json={"title": "Test"}).status_code == 401
    assert client.post("/api/timetable", json={"days": {}}).status_code == 401
    assert client.post("/api/settings", json={"theme": "dark"}).status_code == 401

def test_authorized_notice_sync(client):
    login_res = client.post("/api/login", json={"username": "testadmin", "password": "Secret123!"})
    token = login_res.get_json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    notices = [
        {"id": "not-1", "title": "First Notice", "active": True},
        {"id": "not-2", "title": "Second Notice", "active": True}
    ]
    res = client.post("/api/notices", json=notices, headers=headers)
    assert res.status_code == 200
    assert res.get_json()["status"] == "success"

    # Verify persistence on subsequent GET
    get_res = client.get("/api/notices")
    assert get_res.status_code == 200
    saved = get_res.get_json()
    assert len(saved) == 2
    assert saved[0]["id"] == "not-1"

def test_authorized_timetable_and_settings(client):
    login_res = client.post("/api/login", json={"username": "testadmin", "password": "Secret123!"})
    token = login_res.get_json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Timetable
    tt_payload = {"classes": ["S7 MRE"], "days": {"Monday": {"S7 MRE": []}}}
    tt_res = client.post("/api/timetable", json=tt_payload, headers=headers)
    assert tt_res.status_code == 200
    assert client.get("/api/timetable").get_json()["classes"] == ["S7 MRE"]

    # Settings
    set_payload = {"boardTitle": "Custom Title", "theme": "dark", "password": "leakedPassword!"}
    set_res = client.post("/api/settings", json=set_payload, headers=headers)
    assert set_res.status_code == 200
    saved_settings = client.get("/api/settings").get_json()
    assert saved_settings["boardTitle"] == "Custom Title"
    assert "password" not in saved_settings  # Ensure passwords excluded

def test_cors_preflight(client):
    res = client.options(
        "/api/notices",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Authorization, Content-Type"
        }
    )
    assert res.status_code in (200, 204)
    assert res.headers.get("Access-Control-Allow-Origin") == "http://localhost:5173"
