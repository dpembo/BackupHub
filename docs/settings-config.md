# Settings
Access setings from the user profile menu in the hub


## Server

### Server Location
This is used in emails/notifications to enable you to link back to the server.  You can change this if you utilize a reverse proxy server to provide HTTPS, or an alternate URL.

| Name      | Description | Example  |
|---        |---|---|
|Protocol   | server protocol, e.g. http or https   | http  |
|Hostname   | Server name/ip  | 192.168.1.20  |
|Port       | Server Port     | 8082  |

### Server Properties

| Name | Description | Example  |
|---        |---|---|
|Timezone   | Server Timezone that backup jobs are displayed in to ensure these use your location time  | Europe/London  |
|Log Level  | Amount of log output to console, varies from 'Debug' (most) to 'Error' (least)  | Info  |

---
---

## WebSocket
Properties for the WebSocket server that can be used for agent/hub communication.  This is the recommended protocol for agent communication as this requires no external software and works out of the box
| Name      | Description | Example  |
|---|---|---|
| Enable    | Whether websocket connection is on/off| on|
| Hostname | hostname of WebSocket server, typically set to localhost | localhost |
| Port | WebSocket server port, by default set to 49981 | 49981

---
---

## MQTT
Properties for the MQTT server (such as [Eclipse Mosquitto](https://mosquitto.org/)) that can be used for agent/hub communication.  This is a secondary and alternative protocol for agent communication where there exists a very large number of agents

| Name      | Description | Example  |
|---|---|---|
| Enable    | Whether MQTT connection is on/off| on|
| Hostname | hostname of MQTT server, typically set to localhost | localhost |
| Port | MQTT server port, by default set to 49981 | 49981
| Username | Username for authenticated MQTT Serer | user |
| Password | Password for authenticated MQTT Server | Password |

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
| Disconnect duration before notification | Time (in seconds) between a disconnect/reconnect before a notificaton is sent.  If the server reconnects in this time range, no notification is sent| 10 (secs)|

### SMTP
Settings for SMTP server which will be used is the alert notification type is set to email
| Name      | Description | Example  |
|---|---|---|
| Enable    | Whether MQTT connection is on/off| on|
| SMTP Host | hostname of MQTT server, typically set to localhost | localhost |
| SMTP Port | MQTT server port, by default set to 49981 | 49981
| Secure    | Whether SMTP server uses secure comms or not | true
| SMTP Username | Username for SMTP Serer | user |
| SMTP Password | Password for SMTP Server | Password |
| Email from | Sender email address | BackupHub@email.com |
| Email to | Receipient email address | receiver@email.com |

### webHook
Settings for webhook URL which will be used is the alert notification type is set to webhook
| Name      | Description | Example  |
|---|---|---|
| webhook URL    | URL for a webhook that receives the notification text via a post | http://192.168.1.49:1880/mywebhook |

---
---

##Threshold Jobs
Settings that control threshold jobs such as CPU consumption, or storage space
| Name      | Description | Example  |
|---|---|---|
| CPU Threshold | Percentage CPU consumption which results in any CPU threshold jobs being executed  | 85 (%) |
| Storage Threshold | Percentage sotrage consumption for any mounted volumes which results in any storage threshold jobs being executed | 90 (%) |
| Threshold Job Cooldown | Time in minutes before a threshold job would be repeated if the condition hasn't changed | 60 (mins) |

---
---

## Job Icons
Provide and add any icon name from [here](https://marella.me/material-icons/demo/) into the list by pressing the [+] button, then the icon can be used to identify any schedule you create.  Additionally, you can press the trash can icon to delete an icon you don't want to use in schedule configuration.


# Data Directory

Configuration file can be found in 
`data/server-config.json`

The majority of th settings can be changed from the user experience.  It is not recommended to change the configuration file directly, however you should mount the data directory if running the hub via docker, and retain this between upgrades of the hub.

The data directoy contains all the configuration files, as well as data stores.
