
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



# Data Directory

Configuration file can be found in `data/server-config.json`.

The majority of the settings can be changed from the user experience. It is not recommended to change the configuration file directly. If running the hub via Docker, mount the data directory and retain it between upgrades of the hub.

The data directory contains all the configuration files, as well as data stores.
