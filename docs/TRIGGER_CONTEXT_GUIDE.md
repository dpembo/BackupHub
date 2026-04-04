# Trigger Context System - Developer Guide

## Overview

The Trigger Context system enables scripts and orchestrations to receive structured metric data when executed through:
1. **Rule-based triggers** - When threshold rules fire
2. **Webhook triggers** - When external systems call the webhook API
3. **Sample/test execution** - When testing orchestrations with sample data

## How It Works

### The Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. METRIC EVALUATION                                            │
│    Scheduler monitors metrics (CPU, disk, file count, etc.)    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. RULE TRIGGERED                                               │
│    Rule condition met (e.g., "disk usage >= 90%")              │
│    System creates: ruleTriggerContext                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. JOB EXECUTION INITIATED                                      │
│    scheduler.runJob(jobName, isManual, null, ruleTriggerContext)│
└─────────────────────────────────────────────────────────────────┘
                              ↓
         ┌────────────────────┴────────────────────┐
         ↓                                         ↓
    FOR SCRIPTS                            FOR ORCHESTRATIONS
    (agent execution)                       (orchestration builder)
         ↓                                         ↓
┌———————————────────────────┐           ┌———————————────────────┐
│ contextToEnvVars()        │           │ Template Substitution │
│ Flattens context to:      │           │ Replaces:             │
│                           │           │ "#{context.X}"        │
│ BACKUPHUB_METRIC_VALUE    │           │ with actual values    │
│ BACKUPHUB_METRIC_TYPE     │           │                       │
│ BACKUPHUB_METRIC_PATH     │           │ Example:              │
│ BACKUPHUB_CONDITION_*     │           │ "--path #{context... │
│ etc.                      │           │ cleanup.sh"           │
└───────────┬───────────────┘           └──────────┬────────────┘
            ↓                                      ↓
      Agent receives                    Orchestration engine
      and injects into                  substitutes and
      script environment                passes to scripts
            ↓                                      ↓
      Script can read:                   Scripts/orchestration
      $BACKUPHUB_*                       receives metric data
```

## For Script Writers

### Accessing Metric Data

When your script is triggered by a threshold rule, these environment variables are available:

```bash
# Core Information
$BACKUPHUB_TRIGGER_TYPE        # "rule", "webhook", or "sample"
$BACKUPHUB_EXECUTION_ID        # Unique ID for this execution

# Metric Data
$BACKUPHUB_METRIC_TYPE         # "cpu", "mount_usage", "file_count", etc.
$BACKUPHUB_METRIC_VALUE        # The actual value (e.g., 92.5)
$BACKUPHUB_METRIC_UNIT         # Unit: "%", "bytes", "seconds", "count"
$BACKUPHUB_METRIC_PATH         # Path being monitored (e.g., "/mnt/data")
$BACKUPHUB_METRIC_AGENT        # Agent that detected it

# Condition Information
$BACKUPHUB_CONDITION_OPERATOR  # ">=", "<=", ">", "<", "==", "!="
$BACKUPHUB_CONDITION_THRESHOLD # The threshold value
$BACKUPHUB_CONDITION_MET       # "true" or "false"

# Full Context as JSON
$BACKUPHUB_TRIGGER_CONTEXT     # {"type":"rule","metric":{...},...}
```

### Example: Disk Cleanup Script

```bash
#!/bin/bash

# If triggered by high disk usage rule, respond intelligently
if [ "$BACKUPHUB_METRIC_TYPE" = "mount_usage" ] && [ "$BACKUPHUB_CONDITION_MET" = "true" ]; then
    echo "Disk usage alert: ${BACKUPHUB_METRIC_VALUE}% on ${BACKUPHUB_METRIC_PATH}"
    
    # Only clean up if we hit the threshold we care about
    if (( $(echo "$BACKUPHUB_METRIC_VALUE > 85" | bc -l) )); then
        
        # Remove old backups (older than 30 days)
        find "${BACKUPHUB_METRIC_PATH}/backups" -type f -mtime +30 -delete
        
        # Compress old logs
        find "${BACKUPHUB_METRIC_PATH}/logs" -type f -mtime +7 -exec gzip {} \;
        
        echo "Cleanup completed. New usage: $(df -h ${BACKUPHUB_METRIC_PATH} | tail -1)"
    fi
fi
```

### Example: CPU-Triggered Maintenance

```bash
#!/bin/bash

# When CPU is high, reduce I/O load
if [ "$BACKUPHUB_METRIC_TYPE" = "cpu" ]; then
    cpu_usage="${BACKUPHUB_METRIC_VALUE%.*}"  # Remove decimal
    
    if [ "$cpu_usage" -gt 80 ]; then
        echo "High CPU detected: $cpu_usage%"
        
        # Pause resource-intensive operations
        # kill $(pgrep -f "heavy_process")
        
        # Reduce concurrent backups
        # systemctl set-property backup.service CPUQuota=50%
        
        echo "Resource management activated"
    fi
fi
```

## For Orchestration Builders

### Template Substitution in Parameters

In the Orchestration Builder, you can reference metric values directly in script parameters using template syntax:

```
# In execute node parameters:
--path #{context.metric.path} --threshold #{context.condition.threshold} --value #{context.metric.value}
```

### Available Template References

```javascript
#{context.metric.type}              // "cpu", "mount_usage", etc.
#{context.metric.value}             // The actual value (92.5)
#{context.metric.unit}              // "%", "bytes", etc.
#{context.metric.path}              // "/mnt/data"
#{context.metric.agent}             // "agent1"

#{context.condition.operator}       // ">=", "<=", etc.
#{context.condition.threshold}      // Threshold value
#{context.condition.met}            // true/false

#{context.type}                     // "rule", "webhook", "sample"
#{context.executionId}              // Unique execution ID
#{context.timestamp}                // ISO8601 timestamp
```

### Example: Tier-Based Response Orchestration

```json
{
  "type": "condition",
  "data": {
    "condition": "#{context.metric.value} > 95",
    "trueBranch": "critical_response",
    "falseBranch": "normal_response"
  }
}
```

Then in your execute nodes:

```
Critical Path Node:
  Script: emergency_cleanup.sh
  Parameters: --aggressive --mount #{context.metric.path}

Normal Path Node:
  Script: standard_cleanup.sh
  Parameters: --mount #{context.metric.path}
```

## Webhook API

### Trigger a Job via Webhook

```bash
curl -X POST "http://your-server:8082/api/webhook/trigger/my-job?key=UUID-HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "alert",
    "message": "Custom metric from external system",
    "value": 85,
    "unit": "%"
  }'
```

### Key Security

- Webhook keys are UUID v4 format
- Keys can be:
  - Passed as query parameter: `?key=...`
  - Passed as header: `X-Webhook-Key: ...`
- Keys can be rotated without losing access
- Consider hashing keys in storage

### Webhook Response

```json
{
  "success": true,
  "jobName": "my-job",
  "executionId": "a1b2c3d4e5f6g7h8",
  "message": "Job triggered via webhook"
}
```

The webhook payload is passed as `#{context.payload.*}` in orchestrations.

## Testing

### Sample Templates

BackupHub includes 5 pre-built sample templates for testing:

1. **cpu_spike** - CPU at 95% (up from 45%)
2. **storage_full** - Mount at 98% usage
3. **files_old** - 90-day old files detected
4. **file_count_high** - 5000 files (up from 2800)
5. **webhook_example** - External webhook payload

### Manual Testing Script

```bash
#!/bin/bash
# Test that your script handles trigger context properly

# Set test environment variables
export BACKUPHUB_TRIGGER_TYPE="rule"
export BACKUPHUB_METRIC_TYPE="mount_usage"
export BACKUPHUB_METRIC_VALUE="92.5"
export BACKUPHUB_METRIC_UNIT="%"
export BACKUPHUB_METRIC_PATH="/mnt/data"
export BACKUPHUB_CONDITION_OPERATOR=">="
export BACKUPHUB_CONDITION_THRESHOLD="90"
export BACKUPHUB_CONDITION_MET="true"
export BACKUPHUB_EXECUTION_ID="test-exec-123"

# Run your script
./scripts/your_script.sh

# On success, you should see:
# - Script recognizing the metric type
# - Appropriate actions being taken
# - No errors regarding environment variables
```

## Metric Types

### cpu
- **Value**: Percentage (0-100)
- **Unit**: %
- **Example**: Triggered when load average exceeds threshold
- **Template**: `#{context.metric.value}` = 95

### mount_usage
- **Value**: Percentage (0-100)
- **Unit**: %
- **Path**: Filesystem mount point
- **Example**: `/mnt/data` at 92%
- **Template**: `#{context.metric.path}`, `#{context.metric.value}`

### dir_size
- **Value**: Bytes
- **Unit**: bytes
- **Path**: Directory path
- **Example**: `/home/user/backups` = 5368709120 bytes
- **Template**: `#{context.metric.value}` (convert to GB: value/1073741824)

### file_size
- **Value**: Bytes
- **Unit**: bytes
- **Path**: File path
- **Example**: `/var/log/large.log` = 2147483648 bytes

### file_count
- **Value**: Count
- **Unit**: count
- **Path**: Directory
- **Pattern**: Optional glob pattern
- **Example**: 10 `.log` files in `/var/log`
- **Template**: `#{context.metric.value}` = 10

### file_age
- **Value**: Seconds since modification
- **Unit**: seconds
- **Path**: File path
- **Example**: 2592000 seconds (30 days)
- **Template**: To show in days: `echo "scale=2; #{context.metric.value}/86400" | bc`

## Best Practices

1. **Always check trigger type**: Scripts may run manually or triggered
   ```bash
   if [ "$BACKUPHUB_TRIGGER_TYPE" = "rule" ]; then
       # Use trigger context
   fi
   ```

2. **Validate values**: Check that environment variables exist
   ```bash
   if [ -z "$BACKUPHUB_METRIC_VALUE" ]; then
       echo "No trigger context available"
       exit 1
   fi
   ```

3. **Use appropriate units**: Convert metric values if needed
   - CPU: Already in %, use directly
   - Disk: In bytes, convert for display
   - File age: In seconds, convert for readability

4. **Log execution context**: Include execution ID in logs
   ```bash
   echo "[${BACKUPHUB_EXECUTION_ID}] Processing metric: $BACKUPHUB_METRIC_VALUE"
   ```

5. **Handle edge cases**: Account for metric not being available
   ```bash
   METRIC_VALUE="${BACKUPHUB_METRIC_VALUE:-0}"
   if [ -z "$METRIC_VALUE" ]; then
       METRIC_VALUE=0
   fi
   ```

## Troubleshooting

### Script not receiving environment variables
- Check that the job is triggered by a rule (not run manually)
- Verify the rule actually fired (check logs)
- Confirm the agent is online when job was triggered

### Template substitution not working
- Check syntax: `#{context.X}` not `#{contextX}`
- Verify the field exists in context (use full JSON context for reference)
- Ensure orchestration is triggered with context, not run manually

### Webhook not triggering
- Verify API key format (should be UUID v4)
- Check that key is passed as query param or header
- Ensure job name matches registered webhook
- Check server logs for webhook errors

---

## Related Files

- Core implementation: `triggerContext.js`, `webhookManager.js`
- Integration: `scheduler.js`, `agentCommunication.js`, `orchestrationEngine.js`
- Agent-side: `agent/agent.js`
- Example: `scripts/example_trigger_context_usage.sh`
- API: `server.js` (POST /api/webhook/trigger/:jobName)
