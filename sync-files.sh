#!/bin/sh
#start-params
#<b>rsync file synchronization between 2 directories</b><br />
#<br /><b>Parameters</b><br />
#<b>#1</b> - From Directory<br />
#<b>#2</b> - To Directory<br />
#<b>#3</b> - replicate deletes to target (set to y to enable)<br />
#<b>#4</b> - dry-run mode (set to y to enable)
#end-params

# Check for required arguments
if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <source_directory> <target_directory> [delete_option] [dry_run_option]" >&2
  echo "  delete_option: Set as 'y' to enable deletes on target" >&2
  echo "  dry_run_option: Set as 'y' to enable dry-run (preview changes without applying)" >&2
  exit 1
fi

# Function to log messages
log_message() {
  local message="$1"
  echo "$message"
  echo "$(date "+%Y-%m-%d %H:%M:%S") - $message" >> "$logfile"
}

# Set variables
before=$(date +%s)
source_dir="$1"
target_dir="$2"
delete_option="$3"
dry_run_option="$4"
script_dir=$(cd "$(dirname "$0")" && pwd)

# Set up log file
log_dir="${script_dir}/../logs"
mkdir -p "$log_dir"
if [ ! -d "$log_dir" ]; then
  echo "Error: Could not create log directory $log_dir" >&2
  exit 1
fi
logfile="$log_dir/backup_$(basename "$source_dir").log"
echo "Logging to $logfile"

# Example rsync command (adjust options as needed)
rsync_options="-va"
if [ "$delete_option" = "y" ]; then
  rsync_options="$rsync_options --delete"
fi
if [ "$dry_run_option" = "y" ]; then
  rsync_options="$rsync_options --dry-run"
  log_message "Running in DRY-RUN mode - no changes will be applied"
fi
rsync $rsync_options "$source_dir/" "$target_dir/" | tee -a "$logfile"
retCode=$?

# Log summary
log_message "rsync finished with return code $retCode"
if [ $retCode -eq 0 ]; then
  log_message "Sync completed successfully."
else
  log_message "Sync failed with return code $retCode."
fi

# Calculate and log elapsed time
after=$(date +%s)
elapsed_seconds=$((after - before))
log_message "Completed in $elapsed_seconds seconds"

exit $retCode
