#!/bin/bash
#
# Author: Dave Pemberton
# init script to start backup hub agent
#

INSTALL_DIR="/opt/BackupHubAgent"
SCRIPT_PATH="$INSTALL_DIR/startup_svc.sh"
SETTINGS_FILE="settings.sh"
SETTINGS_FILE_LOCATION="$INSTALL_DIR/$SETTINGS_FILE"

if [ -f "$SETTINGS_FILE_LOCATION" ]; then
    echo "Loading Settings file: $SETTINGS_FILE_LOCATION"
    source "$SETTINGS_FILE_LOCATION"
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
fi


SERVICE_NAME="BackupHubAgent-$AGENT_NAME"    
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"

# Check if the script exists
if [ ! -f "$SCRIPT_PATH" ]; then
    echo "Error: Script at $SCRIPT_PATH not found."
    exit 1
fi

# Create the systemd service file
echo "Creating systemd service file at $SERVICE_FILE"
cat <<EOF > $SERVICE_FILE
[Unit]
Description=BackupHub Agent Service for Agent $AGENT_NAME
After=network.target

[Service]
ExecStart=$SCRIPT_PATH $PARAMS
Restart=on-failure
User=$(whoami)

[Install]
WantedBy=multi-user.target
EOF

# Set the right permissions for the service file
chmod 644 $SERVICE_FILE

# Reload systemd to recognize the new service
echo "Reloading systemd manager configuration"
systemctl daemon-reload

# Enable the service so it starts at boot
echo "Enabling the service"
systemctl enable $SERVICE_NAME

# Start the service immediately
echo "Starting the service"
systemctl start $SERVICE_NAME

# Verify the service status
echo "Checking service status"
systemctl status $SERVICE_NAME

# Exit successfully
echo "Service $SERVICE_NAME created, enabled, and started successfully!"
exit 0

