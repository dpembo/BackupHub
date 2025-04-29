![image info](./public/images/BackupHubColorBlue.png)

#BackupHub
BackupHub is a lightweight yet powerful solution for managing and scheduling shell-based executions across a local area network. Designed for IT administrators, it ensures secure, encrypted communication between a central hub and remotely managed agents. BackupHub streamlines job execution, scheduling, monitoring, and notifications, making it an effective tool for backup and automation tasks.

![BackupHub Screenshot](https://github.com/dpembo/BackupHub/blob/main/docs/screens/job-monitor.png?raw=true)

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
- **Agent Provisioning**: Supports cron, system service, Docker, or PM2 for agent setup.
- **Agent Management**: Centralized control of remote agents.
- **Secure Execution**: Token-based authentication for safe script execution.
- **Inline Script Editor**: Create and edit scripts with templated examples.
- **User Management**: Multi-user support with role-based access control.
- **Comprehensive Job Monitoring**: Track job status and history.
- **Dashboard Insights**: Visualize job performance and system status.
- **Flexible Scheduling**: Daily, weekly, monthly, or threshold-based schedules.
- **Timezone Support**: Configure for global operations.
- **Efficient Communication**: Uses WebSocket/MQTT for real-time updates.
- **Alerts & Notifications**: Email, webhooks, in-app alerts, and console output.
- **Customizable UI**: Tailor the interface to your needs.

## Backup Templates Included
- **Backup proxmox VM**: Backups a VM from proxmox given the VM id
- **Backup MySQL/MariaDN DB**: Runs a mysql dump of a database and moves it to a directory
- **Delete Files**: Deletes files from a provided list
- **Issue Reboot**: Issues reboot after a given delay
- **Purge File Older than**: Purges files older than defined period (in days)
- **Purge Files Matching wildcard Older than**: Purges files that match a wildcard and are older than defined period (in days)
- **Rsync between two directories**: Performs a one-way Rsync between provided source and target directory
- **Mount Threshold exceeded**: Sample to use when a mounted volume uses storage greater than value provided in settings
- **Upload to Cloud Storage**: Using rclone, allows you to move files to many different cloud storage providers

## Technology Stack
- **Hub**: Built with Node.js, accessible via a web-based interface.
- **Agents**: Node.js CLI-based, running on Linux with Bash for script execution.
- **Communication**: Encrypted with a shared secret key, using WebSocket/MQTT for real-time updates.
- **Notifications**: Supports webhooks for external alerting systems.

## Installation
### Prerequisites
- Node.js (v20+)
- Docker (recommended for BackupHub server deployment)
- Linux environment for agents

### Docker Setup (Recommended)
1. Pull the latest BackupHub image:
   ```bash
   docker pull ghcr.io/dpembo/backuphub/hub:latest
   ```
2. Run the container with the following command:
   ```bash
   docker run -d --name BackupHub -e TZ=Europe/London -p 8082:8082 -p 49981:49981 --restart unless-stopped -v /custom/BackupHub/data:/usr/src/app/data -v /custom/BackupHub/scripts:/usr/src/app/scripts -v /custom/BackupHub/logs:/usr/src/app/logs ghcr.io/dpembo/backuphub/hub:latest
   ```
3. Access the web interface at `http://localhost:8082`.

### Manual Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/dpembo/BackupHub.git
   cd BackupHub
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the hub:
   ```bash
   node server.js
   ```
4. Access the web interface at `http://localhost:8082`.

## Usage
1. **Initial Setup**:
   - Open the web interface at `http://localhost:8082`.
   - Register a new user with a username, email, and password.
   - Log in to access the dashboard.
2. **Agent Setup**:
   - Navigate to the "Agents" screen in the web interface.
   - Click the (+) button to generate agent installation commands.
   - Copy and run the commands on the target machine, configuring the agent with a unique name, WebSocket settings, and start method (e.g., PM2, cron, or Docker).
   - For more information see the quick start guide  [here](https://github.com/dpembo/BackupHub/blob/main/docs/installation.md)
3. **Managing Jobs**:
   - Use the inline script editor to create or edit scripts.
   - Pressing the templates icon in the editor will give you a quick start.  There's a simple test job named ```Test-5-Seconds.sh``` which should be great to test the setup.
   - Other templates are available for jobs regarding proxmox, rsync, mysql/mariadb, and more
   - Schedule jobs via the dashboard (daily, weekly, or custom).
   - Monitor job status and logs in real-time.

## Configuration
| **Parameter Type**       | **Details**                                                                 |
|--------------------------|-----------------------------------------------------------------------------|
| **Environment Variables**| `TZ` (e.g., `Europe/London`), `BACKUPHUB_ENCRYPTION_KEY` (change default)   |
| **Volumes**              | `/usr/src/app/data`, `/usr/src/app/scripts`, `/usr/src/app/logs`           |
| **Ports**                | `8082` (web app), `49981` (WebSocket)                                      |

- Configure settings via the web interface or environment variables.
- Ensure the hub and agents use the same secret key for secure communication.

## Contributing
Contributions are welcome! To contribute:
1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your_feature`.
3. Commit your changes: `git commit -m 'Add your_feature'`.
4. Push to the branch: `git push origin feature/your_feature`.
5. Open a pull request.

Please adhere to the project’s coding standards and include tests where applicable.

## License
This project is licensed under the MIT License. See the [LICENSE](https://github.com/dpembo/BackupHub/blob/main/LICENSE) file for details.

## Support
For issues or feature requests, open an issue on [GitHub Issues](https://github.com/dpembo/BackupHub/issues). For general inquiries, contact [support@example.com](mailto:support@example.com).
