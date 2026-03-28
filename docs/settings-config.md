
# Settings

Most settings can be changed from the user profile menu in the hub UI. The configuration file is located at `data/server-config.json`. It is not recommended to edit the file directly unless necessary. If running the hub via Docker, mount the data directory and retain it between upgrades.


## Server


### Server Location
This is used in emails/notifications to enable you to link back to the server. You can change this if you utilize a reverse proxy server to provide HTTPS, or an alternate URL.

| Name      | Description | Example  |
|---        |---|---|
| Protocol   | Server protocol, e.g. http or https   | http  |
| Hostname   | Server name/ip  | 192.168.1.20  |
| Port       | Server Port     | 8082  |


### Server Properties

| Name      | Description | Example  |
|---        |---|---|
| Timezone  | Server timezone for displaying backup jobs | Europe/London |
| Log Level | Numeric value (0=Error, 1=Warn, 2=Info, 3=Verbose, 4=Debug). Higher = more output. | 2 |

---
---


## WebSocket
Properties for the WebSocket server that can be used for agent/hub communication. This is the recommended protocol for agent communication as it requires no external software and works out of the box.
| Name      | Description | Example  |
|---|---|---|
| Enable    | Whether websocket connection is on/off | on |
| Hostname  | Hostname of WebSocket server, typically set to localhost | localhost |
| Port      | WebSocket server port, by default set to 49981 | 49981 |

---
---


## MQTT
Properties for the MQTT server (such as [Eclipse Mosquitto](https://mosquitto.org/)) that can be used for agent/hub communication. This is a secondary and alternative protocol for agent communication where there exists a very large number of agents.

| Name      | Description | Example  |
|---|---|---|
| Enable    | Whether MQTT connection is on/off | on |
| Hostname  | Hostname of MQTT server, typically set to localhost | localhost |
| Port      | MQTT server port, by default set to 1883 | 1883 |
| Username  | Username for authenticated MQTT Server | user |
| Password  | Password for authenticated MQTT Server | Password |

---
---

## Notifications
Configuration of notifications for job errors, disconnect/reconnect of agents, etc.

### Alerting

Alerts can be sent to either a webhook, an email address, or just to the console (depending on the log level also)
| Name      | Description | Example  |
|---|---|---|
| Notification Type    | Webhook, Email or Console| Console|


### Configuration
| Name      | Description | Example  |
|---|---|---|
| Disconnect duration before notification | Time (in seconds) between a disconnect/reconnect before a notification is sent. If the server reconnects in this time range, no notification is sent. Default: 5 | 5 (secs) |


### SMTP
Settings for SMTP server, used if the alert notification type is set to email.
| Name      | Description | Example  |
|---|---|---|
| Enable    | Whether SMTP connection is on/off | on |
| SMTP Host | Hostname of SMTP server, typically set to localhost | localhost |
| SMTP Port | SMTP server port | 587 |
| Secure    | Whether SMTP server uses secure comms or not | true |
| SMTP Username | Username for SMTP Server | user |
| SMTP Password | Password for SMTP Server | Password |
| Email from | Sender email address | BackupHub@email.com |
| Email to | Recipient email address | receiver@email.com |


### Webhook
Settings for webhook URL, used if the alert notification type is set to webhook.
| Name      | Description | Example  |
|---|---|---|
| webhook URL    | URL for a webhook that receives the notification text via a POST | http://192.168.1.49:1880/mywebhook |

---
---


## Threshold Jobs
Settings that control threshold jobs such as CPU consumption or storage space.
| Name      | Description | Example  | Default |
|---|---|---|---|
| CPU Threshold | Percentage CPU consumption which results in any CPU threshold jobs being executed  | 90 (%) | 90 |
| Storage Threshold | Percentage storage consumption for any mounted volumes which results in any storage threshold jobs being executed | 25 (%) | 25 |
| Threshold Job Cooldown | Time in minutes before a threshold job would be repeated if the condition hasn't changed | 30 (mins) | 30 |

---
---

## Job Icons
Provide and add any icon name from [here](https://marella.me/material-icons/demo/) into the list by pressing the [+] button, then the icon can be used to identify any schedule you create.  Additionally, you can press the trash can icon to delete an icon you don't want to use in schedule configuration.

---
---

## Backup & Restore

BackupHub provides comprehensive backup and restore functionality to protect your configuration and data. Backups can be created and restored through the Settings page.

### What Gets Backed Up

The following items can be included in backups:

| Item | Description |
|---|---|
| **Server Configuration** | MQTT, SMTP, WebSocket, Notifications, Thresholds, Icons settings |
| **Agents Configuration** | All registered agent configurations |
| **Backup Schedules** | All configured backup schedules |
| **Job Execution History** | Historical logs of all backup job executions |
| **Orchestration Jobs** | All configured orchestration job definitions |
| **Orchestration Execution History** | Historical records of orchestration job executions |
| **Agent Connection History** | Historical logs of agent connections |
| **User Accounts** | All registered user accounts with bcrypt-hashed passwords |

### Creating a Backup

1. Navigate to **Settings** (gear icon in top menu)
2. Scroll to **Backup & Restore** section
3. Click **Create Backup**
4. Select which items to include in the backup
5. Click **Create** — a `.zip` file will download automatically
6. Store the backup file in a safe location

### Restoring from Backup

1. Navigate to **Settings** (gear icon in top menu)
2. Scroll to **Backup & Restore** section under **Restore from Backup**
3. Click **Choose File** and select a previously saved backup `.zip` file
4. Click **Restore Backup**
5. The system will restore all selected items from the backup
6. **Restart the BackupHub server** to ensure all changes take effect

### Important Notes

- **No encryption key needed**: User passwords are bcrypt-hashed (not encrypted), so backups can be restored to any BackupHub installation
- **User accounts included**: When you restore a backup, all user accounts are restored with their original login credentials
- **Historical data**: Job history and execution logs are included, so you maintain a complete record of past executions
- **Server restart required**: After restoring a backup, restart the BackupHub server for all changes to take effect
- **Backup location**: Keep backups in a secure location; treat them as sensitive data since they contain service credentials

---
---

# Data Directory

Configuration file can be found in `data/server-config.json`.

The majority of the settings can be changed from the user experience. It is not recommended to change the configuration file directly. If running the hub via Docker, mount the data directory and retain it between upgrades of the hub.

The data directory contains all the configuration files, as well as data stores.

---

## Related Documentation

- [Installation](./installation.md): Setting up BackupHub
- [Backup Schedules](./backup-schedules.md): Creating and managing schedules
- [Orchestrations](./orchestrations.md): Building complex workflows
- [User Management](./user-management.md): User accounts and access control
- [REST API Reference](./REST_API_REFERENCE.md): API endpoints
- [Back to Documentation Index](./README.MD)
