# Webhook System - Complete User Guide

## Overview

Orchelium includes a complete webhook system that allows external services to trigger jobs with custom data. No more manual job execution - let your monitoring systems, CI/CD pipelines, and applications trigger jobs automatically!

---

## Quick Start

### Create Your First Webhook (5 minutes)

1. **Log in to Orchelium** and navigate to **Settings**
2. Click the **Webhooks** tab
3. Click **Create Webhook**
4. Enter a name (e.g., "Monitoring Alert") and optional description
5. Click **Save**
6. **Copy the API Key immediately** - you won't see it again!
7. Your webhook is ready to use

### Test Your Webhook

Use the trigger URL to test:

```bash
curl -X POST "https://your-orchelium/webhooks/trigger?jobName=my-job&key=YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"alert": "High CPU detected"}'
```

If successful, your job will start immediately!

---

## Understanding Webhooks

### What is a Webhook?

A webhook is a way for external systems to communicate with Orchelium. Instead of Orchelium polling external services, external services send Orchelium a message when something happens.

**Example scenarios:**
- ✅ Monitoring system detects high disk usage → Triggers cleanup job
- ✅ CI/CD pipeline completes → Triggers backup of artifacts
- ✅ Database gets corrupted → Application triggers recovery job
- ✅ Scheduled maintenance window → External system triggers job

### How Webhooks Work

```
External System          Orchelium Server            Job
     │                         │                          │
     │  1. Something happens   │                          │
     │───────────────────────> │                          │
     │                         │ 2. Check API key         │
     │                         │ 3. Start job             │
     │                         │────────────────────────> │
     │                         │                          │ 4. Job runs
     │                         │                          │ 5. Complete
     │ 6. Success response     │ <────────────────────────│
     │ <───────────────────────│                          │
```

---

## Managing Webhooks

### Create Webhook

**Via Web UI (Recommended):**
1. Settings → Webhooks → Create Webhook
2. Enter name and description
3. Copy API key when displayed

**Via API (Advanced):**
```bash
curl -X POST "https://your-orchelium/rest/webhooks/my-job" \
  -H "Content-Type: application/json" \
  -H "Cookie: session=your-session-cookie" \
  -d '{"name": "My Webhook", "description": "Triggers on alert"}'
```

### Edit Webhook

1. Click the **edit icon** next to webhook name
2. Update name or description
3. Click **Save**

*Note: Webhook ID and trigger URL never change*

### Rotate API Key

If you think your API key was compromised:
1. Click the **key icon** next to webhook
2. Click **Rotate Key**
3. **Copy the new key immediately**
4. Old key becomes invalid instantly
5. Update external systems with new key

### Disable Webhook Temporarily

1. Click **edit icon**
2. Uncheck the "Active" checkbox
3. Webhook won't trigger, but isn't deleted
4. Re-enable by checking the checkbox again

### Delete Webhook

1. Click the **delete icon**
2. Confirm deletion
3. Webhook is removed permanently

---

## Using Webhooks

### Trigger URL Format

```
https://your-orchelium/webhooks/trigger?jobName=JOBNAME&key=APIKEY
```

**Parameters:**
- `jobName` - Name of the job to trigger (required)
- `key` - Your webhook API key (required)
- Custom data - Send via JSON POST body (optional)

### Methods to Trigger

#### 1. Simple GET Request
```bash
curl -X GET "https://your-orchelium/webhooks/trigger?jobName=backup&key=a1b2c3d4"
```

#### 2. POST with Custom Data
```bash
curl -X POST "https://your-orchelium/webhooks/trigger?jobName=cleanup&key=a1b2c3d4" \
  -H "Content-Type: application/json" \
  -d '{"severity": "high", "reason": "Disk full"}'
```

#### 3. Header-based API Key (More Secure)
```bash
curl -X POST "https://your-orchelium/webhooks/trigger?jobName=backup" \
  -H "X-Webhook-Key: a1b2c3d4" \
  -H "Content-Type: application/json" \
  -d '{"files": 100}'
```

### Integration Examples

#### GitHub Actions
```yaml
- name: Trigger Orchelium Job
  run: |
    curl -X POST "${{ secrets.ORCHELIUM_WEBHOOK_URL }}" \
      -H "X-Webhook-Key: ${{ secrets.ORCHELIUM_API_KEY }}" \
      -H "Content-Type: application/json" \
      -d '{
        "event": "deployment",
        "environment": "production",
        "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
      }'
```

#### Monitoring System (Prometheus Alertmanager)
```json
{
  "webhook_configs": [
    {
      "url": "https://your-orchelium/webhooks/trigger?jobName=alert_cleanup&key=YOUR_KEY"
    }
  ]
}
```

#### Application Code (Python)
```python
import requests

def trigger_backup(reason):
    url = "https://your-orchelium/webhooks/trigger"
    params = {
        "jobName": "database_backup",
        "key": "YOUR_API_KEY"
    }
    data = {"reason": reason, "timestamp": datetime.now().isoformat()}
    
    response = requests.post(url, params=params, json=data)
    return response.status_code == 200
```

#### Application Code (Node.js)
```javascript
async function triggerBackup(reason) {
  const response = await fetch('https://your-orchelium/webhooks/trigger', {
    method: 'POST',
    headers: {
      'X-Webhook-Key': process.env.ORCHELIUM_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      jobName: 'database_backup',
      reason: reason,
      timestamp: new Date().toISOString()
    })
  });
  return response.ok;
}
```

---

## Webhook Data in Jobs

When a webhook triggers a job, the data you send becomes available to your scripts and orchestrations.

### For Shell Scripts

Access webhook data via environment variables:

```bash
#!/bin/bash

# The full webhook JSON payload
echo "Payload: $ORCHELIUM_TRIGGER_CONTEXT"

# Parse specific fields
REASON=$(echo "$ORCHELIUM_TRIGGER_CONTEXT" | jq -r '.payload.reason')
ENVIRONMENT=$(echo "$ORCHELIUM_TRIGGER_CONTEXT" | jq -r '.payload.environment')

echo "Trigger reason: $REASON"
echo "Environment: $ENVIRONMENT"

# Make decisions based on webhook data
if [ "$ENVIRONMENT" = "production" ]; then
    echo "Production backup triggered - high priority!"
fi
```

### For Orchestrations

Use template syntax to reference webhook data in orchestration parameters:

```json
{
  "parameters": "--backup-reason #{context.payload.reason} --environment #{context.payload.environment}",
  "notification": "Backup triggered by #{context.payload.event}"
}
```

### Available Variables

```bash
ORCHELIUM_TRIGGER_TYPE          # "webhook" for webhooks
ORCHELIUM_TRIGGER_CONTEXT      # Full JSON payload and metadata
ORCHELIUM_EXECUTION_ID         # Unique ID for this execution
ORCHELIUM_WEBHOOK_ID           # ID of the webhook that triggered
ORCHELIUM_WEBHOOK_NAME         # Name you gave the webhook
```

---

## Template Reference for Orchestrations

When building orchestrations, you can use template syntax to dynamically inject trigger data into execute node parameters. The `#{context.X}` syntax is replaced with actual values before the job runs.

### Webhook Trigger Context

When a webhook triggers an orchestration, the entire payload is available:

| Template | Value | Example |
|----------|-------|---------|
| `#{context.type}` | Always `"webhook"` | `webhook` |
| `#{context.executionId}` | Unique execution ID | `exec-a1b2c3d4` |
| `#{context.timestamp}` | ISO timestamp when triggered | `2026-04-04T14:30:00Z` |
| `#{context.webhook.payload}` | **Full payload as JSON** | `{"severity":"high","reason":"Disk full"}` |
| `#{context.webhook.payload.FIELD}` | Any field in your webhook payload | See examples below |

**Webhook Payload Example:**
Your webhook sends:
```json
{
  "severity": "high",
  "reason": "Disk full",
  "host": "server1",
  "cleanup_percent": 80
}
```

**Orchestration Parameters Using Webhook Data:**
```
--severity #{context.webhook.payload.severity} \
--reason "#{context.webhook.payload.reason}" \
--target #{context.webhook.payload.host} \
--cleanup-percent #{context.webhook.payload.cleanup_percent}
```

**Becomes:**
```
--severity high \
--reason "Disk full" \
--target server1 \
--cleanup-percent 80
```

### Rule-Based Trigger Context

When a rule triggers an orchestration (e.g., CPU usage exceeds threshold), metric data is available:

| Template | Value | Example |
|----------|-------|---------|
| `#{context.type}` | Always `"rule"` | `rule` |
| `#{context.executionId}` | Unique execution ID | `exec-a1b2c3d4` |
| `#{context.timestamp}` | ISO timestamp when triggered | `2026-04-04T14:30:00Z` |
| `#{context.metric.type}` | Metric type | `cpu_usage`, `mount_usage`, `file_count` |
| `#{context.metric.value}` | Current metric value | `95` |
| `#{context.metric.unit}` | Metric unit | `%`, `bytes`, `count` |
| `#{context.metric.path}` | Mount point or file path | `/mnt/data` |
| `#{context.metric.agent}` | Agent name that reported metric | `backup-agent-1` |
| `#{context.metric.previousValue}` | Previous metric value | `88` |
| `#{context.metric.changePercent}` | Percent change since last check | `7.9` |
| `#{context.condition.operator}` | Comparison operator | `>`, `>=`, `<`, `<=`, `==`, `!=` |
| `#{context.condition.threshold}` | Threshold that triggered rule | `90` |

**Rule Trigger Example:**
Rule fires when CPU usage on `backup-agent-1` exceeds 90%

**Orchestration Parameters Using Metric Data:**
```
--agent #{context.metric.agent} \
--metric-type #{context.metric.type} \
--current-value #{context.metric.value} \
--threshold #{context.condition.threshold} \
--change-percent #{context.metric.changePercent}
```

**Becomes:**
```
--agent backup-agent-1 \
--metric-type cpu_usage \
--current-value 95 \
--threshold 90 \
--change-percent 7.9
```

### Real-World Orchestration Examples

**Example 1: Webhook-Triggered Cleanup**
```
# Parameter template
--mount #{context.webhook.payload.mount} \
--aggressive #{context.webhook.payload.cleanup_level} \
--notify-email #{context.webhook.payload.notify_email}

# When webhook sends: {"mount":"/mnt/data","cleanup_level":"aggressive","notify_email":"ops@example.com"}
# Becomes:
--mount /mnt/data \
--aggressive aggressive \
--notify-email ops@example.com
```

**Example 2: Rule-Based Disk Cleanup**
```
# Parameter template
--path #{context.metric.path} \
--used-percent #{context.metric.value} \
--threshold #{context.condition.threshold} \
--previous-percent #{context.metric.previousValue}

# When CPU rule triggers at 95% (threshold: 90%, previous: 88%)
# Becomes:
--path /mnt/data \
--used-percent 95 \
--threshold 90 \
--previous-percent 88
```

**Example 3: Conditional Notification**

In a notification node, you can include context:
```
Backup triggered by webhook: #{context.webhook.payload.event}
Severity level: #{context.webhook.payload.severity}
Execution ID: #{context.executionId}

Or for rules:
Rule: #{context.metric.type}
Current value: #{context.metric.value}#{context.metric.unit}
Threshold: #{context.condition.threshold}#{context.metric.unit}
```

### Tips for Using Templates

1. **Access nested payload fields with dot notation:**
   ```
   #{context.webhook.payload.nested.field.value}
   ```

2. **Objects stringify to JSON automatically:**
   ```
   #{context.webhook.payload}  →  {"key":"value","nested":{"data":"test"}}
   ```

3. **Primitives convert to strings automatically:**
   ```
   #{context.metric.value}  →  95  (becomes string "95" in parameters)
   ```

4. **Use quotes for safety in shell commands:**
   ```
   "#{context.webhook.payload.reason}"  # Safe for strings with spaces
   #{context.metric.value}               # Safe for numbers
   ```

5. **Missing fields remain as placeholder:**
   ```
   #{context.webhook.payload.nonexistent}  →  #{context.webhook.payload.nonexistent}
   ```

---

## Security Best Practices

### Protect Your API Keys

1. **Treat API keys like passwords** - Don't commit them to Git
2. **Use environment variables** - Store keys in secure secret managers
3. **Rotate keys regularly** - Generate new keys for different environments
4. **Monitor webhook activity** - Check trigger counts for suspicious activity

### Security Features

- ✅ **UUID v4 keys** - Cryptographically random, impossible to guess
- ✅ **One-time display** - You see key only once, must save it securely
- ✅ **Key rotation** - Generate new key anytime, old one is immediately invalid
- ✅ **Validation on every trigger** - Key checked against database
- ✅ **HTTPS support** - Use HTTPS for all webhook triggers
- ✅ **Multiple keys** - Different teams/systems can have separate keys

### Using Keys in Code

**❌ WRONG - Don't do this:**
```javascript
// NEVER hardcode keys in source code!
const key = "a1b2c3d4-e5f6-4a5b-8c9d-e1f2g3h4i5j6";
```

**✅ RIGHT - Use environment variables:**
```bash
# .env file (don't commit this!)
ORCHELIUM_API_KEY=a1b2c3d4-e5f6-4a5b-8c9d-e1f2g3h4i5j6
```

```javascript
const key = process.env.ORCHELIUM_API_KEY;
```

### Webhook URL Security

- Use **HTTPS** (not HTTP)
- Include API key in header or query parameter
- Consider **IP whitelisting** on your firewall
- Monitor for **failed trigger attempts**

---

## Troubleshooting

### "Invalid API Key" Error

**Problem:** `{"error": "Invalid or inactive webhook key"}`

**Solutions:**
- Verify you copied the key correctly (check for extra spaces)
- Confirm the webhook is marked as "Active" in settings
- Try rotating the key and using the new one
- Check that you're using the correct job name

### Webhook Not Triggering

**Problem:** External system sends request but job doesn't start

**Solutions:**
- Verify the job exists and is enabled in Orchelium
- Check the webhook shows as "Active" (green)
- Confirm API key is correct with `curl` test first
- Check Orchelium logs for errors
- Verify HTTPS certificate if using HTTPS

### "Job Not Found" Error

**Problem:** `{"error": "Job not found"}`

**Solutions:**
- Verify job name exactly matches (case-sensitive)
- Check job hasn't been deleted
- Confirm you're connected to correct Orchelium server

### Rate Limiting

**Problem:** Some webhook triggers are failing, others succeed

**Note:** Each agent has a concurrency limit (default: 3 jobs). If all slots are full, new jobs queue. Get alerts if queue gets too long.

**Solutions:**
- Reduce trigger frequency
- Increase agent concurrency (Settings → Thresholds)
- Add more agents
- Stagger triggers over time

---

## Webhook Activity Monitoring

### View Trigger Statistics

1. In Settings → Webhooks, click the stats icon
2. See total triggers by job
3. See last triggered time for each webhook
4. Identify inactive webhooks

### Check Execution Logs

After webhook triggers a job:
1. Go to **History** or **Job Monitor**
2. Find your job in the list
3. Click to view execution log
4. Look for `ORCHELIUM_WEBHOOK_*` environment variables

---

## Advanced Topics

### Webhook Payload Examples

**Monitoring Alert Webhook:**
```json
{
  "eventType": "threshold_exceeded",
  "metric": "cpu_usage",
  "value": 95,
  "host": "server1",
  "timestamp": "2026-04-04T14:30:00Z"
}
```

**CI/CD Pipeline Webhook:**
```json
{
  "event": "deployment",
  "repository": "my-app",
  "branch": "main",
  "deployment_id": "dep_12345",
  "environment": "production",
  "status": "success"
}
```

**Application Error Webhook:**
```json
{
  "alert_type": "error",
  "service": "api-server",
  "error_code": "500",
  "message": "Database connection failed",
  "severity": "critical"
}
```

### Conditional Job Execution

Your job scripts can examine webhook data to make decisions:

```bash
#!/bin/bash
# Example: Different cleanup based on webhook severity

PAYLOAD="$ORCHELIUM_TRIGGER_CONTEXT"
SEVERITY=$(echo "$PAYLOAD" | jq -r '.payload.severity // "normal"')

case "$SEVERITY" in
  "critical")
    echo "Critical cleanup: deleting all temp files"
    find /tmp -type f -delete
    ;;
  "high")
    echo "High priority: deleting files older than 1 day"
    find /tmp -type f -mtime +1 -delete
    ;;
  *)
    echo "Normal cleanup: deleting files older than 7 days"
    find /tmp -type f -mtime +7 -delete
    ;;
esac
```

### Webhook Health Checks

Periodically verify your webhooks are working:

```bash
#!/bin/bash
# Health check: Test all webhooks

ORCHELIUM_URL="https://your-orchelium"
API_KEY="YOUR_API_KEY"
JOB_NAME="health-check"

# Create a test-run

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$ORCHELIUM_URL/webhooks/trigger?jobName=$JOB_NAME&key=$API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"test": true}')

if [ "$HTTP_CODE" = "200" ]; then
  echo "✓ Webhook health check passed"
else
  echo "✗ Webhook health check failed (HTTP $HTTP_CODE)"
  exit 1
fi
```

---

## Related Documentation

- [Settings & Configuration](settings-config.md) - Webhook configuration options
- [REST API Reference](REST_API_REFERENCE.md#webhook-triggers) - Detailed API docs
- [Trigger Context Guide](../TRIGGER_CONTEXT_GUIDE.md) - Trigger system details
- [Phase 3 Developer Guide](Developers/phase3-webhook-ui-guide.md) - UI implementation details

---

## Support

Having issues with webhooks?

1. Check this guide's **Troubleshooting** section
2. Review webhook **Activity** in Settings → Webhooks
3. Check **Execution Logs** for webhook trigger data
4. Consult [REST API Reference](REST_API_REFERENCE.md#webhook-triggers)
5. Open an issue on GitHub with error details and logs
