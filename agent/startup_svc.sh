#!/bin/bash
#
# Author: Dave Pemberton
# init script to start backup hub agent
#

INSTALL_DIR="/opt/BackupHubAgent"
SETTINGS_FILE="settings.sh"
SETTINGS_FILE_LOCATION="$INSTALL_DIR/$SETTINGS_FILE"
PARAMS=""

if [ -f "$SETTINGS_FILE_LOCATION" ]; then
    echo "Loading Settings file: $SETTINGS_FILE_LOCATION"
    source "$SETTINGS_FILE_LOCATION"
    echo "Starting agent assuming settings file is in place"

else
    #echo "No Settings file - Assuming defaults"
    AGENT_NAME="Agent"
    MQTT_ENABLED="false"
    MQTT_SERVER=""
    MQTT_PORT=""
    BACKUPHUB_SERVER="localhost"
    BACKUPHUB_PORT="8082"
    WS_ENABLED="true"
    WS_SERVER="localhost"
    WS_PORT="49981"
    WORKING_DIR="/tmp"
    PARAMS="--agent \"$AGENT_NAME\" --wsServer \"$WS_SERVER\" --wsPort \"$WS_PORT\" --workingDir \"$WORKING_DIR\""
    NODE_COMMAND="node"
fi

eval "$NODE_COMMAND $INSTALL_DIR/agent.js $PARAMS":