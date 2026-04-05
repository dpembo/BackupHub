
![BackupHub Logo](./public/images/BackupHubColorBlue.png)

# BackupHub

**A lightweight, secure, and flexible solution for managing and scheduling shell-based executions across your network.**

BackupHub is designed for IT administrators, providing secure automation of complex tasks across multiple systems. Execute simple jobs or build sophisticated multi-step workflows (orchestrations), schedule them reliably, trigger them from external systems via webhooks, and monitor everything in real-time from a centralized web dashboard.

**Why Choose BackupHub?**
- ✅ **Build Complex Workflows** — Multi-step orchestrations with conditional logic, parallel execution, and data flow between steps (not just single scripts)
- ✅ **Real-Time Visibility** — Live monitoring dashboard shows job progress as it executes, not after completion
- ✅ **Distributed Execution** — Manage and execute jobs across hundreds of remote agents from a single hub
- ✅ **Webhook Integration** — Trigger jobs and orchestrations from external systems (monitoring tools, CI/CD pipelines, webhooks)
- ✅ **Metric-Triggered Automation** — Jobs receive metric data automatically (disk usage, CPU, etc.) for intelligent automation
- ✅ **Enterprise-Ready** — Multi-user with role-based access, encrypted communication, comprehensive audit logs
- ✅ **Easy to Deploy** — Works with Docker (recommended), system services, PM2, or cron. Pre-built templates for common tasks.
- ✅ **100% Open Source** — MIT Licensed, no vendor lock-in

![BackupHub Job Monitor Screenshot](https://github.com/dpembo/BackupHub/blob/main/docs/screens/job-monitor.png?raw=true "Job Monitor Dashboard")

<p align="left">
   <a href="https://github.com/dpembo/BackupHub/actions"><img src="https://img.shields.io/github/workflow/status/dpembo/BackupHub/CI?label=build" alt="Build Status"></a>
   <a href="https://github.com/dpembo/BackupHub/blob/main/LICENSE"><img src="https://img.shields.io/github/license/dpembo/BackupHub.svg" alt="License"></a>
   <a href="https://github.com/dpembo/BackupHub/releases"><img src="https://img.shields.io/github/v/release/dpembo/BackupHub?include_prereleases&label=release" alt="Release"></a>
</p>

## Table of Contents
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Contributing](#contributing)
- [License](#license)
- [Support](#support)


## Features

**Complex Workflow Automation (Orchestrations)**
- Design multi-step workflows with visual node editor (sequences, parallel branches, conditional logic)
- Execute scripts across multiple agents with data flow between steps
- Monitor live progress in real-time as workflows execute
- Trigger entire orchestrations via webhooks with dynamic parameter substitution
- Reusable workflow components for complex backup, migration, and operational tasks

**Management Features**
- Agent provisioning: cron, system service, Docker, or PM2
- Centralized agent management and user management (multi-user, RBAC)
- Dashboard insights: visualize job performance and system status
- Webhook job triggers with API key security
- Webhook management interface in settings (create, edit, rotate keys, delete)
- Multi-agent distribution for scalable execution

**Execution & Scheduling**
- Secure, token-based script execution across distributed agents
- Inline script editor with templates for common tasks
- Flexible scheduling: daily, weekly, monthly, and rule-based metric thresholds
- **Trigger Context System**: Scripts and orchestrations receive metric data when triggered by rules
- Timezone support for global operations
- Concurrent job execution per agent (configurable, default: 3 jobs per agent)

**Real-Time Monitoring & Notifications**
- Live dashboard showing running jobs and orchestrations with progress tracking
- View live execution logs as jobs run (no waiting for completion)
- Real-time updates via WebSocket
- Alerts: email, webhooks, in-app notifications, and console logging
- Execution history with searchable logs and performance metrics
- Failed job notifications with root cause analysis

**Communication & Security**
- Encrypted communication between hub and agents (shared secret)
- MQTT/WebSocket support for flexible deployment scenarios
- Webhook API with UUID-based API keys
- Token-based authentication for all API endpoints
- Per-user access control (RBAC)

## Webhook System

BackupHub includes a complete webhook system allowing external data and metrics to flow into any job whether this is a single script or an orchestratinon, facilitated by a User-friendly webhook management section within the settings


## Key Capabilities & Use Cases

**Automated Backup & Recovery Workflows**
- Orchestrate multi-step backups: pre-backup snapshots → backup execution → verification → cleanup
- Trigger backups from external monitoring systems via webhooks
- Execute backups across multiple systems in parallel
- Live monitor backup progress with step-by-step execution tracking

**Metric-Triggered Automation**
- Automatically purge files when disk usage exceeds thresholds
- Issue system reboots based on uptime or resource metrics
- Spin up resources when CPU/memory reaches critical levels
- All with metric data automatically passed to your scripts

**Distributed Operations**
- Manage jobs across hundreds of agents from a single hub
- Execute workflows with steps distributed across multiple systems
- Parallel execution with data flow between sequential steps
- Agent load balancing with per-agent concurrency control

**Enterprise Integration**
- Expose BackupHub capabilities via REST API for third-party integration
- Chain orchestrations together for complex multi-stage operations
- Notify external systems when orchestrations complete (email, webhooks, HTTP calls)
- Audit trail of all job executions with detailed logs


## Pre-Built Templates (Get Started Instantly)

Launch common backup and automation tasks in seconds:

- **Backup Proxmox VM** — Automate VM snapshots and backups with Proxmox API integration
- **Backup MySQL/MariaDB** — Dump databases with automatic compression and rotation
- **Rsync Between Directories** — Synchronize data between systems with flexible filtering
- **Delete Files** — Remove specified files with audit logging
- **Issue Reboot** — Schedule system reboots with customizable delays
- **Purge Files Older Than** — Automatic retention policies (clean up files older than X days)
- **Purge Files by Pattern & Age** — Smart cleanup using wildcards (e.g., `*.log` files older than 30 days)
- **Mount Threshold Exceeded** — Auto-trigger on disk usage alerts
- **Cloud Storage Upload** — Deploy using rclone to AWS S3, Google Drive, Azure, Dropbox, etc.

**Tips**: Use templates as-is for quick setup, or customize them for your environment. Create your own reusable templates for repeated tasks.


## Technology Stack
| Component      | Description                                      |
|---------------|--------------------------------------------------|
| Hub           | Node.js, web-based interface                     |
| Agents        | Node.js CLI, Linux, Bash for script execution    |
| Communication | Encrypted (shared secret), WebSocket/MQTT        |
| Notifications | Email, webhooks, in-app, console                 |


## Quick Start
**Recommended:** Use Docker for the hub. Agents can be installed separately on Linux hosts.

### Prerequisites
- Node.js (v20+)
- Docker (recommended for BackupHub server deployment)
- Linux environment for agents

### Docker Setup (Recommended)
```bash
docker pull ghcr.io/dpembo/backuphub/hub:latest
docker run -d --name BackupHub -e TZ=Europe/London -p 8082:8082 -p 49981:49981 --restart unless-stopped \
  -v /custom/BackupHub/data:/usr/src/app/data \
  -v /custom/BackupHub/scripts:/usr/src/app/scripts \
  -v /custom/BackupHub/logs:/usr/src/app/logs \
  ghcr.io/dpembo/backuphub/hub:latest
```
Access the web interface at [http://localhost:8082](http://localhost:8082).

### Manual Setup
```bash
git clone https://github.com/dpembo/BackupHub.git
cd BackupHub
npm install
node server.js
```
Access the web interface at [http://localhost:8082](http://localhost:8082).

For agent installation and advanced configuration, see the [Quick Start Guide](https://github.com/dpembo/BackupHub/blob/main/docs/installation.md).


## Usage

### Initial Setup
1. Open the web interface at [http://localhost:8082](http://localhost:8082).
2. Register a new user (username, email, password).
3. Log in to access the dashboard.

### Agent Setup
1. Go to the **Agents** screen in the web interface.
2. Click the (+) button to generate agent installation commands.
3. Run the commands on the target machine, configuring the agent with a unique name, WebSocket settings, and start method (PM2, cron, or Docker).
4. See the [Quick Start Guide](https://github.com/dpembo/BackupHub/blob/main/docs/installation.md) for more details.

### Managing Jobs
- Use the inline script editor to create or edit scripts.
- Use the templates icon for quick job setup (e.g., `Test-5-Seconds.sh`).
- Templates are available for Proxmox, rsync, MySQL/MariaDB, and more.
- Schedule jobs via the dashboard (daily, weekly, custom).
- Monitor job status and logs in real-time.

### Common Tasks & FAQ
For comprehensive documentation on all features, see:
- **[Installation & Setup](docs/installation.md)** — Getting BackupHub running
- **[Backup Schedules](docs/backup-schedules.md)** — Creating and managing schedules
- **[Orchestrations](docs/orchestrations.md)** — Building complex workflows
- **[User Management](docs/user-management.md)** — User accounts and access control
- **[Configuration & Settings](docs/settings-config.md)** — Server configuration, backup/restore
- **[REST API Reference](docs/REST_API_REFERENCE.md)** — Programmatic API access
- **[Screenshots & UI Reference](docs/screens/)** — Visual guide to the interface
- **[Full Documentation](docs/README.MD)** — Complete documentation index

## Trigger Context System (Smart Automation)

Automatically pass metric data from rules to your scripts and orchestrations:

**How It Works:**
- **Rule-Based Triggers**: When a threshold rule fires (e.g., disk > 90%), scripts receive metric data as environment variables
- **Webhook Triggers**: External systems trigger jobs with custom parameters via API
- **Dynamic Parameter Substitution**: Orchestrations can use template syntax: `#{context.metric.value}`, `#{context.metric.path}`
- **Environment Variables**: Scripts access metrics via `$BACKUPHUB_METRIC_VALUE`, `$BACKUPHUB_METRIC_PATH`, etc.

**Real-World Example** — Disk Cleanup Script (auto-triggered when usage hits 90%):
```bash
#!/bin/bash
if [ "$BACKUPHUB_METRIC_TYPE" = "mount_usage" ]; then
    TARGET_DIR="$BACKUPHUB_METRIC_PATH"
    USAGE="${BACKUPHUB_METRIC_VALUE}%"
    echo "Alert: $TARGET_DIR is at $USAGE capacity. Cleaning up files older than 30 days..."
    find "$TARGET_DIR" -type f -mtime +30 -delete
    df -h "$TARGET_DIR"
fi
```

The script automatically receives the mount path and usage percentage — no manual configuration needed!

**Getting Started?** See [WEBHOOK_QUICKSTART.md](./WEBHOOK_QUICKSTART.md) for step-by-step guides.

**Advanced Documentation**: See [TRIGGER_CONTEXT_GUIDE.md](./TRIGGER_CONTEXT_GUIDE.md) for detailed examples, webhook API, orchestration templates, and more.


## Orchestrations: Building Complex Workflows

Move beyond simple scripts. BackupHub's orchestration engine lets you build sophisticated multi-step workflows with:

- **Visual Node Editor** — Design workflows graphically (no coding required for connection logic)
- **Multiple Node Types**: 
  - **Execute** — Run scripts on any agent
  - **Condition** — Branch logic (if/then/else)
  - **Parallel** — Run multiple steps simultaneously
  - **Sequence** — Ensure steps run in order
  - **Delay** — Add wait periods between steps
  - **Notification** — Send alerts at any step
- **Data Flow** — Pass results from one step to the next
- **Error Handling** — Retry logic, skip-on-error, or fail-entire-workflow options
- **Real-Time Monitoring** — Watch orchestrations execute step-by-step with live logs
- **Webhook Triggering** — Trigger entire orchestrations from external systems

**Example Workflow: Multi-System Database Backup**
1. Pre-backup: Flush database caches (Execute on DB agent)
2. Backup: Run mysqldump (Execute, passes data forward)
3. Verify: Check backup integrity (Execute, conditional based on backup output)
4. Archive: Compress backup (Execute)
5. In Parallel:
   - Upload to S3 (Execute via rclone)
   - Send notification (Notification node)
6. Cleanup: Remove old backups (Execute)

All with live progress tracking and automatic error handling. Plus: trigger the entire workflow via webhook from your CI/CD pipeline!

See [docs/orchestrations.md](docs/orchestrations.md) for detailed documentation and examples.


## Configuration
| Parameter Type         | Details                                                        |
|-----------------------|----------------------------------------------------------------|
| Environment Variables | `TZ` (e.g., `Europe/London`), `BACKUPHUB_ENCRYPTION_KEY`, etc.  |
| Volumes               | `/usr/src/app/data`, `/usr/src/app/scripts`, `/usr/src/app/logs`|
| Ports                 | `8082` (web app), `49981` (WebSocket)                          |

- Configure settings via the web interface or environment variables.
- Ensure the hub and agents use the same secret key for secure communication.
- For a full list of environment variables and configuration options, see [settings-config.md](docs/settings-config.md).


## Contributing
Contributions are welcome!

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your_feature`.
3. Commit your changes: `git commit -m 'Add your_feature'`.
4. Push to the branch: `git push origin feature/your_feature`.
5. Open a pull request.

Please adhere to the project’s coding standards and include tests where applicable.
See [tests/TESTING.md](tests/TESTING.md) and [agent/tests/TESTING.md](agent/tests/TESTING.md) for test details.


## License
This project is licensed under the MIT License. See the [LICENSE](https://github.com/dpembo/BackupHub/blob/main/LICENSE) file for details.


## Support
For issues or feature requests, open an issue on [GitHub Issues](https://github.com/dpembo/BackupHub/issues).
For general inquiries, please use GitHub Discussions or open an issue.
