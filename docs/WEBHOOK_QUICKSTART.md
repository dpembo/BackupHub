# Quick Start: Create a Webhook-Triggerable Job

**Step-by-step guide for creating a job and webhook through the Orchelium UI**

---

## Overview

To create a job that can be triggered by webhooks, you need to:

1. **Create a Job** (with a script)
2. **Create a Webhook** (for that job)
3. **Test** the webhook trigger

---

## Step 1: Create a Job

### Where to Click

1. **Open Orchelium** - Navigate to `http://localhost:8082`
2. Look for **"Schedules"** or **"Jobs"** in the main navigation
3. Look for a **"+"** button or **"Add Schedule"** button
4. Click it

### The Job Creation Form

You'll see a form with these fields:

```
Job Name: [text field]
Description: [text area]
Icon: [dropdown/icon selector]
Agent: [dropdown - select your agent]
Script/Command: [text area or dropdown]
```

### Example: Create a Test Job

Fill in the form as follows:

```
Job Name: webhook-test
Description: Test job for webhook triggers
Icon: [select something like "cloud_download" or "sync"]
Agent: [select your connected agent]
Script: (see below)
```

**Copy this script into the Script field:**

```bash
#!/bin/bash
echo "=========================================="
echo "Webhook Test Job Triggered!"
echo "=========================================="
echo ""
echo "Current Time: $(date)"
echo ""
echo "Environment Variables from Webhook:"
echo "Trigger Type: $ORCHELIUM_TRIGGER_TYPE"
echo "Execution ID: $ORCHELIUM_EXECUTION_ID"
echo "Full Trigger Context:"
echo "$ORCHELIUM_TRIGGER_CONTEXT" | jq . 2>/dev/null || echo "$ORCHELIUM_TRIGGER_CONTEXT"
echo ""
echo "Job completed successfully!"
echo "=========================================="
```

### Save the Job

1. Click **"Save"** or **"Create"** button
2. Job should appear in the list
3. You can test run it manually first (optional) by clicking **"Run Now"** or similar button

### Verification

✅ Job appears in Schedules list  
✅ Job name is exactly "webhook-test" (or whatever you named it)  
✅ Agent is correctly assigned

---

## Step 2: Create a Webhook for Your Job

### Navigate to Webhooks Settings

1. Click **"Settings"** in the main navigation
2. You'll see multiple tabs at the top (Server, WebSocket, MQTT, Alerts, etc.)
3. Click the **"Webhooks"** tab

### Create the Webhook

**You should see:**
- A table (empty if this is your first webhook)
- A button labeled **"Create Webhook"**
- A button labeled **"Refresh"**

**Click "Create Webhook" button**

### Fill in the Webhook Form

A modal dialog will pop up with a form:

```
Webhook Name: [text field] *required
Description: [text area] optional
Trigger URL: [read-only display of the webhook endpoint]
```

**Fill it in:**

```
Webhook Name: My Test Webhook
Description: Webhook for testing the webhook-test job
```

Then click **"Save"**

### Copy Your API Key

After saving, a modal will pop up showing:

```
⚠️  This is the only time your API key will be displayed. Save it securely!

[xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx] [Copy Button]

Usage:
curl -X POST https://your-orchelium/api/webhook/trigger/webhook-test \
  -H "X-Webhook-Key: <YOUR_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"message": "test payload"}'
```

**IMPORTANT:** Click **"Copy"** button to copy the API key to your clipboard.

Save it somewhere safe (notepad, password manager, etc.)

### Verify Webhook Created

1. Close the API Key modal
2. Look at the Webhooks table - your webhook should appear:

```
| Name               | Description                | Status   | Triggers | Last Triggered |
|--------------------|-----------------------------|----------|----------|----------------|
| My Test Webhook    | Webhook for testing...     | ● Active | 0        | Never          |
```

✅ Webhook name matches what you entered  
✅ Status shows "● Active" (green dot)  
✅ Trigger count is 0 (not yet triggered)

---

## Step 3: Test Triggering the Webhook

### Method 1: Using curl (Terminal)

**Open a terminal** and run this command:

```bash
curl -X POST "http://localhost:8082/api/webhook/trigger/webhook-test" \
  -H "X-Webhook-Key: YOUR_API_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Test message from webhook"
  }'
```

**Replace:**
- `YOUR_API_KEY_HERE` - Paste the API key you copied in Step 2
- `webhook-test` - Match the job name you created in Step 1

**Expected Response:**
```json
{
  "success": true,
  "message": "Job triggered successfully",
  "executionId": "exec-12345..."
}
```

### Method 2: Using a Browser Tool

1. Open **Postman** (or similar API testing tool)
2. Create new request:
   - **Method:** POST
   - **URL:** `http://localhost:8082/api/webhook/trigger/webhook-test`
   - **Headers:**
     - `X-Webhook-Key: YOUR_API_KEY_HERE`
     - `Content-Type: application/json`
   - **Body (JSON):**
     ```json
     {
       "message": "Test from Postman"
     }
     ```
3. Click **Send**
4. Should get success response

### Verify the Job Executed

1. In Orchelium UI, go to **"History"** or **"Job Monitor"**
2. Look for your "webhook-test" job in the recent executions
3. Click on it to view the execution log
4. You should see:
   ```
   ==========================================
   Webhook Test Job Triggered!
   ==========================================
   
   Current Time: Fri Apr 04 2026 10:30:00 GMT+0000
   
   Environment Variables from Webhook:
   Trigger Type: webhook
   Execution ID: exec-12345...
   Full Trigger Context:
   {
     "executionId": "exec-12345...",
     "triggerType": "webhook",
     "timestamp": "2026-04-04T10:30:00Z",
     "webhook": {
       "id": "550e8400-e29b-41d4-a716-446655440000",
       "name": "My Test Webhook"
     },
     "payload": {
       "message": "Test message from webhook"
     }
   }
   
   Job completed successfully!
   ==========================================
   ```

### Verify Webhook Statistics Updated

1. Go back to **Settings → Webhooks** tab
2. Look at your webhook in the table
3. **Trigger count** should now be **1** (was 0 before)
4. **Last Triggered** should show recent time

✅ Everything working!

---

## Complete Workflow Reference

### Quick Reference Checklist

- [ ] **Created job named "webhook-test"** with test script
- [ ] **Created webhook named "My Test Webhook"** pointing to above job
- [ ] **Copied and saved the API key**
- [ ] **Triggered webhook using curl or Postman**
- [ ] **Verified job executed in History**
- [ ] **Confirmed webhook statistics updated** (trigger count +1)

---

## Real-World Example: Disk Cleanup Job

Now that you understand the workflow, here's a real-world example:

### Step 1: Create the Job

**Job Name:** `cleanup-old-files`  
**Description:** Removes files older than 30 days from /backup

**Script:**
```bash
#!/bin/bash
# This script will receive trigger data via webhook

PAYLOAD=$(echo "$ORCHELIUM_TRIGGER_CONTEXT" | jq '.payload')
TARGET_PATH=$(echo "$PAYLOAD" | jq -r '.targetPath // "/backup"')
DAYS_OLD=$(echo "$PAYLOAD" | jq -r '.daysOld // "30"')

echo "Cleanup Job Started"
echo "Target: $TARGET_PATH"
echo "Removing files older than $DAYS_OLD days"

# This would be the actual cleanup (commented for safety):
# find "$TARGET_PATH" -type f -mtime +$DAYS_OLD -delete

echo "Cleanup completed successfully"
```

### Step 2: Create the Webhook

**Webhook Name:** `Monitoring System Cleanup Trigger`  
**Description:** Called by monitoring system when disk usage high

### Step 3: Test the Webhook

```bash
curl -X POST "http://localhost:8082/api/webhook/trigger/cleanup-old-files" \
  -H "X-Webhook-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "targetPath": "/backup/archive",
    "daysOld": "14"
  }'
```

The job will receive this data and can make decisions based on it!

---

## Troubleshooting

### Problem: "Job not found" or "Invalid webhook key"

**Solution:**
1. Verify job name in webhook matches exactly (case-sensitive)
2. Verify API key is correct
3. Verify webhook shows as "Active" (green) in Settings → Webhooks

### Problem: Job appears in History but no log output

**Solution:**
1. Check agent is online and connected
2. Verify script has executable permissions
3. Check for syntax errors in the script

### Problem: Can't find Webhooks tab in Settings

**Solution:**
1. Clear browser cache (Ctrl+Shift+Delete)
2. Hard refresh the page (Ctrl+Shift+R)
3. Restart Orchelium:
   ```bash
   npm start
   ```

### Problem: API key modal disappeared before copying

**Solution:**
1. Rotate the key (click key icon on webhook row)
2. New modal will appear with new key
3. Copy immediately

### Problem: "Trigger count not updating" in Webhooks table

**Solution:**
1. Click "Refresh" button on Webhooks tab
2. If still not updating, check Orchelium server logs for errors

---

## Security Tips

1. **Keep API keys secret**
   - Don't commit to Git
   - Store in password manager or secure location
   - Treat like passwords

2. **Rotate keys regularly**
   - Click key icon → "Rotate Key"
   - Old key immediately invalid
   - Update external systems with new key

3. **Use HTTPS in production**
   - Send keys only over HTTPS
   - Prevents key sniffing

4. **Monitor webhook activity**
   - Check "Last Triggered" timestamp
   - High trigger counts might indicate abuse
   - Use Statistics to monitor system-wide activity

---

## Next Steps

### What You Can Do Now

1. ✅ Create jobs that respond to webhooks
2. ✅ Pass custom data via webhook payloads
3. ✅ Make jobs make decisions based on trigger data
4. ✅ Monitor webhook activity and statistics

### Advanced Topics

For advanced usage, see:

- [Webhook User Guide](./docs/WEBHOOK_USER_GUIDE.md) - Complete webhook documentation
- [Trigger Context Guide](./docs/TRIGGER_CONTEXT_GUIDE.md) - Deep dive into trigger data
- [REST API Reference](./docs/REST_API_REFERENCE.md) - Full API documentation

### Integration Examples

Once you have webhooks working, you can integrate with:

- **Monitoring Systems** (Prometheus, Grafana, etc.)
- **CI/CD Pipelines** (GitHub Actions, GitLab CI, Jenkins)
- **Cloud Platforms** (AWS SNS, Azure Functions)
- **Chat Systems** (Slack, Discord webhooks)
- **Custom Applications** (any service that can send HTTP requests)

See [WEBHOOK_USER_GUIDE.md](./docs/WEBHOOK_USER_GUIDE.md) for integration examples with code.

---

## Video Walkthrough (Text Version)

**If you were to watch someone do this:**

1. 0:00 - Login to Orchelium
2. 0:10 - Click Schedules → Create new schedule
3. 0:30 - Fill in job name "webhook-test", select agent, add script
4. 1:00 - Save job
5. 1:10 - Navigate to Settings
6. 1:20 - Click Webhooks tab
7. 1:30 - Click "Create Webhook" button
8. 1:40 - Fill in webhook name "My Test Webhook"
9. 1:50 - Click "Save"
10. 2:00 - Copy API key from modal
11. 2:10 - Close modal, see webhook in table with status "Active"
12. 2:20 - Open terminal
13. 2:30 - Run curl command with job name and API key
14. 2:40 - See success response
15. 2:50 - Go to History
16. 3:00 - Find job execution and view log
17. 3:10 - See webhook data in execution output
18. 3:20 - Go back to Settings → Webhooks
19. 3:30 - See trigger count updated to 1
20. 3:40 - Done!

---

## Glossary

| Term | Meaning |
|------|---------|
| **Job** | A task (script) that runs on an agent |
| **Webhook** | An API endpoint that triggers a job when called |
| **API Key** | Secret token that authenticates webhook requests |
| **Trigger** | When a webhook is called and starts a job |
| **Payload** | Custom data sent with webhook (becomes environment variables) |
| **Execution** | Individual run of a job (visible in History) |
| **Context** | The trigger data available to the job script |

---

## Summary

**To create a webhook-triggerable job:**

1. **Create Job** in Schedules (with a script)
2. **Create Webhook** in Settings → Webhooks (point it to your job)
3. **Copy API Key** from the modal that appears
4. **Test** by calling the webhook with the API key
5. **Verify** by checking job execution in History

That's it! You now have a job that external systems can trigger via webhook.

---

**Still confused?** Check the troubleshooting section or review:
- [WEBHOOK_TESTING_GUIDE.md](./WEBHOOK_TESTING_GUIDE.md) - Complete testing procedures
- [WEBHOOK_USER_GUIDE.md](./docs/WEBHOOK_USER_GUIDE.md) - User guide with many examples
