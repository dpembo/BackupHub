#!/bin/bash
INSTALL_DIR="/opt/BackupHubAgent"

# Check if running with sudo privileges
if [ "$EUID" -ne 0 ]; then
    echo "Please run the script with sudo or as root."
    exit 1
fi

SETTINGS_FILE="settings.sh"
# See if the parameters need setting
if [ -z "$AGENT_NAME" ]; then
  echo "Loading Settings"
  if [ -f "$SETTINGS_FILE" ]; then
    source "$SETTINGS_FILE"
  else
    echo "No Settings file - please run install_main.sh"
    exit 1
  fi
fi

# Install PM2 if needed
echo " ------------------------------------ "
echo " Setting up Cron "
echo " ------------------------------------ "

echo "  * Checking for existence of cron entry"
CRONTAB_ENTRY_START="@reboot node $INSTALL_DIR/agent/agent.js"

if [ "$MQTT_ENABLED" = "true" ]; then
    CRONTAB_ENTRY="$CRONTAB_ENTRY_START --agent \"$AGENT_NAME\" --mqttServer \"$MQTT_SERVER\" --mqttPort \"$MQTT_PORT\" --workingDir \"$WORKING_DIR\" >> /var/log/BackupHubAgent.log 2>&1"
else
    CRONTAB_ENTRY="$CRONTAB_ENTRY_START --agent \"$AGENT_NAME\" --wsServer \"$WS_SERVER\" --wsPort \"$WS_PORT\" --workingDir \"$WORKING_DIR\" >> /var/log/BackupHubAgent.log 2>&1"
fi 

if crontab -l | grep -q "^$CRONTAB_ENTRY_START"; then
    echo "  * Crontab entry exists."
else
    echo "  * Crontab entry does not exist, adding"
    crontab -l > mycron.txt
    echo "$CRONTAB_ENTRY" >> mycron.txt 
    #cron mycron.txt
    #rm -f mycron.txt
    crontab <<EOF
`cat mycron.txt`
EOF
    echo "  * Crontab entry Added"
fi

echo " ----------------------- "
echo " Starting        "
echo " ----------------------- "
cd $INSTALL_DIR/agent
node agent.js --agent "$AGENT_NAME" --mqttServer "$MQTT_SERVER" --mqttPort "$MQTT_PORT" --workingDir "$WORKING_DIR" >> /var/log/backupApp2.log 2>&1 &

