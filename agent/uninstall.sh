#!/bin/bash

SETTINGS_FILE="settings.sh"
INSTALL_DIR=""
echo "Loading Settings"
if [ -f "$SETTINGS_FILE" ]; then
    source "$SETTINGS_FILE"
else
    echo "Application has not been installed"
    exit 1
fi

SERVICE_NAME="BackupHubAgent-$AGENT_NAME"

dialog --yesno "Welcome to the BackupApp Agent Uninstaller - do you want to uninstall?" 10 30
# Check the exit status of dialog
# 0 means Yes, 1 means No, 255 means Esc/Cancel
response=$?
clear
if [ $response -eq 0 ]; then
    echo " ------------ "
    echo " Uninstalling "
    echo " ------------ "
else
    echo "Uninstallation Canceled"
    exit 0
fi


case "$STARTUP_TYPE" in
    "pm2")
        echo "  * Removing PM2 items"
        pm2 delete "$AGENT_NAME"
        pm2 save --force
        #pm2 unstartup systemd
        ;;
    "service")
        if systemctl list-units --full -all | grep -Fq "$SERVICE_NAME.service"; then
            echo "Service $SERVICE_NAME found, attempting to stop and disable it."

            # Stop the service if it's running
            if systemctl is-active --quiet "$SERVICE_NAME"; then
                echo "Stopping the service..."
                systemctl stop "$SERVICE_NAME"
            else
                echo "Service $SERVICE_NAME is already stopped."
            fi

            # Disable the service to remove it from startup
            echo "Disabling the service..."
            systemctl disable "$SERVICE_NAME"

            # Delete the service file
            SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"
            if [ -f "$SERVICE_FILE" ]; then
                echo "Deleting the service file $SERVICE_FILE..."
                rm "$SERVICE_FILE"
            else
                echo "Service file $SERVICE_FILE not found."
            fi

            # Reload systemd manager configuration
            echo "Reloading systemd manager configuration..."
            systemctl daemon-reload
            echo "Service $SERVICE_NAME has been stopped and removed successfully."
        else
            echo "Service $SERVICE_NAME not found."
        fi
        ;;
    "Crontab")
        echo "  * Removing crontab entry"
        FILE_PATH=cronfile.txt
        crontab -l > $FILE_PATH
        TMP_FILE=$(mktemp)
        SEARCH_STRING="@reboot node $INSTALL_DIR/agent.js"
        # Loop through each line in the file
        while IFS= read -r line; do
            # Check if the line starts with the provided character sequence
            if [[ "$line" == "$SEARCH_STRING"* ]]; then
                continue  # Skip this line
            fi
            # Append the line to the temporary file
            echo "$line" >> "$TMP_FILE"
        done < "$FILE_PATH"
        crontab <<EOF
`cat $TMP_FILE`
EOF
        rm -f $TMP_FILE
        rm -f cronfile.txt
        echo "  * Removed Cron entry"
        echo "  * Killing any running process"
        pkill -f "node agent.js --agent"
        if [ $? -eq 0 ]; then
            echo "  * Backup Agent Terminated."
        else
            echo "  * No running Backup Agent detected"
        fi
        ;;
    "none")
        echo "  * No auto startup was configured"
        exit 0
        ;;
    *)
        echo "Invalid choice"
        ;;
esac

echo "  * Removing files"
rm -rf $INSTALL_DIR
echo " ------------------- "
echo " Uninstall completed "
echo " ------------------- "
