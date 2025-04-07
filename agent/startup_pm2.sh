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
echo " ----------------------- "
echo " Installing PM2 to start "
echo " ----------------------- "
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
else
    echo "Skipping - PM2 is already installed."
fi


# Create PM2 setup
# Start the application using PM2
echo " ----------------------- "
echo " Starting via PM2        "
echo " ----------------------- "
cd $INSTALL_DIR

if [ "$MQTT_ENABLED" = "true" ]; then
    pm2 start "$INSTALL_DIR/agent.js" --name "$AGENT_NAME" -- --agent "$AGENT_NAME" --mqttServer "$MQTT_SERVER" --mqttPort "$MQTT_PORT" --workingDir "$WORKING_DIR"
else
    pm2 start "$INSTALL_DIR/agent.js" --name "$AGENT_NAME" -- --agent "$AGENT_NAME" --wsServer "$WS_SERVER" --wsPort "$WS_PORT" --workingDir "$WORKING_DIR"
fi    
sleep 2
# Save the PM2 process list and configuration
echo " ----------------------- "
echo " Saving PM2 to autostart "
echo " ----------------------- "
pm2 save
pm2 startup

