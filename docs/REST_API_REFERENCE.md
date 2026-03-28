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
  - [Notifications Create](#notifications-create)
  - [Notifications Update](#notifications-update)
  - [Notifications Count](#notifications-count)
  - [Notifications Delete All](#notifications-delete-all)
  - [Notifications Delete by Index](#notifications-delete-by-index)
  - [Notifications Test](#notifications-test)

  - [Job History List](#job-history-list)
  - [Job History Get](#job-history-get)
  - [Job History Create](#job-history-create)
  - [Job History Update](#job-history-update)
  - [Job History Delete](#job-history-delete)

  - [Running Jobs List](#running-jobs-list)
  - [Running Jobs Delete by Index](#running-jobs-delete-by-index)
  - [Running Jobs Delete by Name](#running-jobs-delete-by-name)
  - [Running Jobs Delete by Execution ID](#running-jobs-delete-by-execution-id)
  - [Running Jobs Delete All](#running-jobs-delete-all)

  - [User List](#user-list)
  - [User Get](#user-get)
  - [User Create](#user-create)
  - [User Update](#user-update)
  - [User Delete](#user-delete)

  - [Generic Key-Value Data](#generic-key-value-data)

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
`GET /api/backup/items` | List available backup data items that can be included in a backup.

| Property | Value | Example |
|---|---|---|
| **Input** | None | |
| **Output** | JSON object with available backup items | `{ "serverConfig": {...}, "agentsConfig": {...}, "userAccounts": {...} }` |

**Available items:**
- `serverConfig`: Server Configuration (MQTT, SMTP, WebSocket, Notifications, Thresholds, Icons)
- `agentsConfig`: Agents Configuration
- `schedules`: Backup Schedules
- `jobHistory`: Job Execution History
- `orchestrationJobs`: Orchestration Job Definitions
- `orchestrationExecutions`: Orchestration Execution History
- `agentHistory`: Agent Connection History
- `userAccounts`: User Accounts (with bcrypt-hashed passwords)

#### Create Backup
`POST /api/backup/create` | Create a backup zip file with selected items.

| Property | Value | Example |
|---|---|---|
| **Input** | JSON body with boolean flags for each item | `{ "serverConfig": true, "userAccounts": true, "jobHistory": false, ... }` |
| **Output** | Binary zip file attachment | `backuphub-backup-20260328.zip` |

**Request body options:**
```json
{
  "serverConfig": true,
  "agentsConfig": true,
  "schedules": true,
  "jobHistory": true,
  "orchestrationJobs": true,
  "orchestrationExecutions": true,
  "agentHistory": true,
  "userAccounts": true
}
```

#### Restore Backup
`POST /api/backup/restore` | Restore BackupHub settings and data from a backup zip file.

| Property | Value | Example |
|---|---|---|
| **Input** | Multipart form with `backupFile` | Upload `.zip` file created by `/api/backup/create` |
| **Output** | JSON with restore results | `{ "success": true, "itemsRestored": [...], "warnings": [...] }` |

**Response example:**
```json
{
  "success": true,
  "itemsRestored": [
    "Server Configuration",
    "Agents Configuration",
    "Backup Schedules",
    "User Accounts"
  ],
  "warnings": [],
  "recommendations": [
    "Restart the BackupHub server to ensure all changes take effect."
  ]
}
```

**Important:** After restoring a backup, restart the BackupHub server for all changes to take effect.




## Notifications

#### Notifications List
`GET /rest/notifications` | Get all notifications.

| Property | Value | Example |
|---|---|---|
| **Input** | None | |
| **Output** | JSON array of notifications | `[ { "type": "info", "message": "Backup completed" } ]` |

---

## Related Documentation

- [Installation](./installation.md): Setting up BackupHub
- [Backup Schedules](./backup-schedules.md): Creating and managing schedules
- [Orchestrations](./orchestrations.md): Building complex backup workflows
- [Settings Configuration](./settings-config.md): Server configuration options
- [User Management](./user-management.md): User accounts and permissions
- [Back to Documentation Index](./README.MD)

#### Notifications Create
`POST /rest/notifications` | Create a new notification.

| Property | Value | Example |
|---|---|---|
| **Input** | JSON body: `{ type, title, description, url }` | `{ "type": "info", "title": "Backup", "description": "Backup completed", "url": "http://..." }` |
| **Output** | JSON with created item | `{ "success": true, "item": { ... } }` |

#### Notifications Update
`PUT /rest/notifications/:index` | Update a notification by index.

| Property | Value | Example |
|---|---|---|
| **Input** | URL param: `index`, JSON body: `{ type, title, description, url }` | `1`, `{ "type": "warn", ... }` |
| **Output** | JSON with updated item | `{ "success": true, "item": { ... } }` |

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

## Job History

#### Job History List
`GET /rest/history` | Get all job history items.

| Property | Value | Example |
|---|---|---|
| **Input** | None | |
| **Output** | JSON array of job history items | `[ { ... }, ... ]` |

#### Job History Get
`GET /rest/history/:index` | Get a single job history item by index.

| Property | Value | Example |
|---|---|---|
| **Input** | URL param: `index` | `0` |
| **Output** | JSON job history item | `{ ... }` |

#### Job History Create
`POST /rest/history` | Create a new job history item.

| Property | Value | Example |
|---|---|---|
| **Input** | JSON body: job history item | `{ ... }` |
| **Output** | JSON with created item | `{ "success": true, "item": { ... } }` |

#### Job History Update
`PUT /rest/history/:index` | Update a job history item by index.

| Property | Value | Example |
|---|---|---|
| **Input** | URL param: `index`, JSON body: job history item | `1`, `{ ... }` |
| **Output** | JSON with updated item | `{ "success": true, "item": { ... } }` |

#### Job History Delete
`DELETE /rest/history/:index` | Delete a job history item by index.

| Property | Value | Example |
|---|---|---|
| **Input** | URL param: `index` | `1` |
| **Output** | JSON with success | `{ "success": true }` |

---

## Running Jobs

#### Running Jobs List
`GET /rest/running` | Retrieve all currently running jobs.

| Property | Value | Example |
|---|---|---|
| **Input** | None | N/A |
| **Output** | JSON array of running jobs | `{ "success": true, "count": 2, "jobs": [...] }` |

#### Running Jobs Delete by Index
`DELETE /rest/running/:index` | Delete a running job by its index in the queue.

| Property | Value | Example |
|---|---|---|
| **Input** | URL param: `index` | `0` |
| **Output** | JSON with success message | `{ "success": true, "message": "Running job at index 0 removed" }` |

#### Running Jobs Delete by Name
`DELETE /rest/running/byName/:jobName` | Delete a running job by its job name.

| Property | Value | Example |
|---|---|---|
| **Input** | URL param: `jobName` | `MyBackupJob` |
| **Output** | JSON with success message | `{ "success": true, "message": "Running job [MyBackupJob] removed" }` |

#### Running Jobs Delete by Execution ID
`DELETE /rest/running/byExecutionId/:executionId` | Delete a running job by its execution ID.

| Property | Value | Example |
|---|---|---|
| **Input** | URL param: `executionId` | `a1b2c3d4e5f6g7h8` |
| **Output** | JSON with success message | `{ "success": true, "message": "Running job with executionId [a1b2c3d4e5f6g7h8] removed" }` |

#### Running Jobs Delete All
`DELETE /rest/running` | Delete all running jobs.

| Property | Value | Example |
|---|---|---|
| **Input** | None | N/A |
| **Output** | JSON with success and count | `{ "success": true, "message": "All running jobs deleted", "deletedCount": 5 }` |

---

## User Management

#### User List
`GET /rest/users` | List all users (usernames and emails).

| Property | Value | Example |
|---|---|---|
| **Input** | None | |
| **Output** | JSON array of users | `[ { "username": "alice", "email": "alice@example.com" }, ... ]` |

#### User Get
`GET /rest/users/:username` | Get a user by username.

| Property | Value | Example |
|---|---|---|
| **Input** | URL param: `username` | `alice` |
| **Output** | JSON user object | `{ "username": "alice", "email": "alice@example.com" }` |

#### User Create
`POST /rest/users` | Create a new user.

| Property | Value | Example |
|---|---|---|
| **Input** | JSON body: `{ username, email, password }` | `{ "username": "bob", "email": "bob@example.com", "password": "secret" }` |
| **Output** | JSON with success | `{ "success": true }` |

#### User Update
`PUT /rest/users/:username` | Update a user's email or password.

| Property | Value | Example |
|---|---|---|
| **Input** | URL param: `username`, JSON body: `{ email?, password? }` | `alice`, `{ "email": "new@example.com" }` |
| **Output** | JSON with success | `{ "success": true }` |

#### User Delete
`DELETE /rest/users/:username` | Delete a user.

| Property | Value | Example |
|---|---|---|
| **Input** | URL param: `username` | `bob` |
| **Output** | JSON with success | `{ "success": true }` |

---

## Generic Key-Value Data

#### Get Value by Key
`GET /rest/data/:key` | Get value by key.

| Property | Value | Example |
|---|---|---|
| **Input** | URL param: `key` | `customKey` |
| **Output** | JSON with key and value | `{ "key": "customKey", "value": "some data" }` |

#### Create or Update Value by Key
`PUT /rest/data/:key` | Create or update value by key.

| Property | Value | Example |
|---|---|---|
| **Input** | URL param: `key`, JSON body: `{ value }` | `customKey`, `{ "value": "new data" }` |
| **Output** | JSON with success | `{ "success": true }` |

#### Delete Value by Key
`DELETE /rest/data/:key` | Delete value by key.

| Property | Value | Example |
|---|---|---|
| **Input** | URL param: `key` | `customKey` |
| **Output** | JSON with success | `{ "success": true }` |
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


---

## Schedule Management

The following endpoints allow you to read and delete schedule data. All endpoints require authentication.

#### List All Schedules
`GET /rest/schedules` | Get all schedules.

| Property    | Value         | Example |
|-------------|---------------|---------|
| **Input**   | None          |         |
| **Output**  | JSON array of schedules | `[ { "jobName": "BackupDB", ... }, ... ]` |

#### Get a Schedule by Job Name
`GET /rest/schedules/:jobName` | Get a specific schedule by job name.

| Property    | Value         | Example |
|-------------|---------------|---------|
| **Input**   | URL param: `jobName` | `BackupDB` |
| **Output**  | JSON schedule object | `{ "jobName": "BackupDB", ... }` |

#### Delete a Schedule by Job Name
`DELETE /rest/schedules/:jobName` | Delete a specific schedule by job name.

| Property    | Value         | Example |
|-------------|---------------|---------|
| **Input**   | URL param: `jobName` | `BackupDB` |
| **Output**  | JSON result   | `{ "success": true, "message": "Schedule [BackupDB] deleted" }` |

#### Delete All Schedules
`DELETE /rest/schedules` | Delete all schedules.

| Property    | Value         | Example |
|-------------|---------------|---------|
| **Input**   | None          |         |
| **Output**  | JSON result   | `{ "success": true, "message": "All schedules deleted" }` |

---

## Related Documentation

- [Installation](./installation.md): Setting up BackupHub
- [Backup Schedules](./backup-schedules.md): Creating and managing schedules
- [Orchestrations](./orchestrations.md): Building complex backup workflows
- [Settings Configuration](./settings-config.md): Server configuration options
- [User Management](./user-management.md): User accounts and permissions
- [Back to Documentation Index](./README.MD)

---

**Note:** Many additional HTML-rendering endpoints exist (e.g., `/login.html`, `/settings.html`), but this document focuses on REST-style JSON APIs.
