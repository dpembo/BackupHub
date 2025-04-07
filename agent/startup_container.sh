#!/bin/bash

# Check if running with sudo privileges
if [ "$EUID" -ne 0 ]; then
    echo "Please run the script with sudo or as root."
    exit 1
fi

SETTINGS_FILE="settings.sh"
# See if the parameters need setting
echo "AGENT_NAME is set to" $AGENT_NAME
if [ -z "$AGENT_NAME" ]; then
  echo "Loading Settings"
  if [ -f "$SETTINGS_FILE" ]; then
    source "$SETTINGS_FILE"
  else
    echo "No Settings file - please run install_main.sh"
    exit 1
  fi
fi

# Building Container
echo " ------------------------------------ "
echo " Checking for Dependencies "
echo " ------------------------------------ "

echo "  * Checking for Docker"
# Check if Docker is installed
if command -v docker &> /dev/null
then
    echo "  * Docker is installed."
else
    echo "  * Docker is not installed. Exiting, Please install Docker."
    exit 1
fi

# Check if Docker Compose is installed
if command -v docker compose &> /dev/null
then
    echo "  * Docker Compose is installed."
else
    echo "  * Docker Compose is not installed. Exiting. Please install Docker Compose."
    exit 1
fi

# Check if settings.sh exists and source it if it does
if [ -f settings.sh ]; then
    source settings.sh
fi

# If DOCKER_MOUNTS is not set, prompt the user to input mounts
if [ -z "$DOCKER_MOUNTS" ]; then
    echo " ------------------------------------- "
    echo " Collect Volume Mappings "
    echo " ------------------------------------- "

    dialog --msgbox "As you selected to use Docker, you now need to provide directories to mount into the container. These will be mapped to the same location inside the container, so please choose carefully" 14 50

    # Initialize an empty list
    items=()
    choices=()

    while true; do
        # Create checklist options from current items
        checklist_items=()
        for item in "${items[@]}"; do
            checklist_items+=("$item" "" "on")
        done

        # Display the current checklist if there are items
        if [ ${#items[@]} -gt 0 ]; then
            dialog --checklist "Current Mount Path (uncheck to remove):" 20 50 10 "${checklist_items[@]}" 2>tmpfile
            checked=$(<tmpfile)
            rm -f tmpfile
            # Update choices based on the checklist
            choices=($checked)
        fi

        # Show input dialog to add a new item
        input=$(dialog --inputbox "Enter a Path to mount (or leave empty to finish):" 10 30 3>&1 1>&2 2>&3)

        # Check if the input was canceled or empty
        if [ $? -ne 0 ] || [ -z "$input" ]; then
            break
        fi

        # Add the input to the list
        items+=("$input")
    done

    # Convert the final list of choices to a string with newlines
    final_list=$(printf "%s " "${choices[@]}")

    # Show the final list
    dialog --msgbox "Selected Container Mounts:\n$final_list" 15 50

    # Clear the screen after the dialog closes
    clear

    # Save the list to settings.sh
    echo "DOCKER_MOUNTS=\"$final_list\"" >> settings.sh
else
    echo "Using existing DOCKER_MOUNTS from settings.sh"
    final_list=$DOCKER_MOUNTS
fi

# Only generate the volume mounts if DOCKER_MOUNTS was just created
if [ -z "$DOCKER_MOUNTS" ]; then
    # Function to generate volume mounts for Docker Compose
    generate_volume_mounts() {
      local volume_list=$1
      local mounts=""

      for volume in $volume_list; do
        mounts="$mounts      - $volume:$volume\n"
      done

      printf "$mounts"
    }

    # Generate volume mounts string
    volume_mounts=$(generate_volume_mounts "$final_list")

    # Create the docker-compose.yml content
    compose_content="$compose_template
    volumes:
$volume_mounts"

    # Output the generated docker-compose.yml content
    echo "$compose_content" >> docker-compose.yml
fi

echo " ------------------------------------ "
echo " Setting up Container "
echo " ------------------------------------ "

# Now buliding container
echo "  * Building backup-agent container"
echo "  * Changing to $INSTALL_DIR"
cd $INSTALL_DIR
pwd

docker build -t backup-agent .

echo " ----------------------- "
echo " Starting        "
echo " ----------------------- "
#cd $INSTALL_DIR/agent
#node agent.js --agent "$AGENT_NAME" --mqttServer "$MQTT_SERVER" --mqttPort "$MQTT_PORT" --workingDir "$WORKING_DIR" >> /var/log/backupApp2.log 2>&1 &


# Export the variables


echo " ----------------------- "
echo " Setting Env variables   "
echo " ----------------------- "
export AGENT="$AGENT_NAME"
export MQTT_SERVER="$MQTT_SERVER"
export MQTT_PORT="$MQTT_PORT"
export WORKING_DIR="$WORKING_DIR"

# Run Docker Compose
docker compose up -d

#docker run -d -p 49991:49991 --name backup-agent --restart always backup-agent --agent "$AGENT_NAME" --mqttServer "$MQTT_SERVER" --mqttPort "$MQTT_PORT" --workingDir "$WORKING_DIR"