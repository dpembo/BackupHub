# Getting Started
This secition of the docs guides you through getting started with BackupHub

## BackupHub Server

The BackupHub server is recommended to be installed and executed through the released container image in this repository, however you can run this directly on your server using node

### Container Setup

#### Pre-requisites
Please ensure you have Docker or any other container execution platform installed.  This documentation assumes the usage of Docker

#### Start an instance of this image

The latest version image can be found here:
```ghcr.io/dpembo/backuphub/hub:latest```

If you want specific versions, you can find these in the packages section of this repository

Starting a Backup server instance is simple:

```
docker run \
  -d \
  --name BackupHub \
  -e TZ=Europe/London \
  -p 8082:8082 \
  -p 49981:49981 \  
  --restart unless-stopped \ 
  -v /custom/BackupHub/data:/usr/src/app/data \
  -v /custom/BackupHub/scripts:/usr/src/app/scripts \ 
  -v /custom/BackupHub/logs:/usr/src/app/logs \
  ghcr.io/dpembo/backuphub/hub:latest
```

#### Parameter Details



| Environment Variable | Description | Example |
|---|---|--|
| TZ | Time zone to ensure the container operates in your correct time zone for display of date/times.  Time zone names follow the standard IANA database, of which you can find a list via [wikipedia](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)| Europe/London |
| BACKUPHUB_ENCRYPTION_KEY | This variable is used to provide the encryption key used between the Hub and Agents to ensure the data/commmands cannot be compromised, or the link from agent to server be misued.  This has a default value, but its recommended to change this|MySecretKey|
| | | |
| **Volume** | **Description** | **Example** |
| /usr/src/app/data | This volume is used to hold all the various data that BackupHub uses including job history, user setup, configuration and statistics |-v custom/data:/usr/src/app/data
| usr/src/app/scripts | This is where all your backup/any other shell scripts you schedule are stored|/etc/scripts|
| usr/src/app/logs | Directory where log information can be outputted|/var/logs/BackupHub|
| | | |
| **Port** | **Description** | **Example** |
| 8082 | The port the web application is hosted on | -p 8080:8082 |
| 49981 | websocket server port used for server/agent communication | -p 49981:49981 |

### Manual Installation
Details instructions are provided here as it's recommended to run this from the container image, however it is just a node.js server applciation, so can be setup by: 
* Cloning the repo
* Installing Node (v20/v21)
* Using NPM to install libs
* Setting environment variables appropritate
* Launching the app (server.js)

## BackupHub Agent
Once logged into the Hub, simply press the + button in in the agents screen and follow the instructions to install an agent.