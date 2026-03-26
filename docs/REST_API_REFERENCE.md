# BackupHub REST API Reference

This document describes the main REST API endpoints exposed by the BackupHub server (see `server.js`). Endpoints are grouped by functional area. All endpoints require authentication unless otherwise noted.

---


## Table of Contents
- [Authorization & Authentication](#authorization--authentication)

- [Backup Management](#backup-management)
  - [Backup Items](#backup-items)
  - [Backup Create](#backup-create)
  - [Backup Restore](#backup-restore)

- [Notifications](#notifications)
  - [Notifications List](#notifications-list)
  - [Notifications Count](#notifications-count)
  - [Notifications Delete All](#notifications-delete-all)
  - [Notifications Delete by Index](#notifications-delete-by-index)
  - [Notifications Test](#notifications-test)

- [Agent Management](#agent-management)
  - [Agent Details](#agent-details)
  - [Agent Ping](#agent-ping)
  - [Agent History & Stats](#agent-history--stats)
  - [Agent Query by Name](#agent-query-by-name)
  - [Agent Update Status (Is Running)](#agent-update-status-is-running)
  - [Agent Update Status (Detailed)](#agent-update-status-detailed)
  - [Agent Start Update Job](#agent-start-update-job)

- [Templates](#templates)
  - [Templates List](#templates-list)
  - [Templates Refresh](#templates-refresh)

- [Debug & System](#debug--system)
  - [Debug Info](#debug-info)
  - [Debug Logs](#debug-logs)
  - [Debug Logger Trace](#debug-logger-trace)
  - [Debug Logger Warn](#debug-logger-warn)
  - [Server Time](#server-time)

- [Other REST Endpoints](#other-rest-endpoints)
  - [Jobs Config](#jobs-config)
  - [ETA Config](#eta-config)
  - [Script Details](#script-details)

---

## Authorization & Authentication

All REST API endpoints require authentication unless otherwise noted. The BackupHub server uses session-based authentication and CSRF protection for form-based routes. Key points:

- **Session Authentication:**
  - Users log in via `/login.html` using a username and password.
  - On successful login, a session is created and stored using `express-session`.
  - The session is maintained via a session cookie.
  - Most API routes are protected by the `User.isAuthenticated` middleware, which checks for a valid session (`req.session.user`).
  - If not authenticated, the user is redirected to the login page.

- **User Management:**
  - User credentials are stored in a LevelDB database with passwords hashed using bcrypt.
  - Registration is available via `/register.html` if no users exist.
  - Password reset is supported via email with a time-limited token.

- **CSRF Protection:**
  - Form-based routes (e.g., settings, registration) require a CSRF token, generated per session and validated on submission.
  - REST API routes (those starting with `/rest` or `/api`) do **not** require CSRF tokens and are excluded from CSRF validation.

- **Public vs. Protected Routes:**
  - Public: `/login.html`, `/register.html`, `/forgot.html`, `/saveScript`, `/reset/...`
  - All other routes require authentication.

- **Example Authentication Flow:**
  1. User visits `/login.html` and submits credentials.
  2. If valid, `req.session.user` is set and the user is redirected to the app.
  3. All subsequent requests include the session cookie for authentication.

---

## Backup (Internal data) Management



#### Backup Items
`GET /api/backup/items` | List available backup data items.

| Property | Value | Example |
|---|---|---|
| **Input** | None | |
| **Output** | JSON array of backup data items | `["db", "config", "logs"]` |



#### Backup Create
`POST /api/backup/create` | Create a backup with provided options.

| Property | Value | Example |
|---|---|---|
| **Input** | JSON body with backup options | `{ "items": ["db", "config"] }` |
| **Output** | ZIP file (download) | `backuphub-backup-20260326.zip` |



#### Backup Restore
`POST /api/backup/restore` | Restore data from uploaded backup file.

| Property | Value | Example |
|---|---|---|
| **Input** | Multipart form-data with `backupFile` | `backuphub-backup-20260326.zip` |
| **Output** | JSON `{ success, itemsRestored, warnings, recommendations }` | `{ "success": true, "itemsRestored": ["db"], "warnings": [], "recommendations": [] }` |

---

## Notifications



#### Notifications List
`GET /rest/notifications` | Get all notifications.

| Property | Value | Example |
|---|---|---|
| **Input** | None | |
| **Output** | JSON array of notifications | `[ { "type": "info", "message": "Backup completed" } ]` |



#### Notifications Count
`GET /rest/notifications/count` | Get notification count.

| Property | Value | Example |
|---|---|---|
| **Input** | None | |
| **Output** | `{ count: number }` | `{ "count": 3 }` |



#### Notifications Delete All
`DELETE /rest/notifications` | Delete all notifications.

| Property | Value | Example |
|---|---|---|
| **Input** | None | |
| **Output** | 200 OK | `200` |



#### Notifications Delete by Index
`DELETE /rest/notifications/:index` | Delete notification at index.

| Property | Value | Example |
|---|---|---|
| **Input** | URL param: `index` | `2` |
| **Output** | 200 OK | `200` |



#### Notifications Test
`GET /rest/notifty/test` | Send a test notification.

| Property | Value | Example |
|---|---|---|
| **Input** | None | |
| **Output** | 200 OK | `200` |

---

## Agent Management



#### Agent Details
`GET /rest/agent/:id` | Get agent details by ID.

| Property | Value | Example |
|---|---|---|
| **Input** | URL param: `id` | `agent1` |
| **Output** | JSON agent object | `{ "id": "agent1", "status": "online" }` |



#### Agent Ping
`GET /rest/agent/:id/ping` | Ping agent by ID.

| Property | Value | Example |
|---|---|---|
| **Input** | URL param: `id` | `agent1` |
| **Output** | `{ status: "ok" }` | `{ "status": "ok" }` |



#### Agent History & Stats
`GET /rest/agentdetail?agentname=...&startDate=...&endDate=...` | Get agent history and stats for a date range.

| Property | Value | Example |
|---|---|---|
| **Input** | Query params: `agentname`, `startDate`, `endDate` | `agentname=agent1&startDate=2026-03-01&endDate=2026-03-26` |
| **Output** | JSON with filter, totalDuration, totalPct, history | `{ "filter": {"startDate": "2026-03-01", "endDate": "2026-03-26"}, "totalDuration": 1234, "totalPct": 100, "history": [...] }` |



#### Agent Query by Name
`GET /rest/agentquery?name=...` | Query agent by name.

| Property | Value | Example |
|---|---|---|
| **Input** | Query param: `name` | `agent1` |
| **Output** | JSON agent object | `{ "id": "agent1", "status": "online" }` |



#### Agent Update Status (Is Running)
`GET /rest/updateAgent/:agentId/isRunning` | Check if update job is running for agent.

| Property | Value | Example |
|---|---|---|
| **Input** | URL param: `agentId` | `agent1` |
| **Output** | JSON status and item | `{ "status": true, "item": {...} }` |



#### Agent Update Status (Detailed)
`GET /rest/updateAgent/:agentId/status` | Get update job status for agent.

| Property | Value | Example |
|---|---|---|
| **Input** | URL param: `agentId` | `agent1` |
| **Output** | JSON status, message, agent, item | `{ "status": "COMPLETED", "message": "", "agent": {...}, "item": {...} }` |



#### Agent Start Update Job
`POST /rest/updateAgent/:agentId` | Start update job for agent.

| Property | Value | Example |
|---|---|---|
| **Input** | URL param: `agentId`, JSON body `{ command: ... }` | `agent1`, `{ "command": "update.sh" }` |
| **Output** | `{ status: "ok" }` | `{ "status": "ok" }` |

---

## Templates



#### Templates List
`GET /rest/templates` | Get cached templates.

| Property | Value | Example |
|---|---|---|
| **Input** | None | |
| **Output** | JSON with templates | `{ "templates": [ ... ] }` |



#### Templates Refresh
`GET /rest/templates/refresh` | Refresh templates from repository.

| Property | Value | Example |
|---|---|---|
| **Input** | None | |
| **Output** | JSON with status | `{ "status": "refreshed" }` |

---

## Debug & System



#### Debug Info
`GET /rest/debug` | Get debug info (settings, connections, logger, etc).

| Property | Value | Example |
|---|---|---|
| **Input** | None | |
| **Output** | JSON debug object | `{ "settings": { ... }, "logger": { ... } }` |



#### Debug Logs
`GET /rest/debug/logs` | Get recent log messages.

| Property | Value | Example |
|---|---|---|
| **Input** | None | |
| **Output** | JSON array of log messages | `["Backup started", "Backup completed"]` |



#### Debug Logger Trace
`GET /rest/debug/on` | Set logger to trace level.

| Property | Value | Example |
|---|---|---|
| **Input** | None | |
| **Output** | `{ logger_level: "trace" }` | `{ "logger_level": "trace" }` |



#### Debug Logger Warn
`GET /rest/debug/off` | Set logger to warn level.

| Property | Value | Example |
|---|---|---|
| **Input** | None | |
| **Output** | `{ logger_level: "warn" }` | `{ "logger_level": "warn" }` |



#### Server Time
`GET /rest/servertime` | Get server time.

| Property | Value | Example |
|---|---|---|
| **Input** | None | |
| **Output** | `{ dateTime: ... }` | `{ "dateTime": "2026-03-26T12:34:56.789Z" }` |

---

## Other REST Endpoints



#### Jobs Config
`GET /rest/jobs` | Get job configuration (JSON).

| Property | Value | Example |
|---|---|---|
| **Input** | None | |
| **Output** | JSON config | `{ "jobs": [ ... ] }` |



#### ETA Config
`GET /rest/eta` | Get ETA/config info (JSON).

| Property | Value | Example |
|---|---|---|
| **Input** | None | |
| **Output** | JSON config | `{ "eta": 120 }` |



#### Script Details
`GET /rest/script/:script` | Get script details by name.

| Property | Value | Example |
|---|---|---|
| **Input** | URL param: `script` | `backupDB.sh` |
| **Output** | JSON script object | `{ "name": "backupDB.sh", "description": "Backup database" }` |

---

**Note:** Many additional HTML-rendering endpoints exist (e.g., `/login.html`, `/settings.html`), but this document focuses on REST-style JSON APIs.
