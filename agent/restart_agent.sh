#!/bin/bash
show_help() {
  echo "Usage: $0 <STARTUP_TYPE> <AGENT_NAME> <INSTALL_DIR> <MQTT_SERVER> <MQTT_PORT> <WORKING_DIR>"
  echo
  echo "Parameters:"
  echo "  STARTUP_TYPE    The type of startup (pm2, Crontab, Service, Docker, none)"
  echo "  AGENT_NAME      Name of the agent to restart"
  echo "  INSTALL_DIR     Directory where the agent is installed"
  echo "  MQTT_SERVER     MQTT server address"
  echo "  MQTT_PORT       MQTT server port"
  echo "  WORKING_DIR     The working directory for the agent"
  echo
  echo "Example:"
  echo "  $0 pm2 backupAgent /opt/BackupHubAgent 127.0.0.1 1883 /tmp"
}

# Check if --help is passed
if [[ "$1" == "--help" || $# -lt 6 ]]; then
  show_help
  exit 1
fi

sleep 10

STARTUP_TYPE=$1
AGENT_NAME=$2
INSTALL_DIR=$3
MQTT_SERVER=$4
MQTT_PORT=$5
WORKING_DIR=$6

case "$STARTUP_TYPE" in
  pm2)
    echo "Restarting Agent using pm2"
    pm2 restart "$AGENT_NAME"
    ;;
  Crontab)
    echo "Killing Process"
    pkill -f "node agent"
    echo "Starting updated instance"
    cd "$INSTALL_DIR/agent" || exit
    nohup node agent.js --agent "$AGENT_NAME" --mqttServer "$MQTT_SERVER" --mqttPort "$MQTT_PORT" --workingDir "$WORKING_DIR" >> /var/log/backupApp2.log 2>&1 &
    echo "Done"
    ;;
  Service)
    echo "Restarting Service"
    systemctl restart BackupHubAgent-"$AGENT_NAME"
    echo "Done"
    ;;
  Docker)
    echo "Stopping container and preserving"
    stop_preserve_container "backup-agent"
    bash "$INSTALL_DIR/startup_container.sh"
    echo "Done"
    ;;
  none)
    echo "No Startup method was configured during install. You need to manually restart the agent."
    ;;
  *)
    echo "Unknown STARTUP_TYPE. Please restart the Agent Manually."
    ;;
esac
