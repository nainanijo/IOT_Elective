# REST API Reference

The IoT Smart Notice Board backend is a lightweight Flask application designed to run on a Raspberry Pi or server. It provides endpoints for public read access (kiosk mode) and authenticated administrative mutations.

---

## Base URL & Configuration

- **Default Port**: `5000` (e.g., `http://localhost:5000` or `https://pi.mechatronics.college.edu:5000`).
- **Data Directory**: Configurable via `DATA_DIR` environment variable (defaults to `data/`). All data is saved atomically to prevent corrupted files on unexpected power cuts.
- **Uploads Directory**: Configurable via `UPLOAD_FOLDER` environment variable (defaults to `uploads/`).
- **CORS Configuration**: Configurable via `CORS_ORIGINS` environment variable (comma-separated list). Defaults to local development (`http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:5000`) and production Firebase Hosting domains (`https://iot-notice-board-naina.web.app`, `https://iot-notice-board-naina.firebaseapp.com`).
- **Authentication**: Bearer token session mechanism. Mutating endpoints (`POST`, `PUT`, `DELETE`) require `Authorization: Bearer <token>`.

---

## Authentication Flow

### `POST /api/login`
Authenticates the administrator and issues a cryptographically secure, expiring session token.

- **Request Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "username": "admin",
    "password": "Admin@123"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "status": "success",
    "token": "d748f3e5...",
    "expiresIn": 86400,
    "message": "Authenticated successfully"
  }
  ```
- **Response `401 Unauthorized`**:
  ```json
  {
    "success": false,
    "status": "error",
    "message": "Invalid username or password"
  }
  ```

---

## Endpoints

### 1. Health Check
#### `GET /api/health`
Public liveness and health probe for the display board and status badge.

- **Auth Required**: None (Public)
- **Response `200 OK`**:
  ```json
  {
    "status": "healthy",
    "service": "iot-smart-notice-board",
    "timestamp": 1728400000,
    "uptime": "online"
  }
  ```

---

### 2. Notices
#### `GET /api/notices`
Retrieves all notices.

- **Auth Required**: None (Public)
- **Response `200 OK`**: Array of notice objects (defaults to `[]` when empty).
  ```json
  [
    {
      "id": "not-1",
      "title": "Project Review",
      "category": "Academic",
      "priority": "urgent",
      "date": "2026-09-25",
      "deadline": "2026-09-28",
      "author": "HOD",
      "content": "Project review viva voce schedule...",
      "active": true
    }
  ]
  ```

#### `POST /api/notices`
Syncs the notices array or adds/updates an individual notice.

- **Auth Required**: `Bearer <token>`
- **Request Body**: Array of notice objects or a single notice object.
- **Response `200 OK`**:
  ```json
  {
    "status": "success",
    "data": [ ... ]
  }
  ```

---

### 3. Achievements
#### `GET /api/achievements`
Retrieves all student achievements.

- **Auth Required**: None (Public)
- **Response `200 OK`**: Array of achievement objects (defaults to `[]` when empty).
  ```json
  [
    {
      "id": "ach-1",
      "studentName": "Rahul M.",
      "rollNo": "MRE21045",
      "title": "Autonomous Drone Challenge",
      "competition": "IIT TechFest",
      "award": "First Prize",
      "category": "Robotics",
      "date": "2026-09-20",
      "description": "Built quadcopter drone...",
      "image": "https://...",
      "featured": true
    }
  ]
  ```

#### `POST /api/achievements`
Syncs the achievements array or adds/updates an individual achievement.

- **Auth Required**: `Bearer <token>`
- **Request Body**: Array of achievement objects or a single achievement object.
- **Response `200 OK`**:
  ```json
  {
    "status": "success",
    "data": [ ... ]
  }
  ```

---

### 4. Timetable
#### `GET /api/timetable`
Retrieves the class timetable.

- **Auth Required**: None (Public)
- **Response `200 OK`**: JSON object containing class periods and day schedules (defaults to `{}` when empty).
  ```json
  {
    "classes": ["S7 MRE", "S5 MRE", "S3 MRE"],
    "days": {
      "Monday": {
        "S7 MRE": [
          { "period": "1", "time": "09:00–10:00", "subject": "Robotics", "code": "MR401", "teacher": "Dr. Radhakrishnan" }
        ]
      }
    }
  }
  ```

#### `POST /api/timetable`
Updates and persists the timetable schedule.

- **Auth Required**: `Bearer <token>`
- **Request Body**: JSON object with classes and day schedules.
- **Response `200 OK`**:
  ```json
  {
    "status": "success",
    "data": { ... }
  }
  ```

---

### 5. Settings
#### `GET /api/settings`
Retrieves application configuration.

- **Auth Required**: None (Public)
- **Response `200 OK`**: JSON object of settings (excluding credentials).
  ```json
  {
    "boardTitle": "Smart IoT Notice Board",
    "institution": "Department of Mechatronics Engineering",
    "autoRotate": true,
    "rotateInterval": 12,
    "weatherCity": "Kochi, Kerala",
    "weatherLat": 9.9312,
    "weatherLon": 76.2673,
    "kioskMode": true,
    "theme": "auto"
  }
  ```

#### `POST /api/settings`
Updates and persists application configuration. Sensitive credential keys (`password`, `adminPassword`, `token`) are stripped before storage.

- **Auth Required**: `Bearer <token>`
- **Request Body**: JSON object of configuration settings.
- **Response `200 OK`**:
  ```json
  {
    "status": "success",
    "data": { ... }
  }
  ```

---

### 6. Logo Upload & Retrieval
#### `POST /api/upload-logo`
Uploads a new college/department logo image.

- **Auth Required**: `Bearer <token>`
- **Request Headers**: `Content-Type: multipart/form-data`
- **Form Field**: `logo` (File upload)
- **Allowed Extensions**: `.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`
- **Size Limit**: 2 MB max
- **Response `200 OK`**:
  ```json
  {
    "status": "success",
    "url": "/api/logo"
  }
  ```

#### `GET /api/logo`
Serves the uploaded logo file.

- **Auth Required**: None (Public)
- **Response `200 OK`**: Image binary stream (`image/png`).
- **Response `404 Not Found`**: Returned if no logo has been uploaded.

---

## Error Codes

| Status Code | Description | Typical Cause |
|---|---|---|
| `400 Bad Request` | Invalid payload or format | Malformed JSON or invalid file format |
| `401 Unauthorized` | Missing or invalid auth | Missing or expired Bearer token |
| `404 Not Found` | Resource not found | Logo image not yet uploaded |
| `413 Payload Too Large` | Upload file exceeds size | File larger than 2MB |
| `500 Server Error` | Internal server exception | Filesystem write failure or unexpected error |
