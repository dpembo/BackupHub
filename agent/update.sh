#!/bin/bash

kill_node_agent() {
  # Find the process ID (PID) of the process that contains "node agent"
  local pid=$(pgrep -f "node agent")

  # Check if a process was found
  if [ -n "$pid" ]; then
    echo "Killing process with PID: $pid"
    kill -9 "$pid"
    echo "Process killed."
  else
    echo "No process found matching 'node agent'."
  fi
}

# Function to stop, rename a Docker container, and change its restart policy
stop_preserve_container() {
  local container_name=$1
  local new_name="${container_name}_OLD"
  
  # Check if the container is running
#  if [ "$(docker ps -q -f name="$container_name")" ]; then
  if [ "$(docker ps -q -f "name=$container_name")" ]; then
    echo "Stopping container: $container_name"
    docker stop "$container_name"
    echo "Container stopped."
    
    # Rename the container by committing it to a new container name
    echo "Renaming container to: $new_name"
    docker rename "$container_name" "$new_name"

    # Change the restart policy to 'none'
    echo "Changing restart policy of $new_name to none"
    docker update --restart=no "$new_name"

    echo "Container renamed and restart policy updated."
  else
    echo "No running container found with name: $container_name"
  fi
}

echo "=============================="
echo "BackupHub Agent Updater"
echo "=============================="

restart=false
quiet=false
# Check if the parameter --restart is passed
for arg in "$@"; do
  if [[ $arg == "--restart" ]]; then
    restart=true
    break
  fi
done

# Check if the parameter --quiet is passed
for arg in "$@"; do
  if [[ $arg == "--quiet" ]]; then
    quiet=true
    break
  fi
done


# Source the settings.sh file if it exists in the same directory as the script
script_dir="$(dirname "$0")"
if [ -f "$script_dir/settings.sh" ]; then
  echo "* Getting settings from the existing settings.sh file"
  source "$script_dir/settings.sh"
  # Set host and port from settings.sh
  host="$BACKUPHUB_SERVER"
  port="$BACKUPHUB_PORT"
  destination="${destination:-$script_dir}"
else
  # If settings.sh is not found, fall back to command line arguments for host and port
  host="$1"
  port="$2"
  destination="${3:-$script_dir}"
fi

echo $1
echo $2

  # Check if both host and port are provided via command line
  if [ -z "$host" ] || [ -z "$port" ]; then
    echo "Please provide a host and port value for the MQTT server as a minimum"
    echo "Usage: $0 <host> <port> [destination]"
    exit 1
  fi

# Create a temporary directory
temp_dir=$(mktemp -d)

# Ensure the temporary directory was created
if [ ! -d "$temp_dir" ]; then
  echo "Failed to create temporary directory"
  exit 1
fi

# Get the current version from version.js in the script's directory
current_version=$(grep -oP '(?<=var version=)[^;]+' "$destination/version.js" | tr -d '"')

# Determine protocol and port string based on port number
if [ "$port" = "443" ] || [ "$port" = "8443" ]; then
  protocol="https"
  if [ "$port" = "443" ]; then
    port_string=""
  else
    port_string=":$port"
  fi
else
  protocol="http"
  port_string=":$port"
fi

# Download and untar the file into the temporary directory
wget -O - "$protocol://$host$port_string/agent/agent.tar" | tar -xf - -C "$temp_dir"

# Get the new version from the extracted version.js file
new_version=$(grep -oP '(?<=var version=)[^;]+' "$temp_dir/version.js" | tr -d '"')

# Check if versions are the same, and neither is %%UNDEFINED%%
if [[ "$current_version" == "$new_version" && "$new_version" != "%%UNDEFINED%%" && "$current_version" != "%%UNDEFINED%%" ]]; then
  if [ "$quiet" = false ]; then
    dialog --msgbox "BackupHub Agent Updater\n\nThe current version ($current_version) is the same as the new version ($new_version). No update necessary." 10 60
  else
    echo "BackupHub Agent Updater / The current version ($current_version) is the same as the new version ($new_version). No update necessary."
  fi
  rm -rf "$temp_dir"
  exit 0
else
  echo "BackupHub Agent Updater / Initiating upgrade - current version ($current_version) / new version ($new_version)."
fi

# Use dialog to confirm the upgrade
if [ "$quiet" = false ]; then
  dialog --yesno "BackupHub Agent Updater\n\nUpgrade from version $current_version to $new_version?" 10 60
  response=$?
  clear
  # Check the user's response
  if [ $response -ne 0 ]; then
    echo "Upgrade canceled."
    rm -rf "$temp_dir"
    exit 0
  fi
fi

# If upgrade is confirmed, copy all .js files to the destination directory
cp "$temp_dir"/*.js "$destination"
cp "$temp_dir"/*.sh "$destination"
cd "$destination"
npm install --loglevel=error

#Cleanup Remove the temporary directory
rm -rf "$temp_dir"

echo "Update completed in directory: $destination"
echo "Agent now at version: $new_version"


if [ "$restart" = true ]; then
  echo "Restarting Agent"
  if [ "$quiet" = true ]; then
    echo "Restarting Agent in quiet mode."
    nohup bash "$script_dir/restart_agent.sh" "$STARTUP_TYPE" "$AGENT_NAME" "$INSTALL_DIR" "$MQTT_SERVER" "$MQTT_PORT" "$WORKING_DIR"  >> /var/log/backupApp2.log 2>&1 &

    echo "Restart initiated asynchronously in quiet mode."
    exit 0
  else
    bash "$script_dir/restart_agent.sh" "$STARTUP_TYPE" "$AGENT_NAME" "$INSTALL_DIR" "$MQTT_SERVER" "$MQTT_PORT" "$WORKING_DIR"
  fi
else
  case "$STARTUP_TYPE" in
    pm2)
      echo "To restart the service, use: pm2 restart $AGENT_NAME"
      ;;
    Crontab)
      echo "To restart the service, you may need to stop the running agent and reload the crontab using: crontab -e"
      ;;
    Service)
      echo "To restart the service, use: systemctl restart BackupHubAgent"
      ;;
    Docker)
      echo "To restart the Docker container, stop the currently running container, then  use: ./startup_container.sh to build and start a new version."
      ;;
    none)
      echo "No Startup method was configured during install. You need to manually restart the agent."
      ;;
    *)
      echo "Unknown STARTUP_TYPE. Please restart the service manually."
      ;;
  esac
fi

# Instructions for restarting the service based on STARTUP_TYPE
exit 0