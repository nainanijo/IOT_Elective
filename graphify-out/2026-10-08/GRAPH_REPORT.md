# Graph Report - IOT_Elective  (2026-10-08)

## Corpus Check
- 17 files · ~21,973 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 3, .example 1, .css 1)

## Summary
- 212 nodes · 368 edges · 14 communities (8 shown, 6 thin omitted)
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8438b551`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- app.js
- admin.js
- backend/app.py
- package.json
- Endpoints
- test_api.py
- Changelog
- mock-data.js
- README.md
- rules/graphify.md
- workflows/graphify.md

## God Nodes (most connected - your core abstractions)
1. `syncToBackend()` - 15 edges
2. `renderAdminTimetableDay()` - 14 edges
3. `renderNotices()` - 12 edges
4. `renderAchievements()` - 9 edges
5. `[Task 1] — Frontend State and Safe DOM Rendering` - 9 edges
6. `load_json()` - 8 edges
7. `[Task 3] — Admin Saves, Settings, Imports, Exports, and Logo Flow` - 8 edges
8. `require_auth()` - 7 edges
9. `scripts` - 7 edges
10. `populateSubjectDropdown()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `[Task 2] — Flask API, Authentication, CORS, and Persistence` --references--> `save_json_atomic()`  [INFERRED]
  docs/CHANGELOG.md → backend/app.py
- `[Task 0] — Baseline Audit and Plan` --references--> `load_json()`  [INFERRED]
  docs/CHANGELOG.md → backend/app.py
- `[Task 3] — Admin Saves, Settings, Imports, Exports, and Logo Flow` --references--> `exportData()`  [INFERRED]
  docs/CHANGELOG.md → public/js/admin.js
- `[Task 3] — Admin Saves, Settings, Imports, Exports, and Logo Flow` --references--> `saveData()`  [INFERRED]
  docs/CHANGELOG.md → public/js/app.js
- `[Task 3] — Admin Saves, Settings, Imports, Exports, and Logo Flow` --references--> `syncToBackend()`  [INFERRED]
  docs/CHANGELOG.md → public/js/admin.js

## Import Cycles
- None detected.

## Communities (14 total, 6 thin omitted)

### Community 0 - "app.js"
Cohesion: 0.09
Nodes (46): [Task 0] — Baseline Audit and Plan, [Task 1] — Frontend State and Safe DOM Rendering, [Task 4] — Notices, Navigation, Filters, Status, Weather, and Timetable, App, applyTheme(), checkPiHealth(), checkSunsetTheme(), escapeHTML() (+38 more)

### Community 1 - "admin.js"
Cohesion: 0.09
Nodes (46): [Task 3] — Admin Saves, Settings, Imports, Exports, and Logo Flow, addTTPeriod(), autoRenumberPeriods(), BREAK_PRESETS, cancelEditAch(), cancelEditNotice(), cancelEditTTPeriod(), closeAdmin() (+38 more)

### Community 2 - "backend/app.py"
Cohesion: 0.12
Nodes (30): api_achievements(), api_notices(), api_settings(), api_timetable(), generate_token(), get_logo(), _handle_achievements_save(), _handle_notices_save() (+22 more)

### Community 3 - "package.json"
Cohesion: 0.08
Nodes (24): author, description, devDependencies, jsdom, keywords, license, main, name (+16 more)

### Community 4 - "Endpoints"
Cohesion: 0.08
Nodes (23): 1. Health Check, 2. Notices, 3. Achievements, 4. Timetable, 5. Settings, 6. Logo Upload & Retrieval, Authentication Flow, Base URL & Configuration (+15 more)

### Community 5 - "test_api.py"
Cohesion: 0.15
Nodes (4): fixture, json, pytest, client()

### Community 11 - "Changelog"
Cohesion: 0.50
Nodes (3): Changelog, [Task 2] — Flask API, Authentication, CORS, and Persistence, [Task 5] — Local Startup, Package Scripts, Deployment, and Ignored Files

### Community 13 - "README.md"
Cohesion: 0.50
Nodes (3): IOT_Basics, IOT_Elective, Names of girls in MRE

## Knowledge Gaps
- **41 isolated node(s):** `name`, `version`, `description`, `main`, `dev` (+36 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 78 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `[Task 3] — Admin Saves, Settings, Imports, Exports, and Logo Flow` connect `admin.js` to `app.js`, `Changelog`?**
  _High betweenness centrality (0.220) - this node is a cross-community bridge._
- **Why does `[Task 0] — Baseline Audit and Plan` connect `app.js` to `backend/app.py`, `Changelog`?**
  _High betweenness centrality (0.154) - this node is a cross-community bridge._
- **Why does `load_json()` connect `backend/app.py` to `app.js`?**
  _High betweenness centrality (0.150) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `renderAdminTimetableDay()` (e.g. with `handleDragEnd()` and `handleDragLeave()`) actually correct?**
  _`renderAdminTimetableDay()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `renderNotices()` (e.g. with `[Task 0] — Baseline Audit and Plan` and `[Task 1] — Frontend State and Safe DOM Rendering`) actually correct?**
  _`renderNotices()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `renderAchievements()` (e.g. with `[Task 0] — Baseline Audit and Plan` and `[Task 1] — Frontend State and Safe DOM Rendering`) actually correct?**
  _`renderAchievements()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `[Task 1] — Frontend State and Safe DOM Rendering` (e.g. with `escapeHTML()` and `fetchAchievementsFromBackend()`) actually correct?**
  _`[Task 1] — Frontend State and Safe DOM Rendering` has 8 INFERRED edges - model-reasoned connections that need verification._