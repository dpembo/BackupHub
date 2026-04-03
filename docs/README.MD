
# BackupHub Documentation

BackupHub is a lightweight yet powerful solution for managing and scheduling shell-based executions across a local area network. Designed for IT administrators, it ensures secure, encrypted communication between a central hub and remotely managed agents. BackupHub streamlines job execution, scheduling, monitoring, and notifications, making it an effective tool for backup and automation tasks.

---

## Documentation Contents

- [Getting Started / Installation](installation.md)
- [Backup Schedules](backup-schedules.md)
- [Orchestrations](orchestrations.md)
- [User Management](user-management.md)
- [Configuration / Settings](settings-config.md): Rule-based thresholds, agent concurrency, and all server/agent options
- [Developer Guide](developer-guide.md)
- [REST API Reference](REST_API_REFERENCE.md)
- [Screenshots & UI Reference](screens/)

---

### About the Docs

- **installation.md** — How to install and set up BackupHub (Docker & manual)
- **backup-schedules.md** — Creating and managing backup schedules
- **orchestrations.md** — Building complex workflows with visual orchestration builder
- **user-management.md** — User setup, login, and password management
- **settings-config.md** — Server and agent configuration options, backup & restore
- **REST_API_REFERENCE.md** — API endpoints for programmatic access
- **screens/** — Visual reference for the UI and features


---

## New in v2: Rule-Based Thresholds & Agent Concurrency

- **Rule-Based Thresholds:** Define flexible rules to trigger jobs based on metrics (CPU, disk, file count, etc.)
- **Agent Concurrency:** Control how many jobs each agent can run in parallel (default: 3, configurable per agent)

See [settings-config.md](settings-config.md) for details and migration notes.

For more advanced topics, troubleshooting, and contributing, see the [Developer Guide](Developers/developer-guide.md).

---

Copyright (C)2025 pembo.co.uk

