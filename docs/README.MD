
# BackupHub Documentation

BackupHub is a lightweight yet powerful solution for managing and scheduling shell-based executions across a local area network. Designed for IT administrators, it ensures secure, encrypted communication between a central hub and remotely managed agents. BackupHub streamlines job execution, scheduling, monitoring, and notifications, making it an effective tool for backup and automation tasks.

---

## Documentation Contents

- [Getting Started / Installation](installation.md)
- [Backup Schedules](backup-schedules.md)
- [Orchestrations](orchestrations.md)
- [User Management](user-management.md)
- [Configuration / Settings](settings-config.md): Rule-based thresholds, agent concurrency, webhook management, and all server/agent options
- [**Trigger Context Guide**](../TRIGGER_CONTEXT_GUIDE.md) — Scripts and orchestrations receiving metric data from rules
- [**Webhook User Guide**](WEBHOOK_USER_GUIDE.md) — Complete guide to creating and using webhooks
- [Developer Guides](Developers/):
  - [Phase 1: Trigger Context System](Developers/phase1-trigger-context-guide.md)
  - [Phase 2: Webhooks Database & API](Developers/phase2-webhooks-developer-guide.md)
  - [Phase 3: Webhook Management UI](Developers/phase3-webhook-ui-guide.md)
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
- **Trigger Context System:** Scripts and orchestrations receive metric data when triggered by rules, enabling intelligent decision-making

See [settings-config.md](settings-config.md) for details and migration notes.

### Trigger Context Features

- **Scripts Access Metric Data**: When triggered by rules, scripts receive environment variables containing metric values
  - `$BACKUPHUB_METRIC_VALUE`, `$BACKUPHUB_METRIC_PATH`, `$BACKUPHUB_CONDITION_THRESHOLD`, etc.
  
- **Orchestrations Use Template Substitution**: Reference metric values in script parameters
  - `#{context.metric.value}` → automatically replaced with actual metric value
  
- **Webhook Triggers**: External systems can trigger jobs with custom data via `/api/webhook/trigger/:jobName?key=<uuid>`

- **Webhook Management UI**: Manage webhooks through the Settings page (Settings → Webhooks tab)
  - Create/edit webhooks with names and descriptions
  - Generate and rotate API keys securely
  - View webhook activity (trigger count, last triggered time)
  - Delete webhooks with confirmation
  - No more curl commands needed!

**Example**: Cleanup script triggered when disk usage exceeds 90%:
```bash
if [ "$BACKUPHUB_METRIC_TYPE" = "mount_usage" ]; then
    echo "Cleaning up $BACKUPHUB_METRIC_PATH (${BACKUPHUB_METRIC_VALUE}% usage)"
fi
```

See [TRIGGER_CONTEXT_GUIDE.md](../TRIGGER_CONTEXT_GUIDE.md) for complete examples, webhook API, and template substitution syntax.

For more advanced topics, troubleshooting, and contributing, see the [Developer Guide](Developers/developer-guide.md).

---

Copyright (C)2025 pembo.co.uk

