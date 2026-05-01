# Rule-Based Triggers and Concurrency

Orchestrations can be triggered by rule-based thresholds (see [settings-config.md](./settings-config.md)). You can design orchestrations to run automatically when a metric rule is met.

Orchestration executions also respect agent concurrency limits. If an agent is at its concurrency limit, orchestration steps targeting that agent will be queued or skipped until capacity is available.

## Trigger Context System

When an orchestration is triggered by a rule-based threshold, **trigger context** (metric data) is automatically passed through the entire workflow. This allows your orchestration to make intelligent decisions based on the metric that triggered it.

### Template Substitution in Parameters

You can use template syntax in execute node parameters to inject metric values:

```
#{context.metric.type}         → "cpu", "mount_usage", etc.
#{context.metric.value}        → Actual value (92.5)
#{context.metric.unit}         → "%", "bytes", "count", etc.
#{context.metric.path}         → "/mnt/data", etc.
#{context.condition.operator}  → ">=", "<=", etc.
#{context.condition.threshold} → 90
```

**Example**: An orchestration triggered by "disk usage ≥ 90%" on /mnt/data:

Execute node parameters:
```
--mount #{context.metric.path} --cleanup-percent #{context.metric.value}
```

Becomes:
```
--mount /mnt/data --cleanup-percent 92.5
```

### Conditional Branching Based on Metrics

Use condition nodes to branch based on metric values:

```
✗ If metric.value >= 95
  → Run aggressive cleanup
  
✓ Else (metric.value 90-94)
  → Run standard cleanup
```

### Available Trigger Context Fields

All metric and condition information used by the rule is available throughout orchestration execution:

- `context.type` → "rule", "webhook", "sample"
- `context.metric.{type, value, unit, path, agent}`
- `context.condition.{operator, threshold, met}`
- `context.executionId` → Unique execution tracking ID
- `context.timestamp` → When the rule triggered

For detailed examples and webhook trigger usage, see [TRIGGER_CONTEXT_GUIDE.md](../TRIGGER_CONTEXT_GUIDE.md).

# Orchestrations

Orchestrations allow you to create complex workflows by chaining multiple scripts together with conditional logic. Instead of running a single script per schedule, you can design sophisticated multi-step processes with decision branches, error handling, and complex execution paths.

## Overview

An orchestration is a visual workflow that defines:
- **Execution nodes**: Scripts to run at different stages
- **Flow control**: How execution moves from one node to another
- **Conditionals**: Branches based on return codes, script output, or execution time
- **Terminal states**: Success or failure outcomes

Once created, orchestrations can be integrated directly into schedules, providing a powerful way to automate complex  scenarios.

---

## Getting Started

### Prerequisites
1. Orchelium installed and running
2. At least one agent deployed
3. Appropriate scripts already created
4. Admin access to create orchestrations

### Accessing the Orchestration Builder

Navigate to the **Orchestrations** section from the main menu, then click the **Add** icon (top right) or the **Create Orchestration** button to open the Orchestration Builder.

---

## Orchestration Builder Interface

The builder is divided into four main sections:

### 1. Header Area
- **Orchestration Name & Description**: Click to edit (top left)
- **List Schedules**: Shows all schedules using this orchestration (button left of Run)
- **Run**: Execute the orchestration manually (button)
- **Save Orchestration**: Persist your changes to the database (button)

### 2. Left Palette
A panel containing draggable node types:
- **Start**: Entry point for the workflow (only one allowed)
- **Execute Script**: Run a script on a target agent
- **HTTP Request**: Call an external HTTP endpoint
- **Wait**: Pause execution for a fixed number of seconds
- **Notify**: Send a notification message
- **Split**: Fan out to multiple parallel branches
- **Join**: Synchronise parallel branches back into one path
- **Condition**: Branch execution based on test results
- **Success**: Terminal node for successful completion
- **Failure**: Terminal node for failed completion

**Counters** at the bottom show your current node and connection counts.

### 3. Canvas (Center)
The main drawing area where you:
- Drag nodes from the palette
- Connect nodes with arrows
- Arrange your workflow visually
- Zoom in/out for detail work

**Zoom Controls** (fixed to bottom-right):
- `−` Zoom out
- `+` Zoom out
- `100%` Display current zoom level
- `↻` Reset to default zoom

### 4. Properties Panel (Right)
Appears when you select a node, showing configuration options specific to that node type. Has a close button (×) to hide it.

---

## Node Types

### Start Node
- **Purpose**: Entry point for your orchestration
- **Restrictions**: Only one per orchestration (palette item disables after adding)
- **Configuration**: None (no properties to set)
- **Output**: Single arrow to the next node

### Execute Script Node
- **Purpose**: Run a specific script on a target agent
- **Configuration**:
  - **Script**: Dropdown list of available scripts
  - **Target Agent**: Which agent to run the script on
  - **Script Info**: Displays description and parameters for the selected script
  - **Parameters**: Custom command parameters or command override
- **Output**: Multiple exit ports labeled with return codes
  - `Success (0)`: Green arrow for return code 0
  - `Failure (non-zero)`: Red arrow for other return codes

### Condition Node
- **Purpose**: Branch execution based on test criteria
- **Test Types**:
  - **Return Code**: Check the exit code from the previous node
  - **Output Contains**: Check if script output contains specific text (regex supported)
  - **Execution Time**: Check how long the script took (in seconds)
- **Operators**:
  - Basic: `==`, `!=`, `>`, `>=`, `<`, `<=`
  - Negations: `!>`, `!>=`, `!<`, `!<=`
  - For Output Contains: only `==` (contains) and `!=` (does not contain)
- **Configuration**:
  - **Test Type**: What to evaluate
  - **Operator**: How to compare
  - **Value**: The comparison value (regex for Output Contains, number for others)
- **Output**: Two paths labeled `TRUE` and `FALSE`

### HTTP Request Node
- **Purpose**: Call an external HTTP endpoint as a step in the workflow — useful for triggering remote APIs, sending payloads to monitoring systems, or integrating with third-party services
- **Configuration**:
  - **Method**: `GET`, `POST`, `PUT`, `PATCH`, or `DELETE`
  - **URL**: Full URL to call. Supports `#{...}` template substitution (see [Template Substitution](#template-substitution-in-http-and-notify-nodes))
  - **Timeout (ms)**: Request timeout in milliseconds (default: 30 000)
  - **Headers**: Optional list of custom request headers (key/value pairs). Header values support `#{...}` substitution
  - **Body**: Optional request body for `POST`/`PUT`/`PATCH` requests. Valid JSON is parsed and sent as `application/json`; any other text is sent as-is. Supports `#{...}` substitution
  - **Authentication**: Choose one of:
    - `None` — no authentication
    - `Bearer Token` — adds `Authorization: Bearer <token>` header. Token value supports `#{...}` substitution
    - `Basic Auth` — username and password. Both support `#{...}` substitution
    - `API Key` — custom header name and value. Value supports `#{...}` substitution
- **Exit Code**: `0` for HTTP 2xx responses; `1` for all other status codes or network errors
- **Output**: A single `out` arrow. Use a **Condition** node after it to branch on the HTTP result
- **Notes**:
  - Execution continues regardless of HTTP status — the exit code is recorded and can be inspected by a downstream Condition node
  - The full response body is available as node output in the Monitor

### Wait Node
- **Purpose**: Pause the workflow for a fixed amount of time before proceeding
- **Configuration**:
  - **Wait (seconds)**: Number of seconds to pause. Accepts decimals (e.g. `0.5`). Defaults to `5` if left blank or set to an invalid value
- **Exit Code**: Always `0` (success)
- **Output**: Single `out` arrow
- **Use cases**: Rate-limiting between API calls, allowing a service time to start up, inserting deliberate delays between script steps

### Notify Node
- **Purpose**: Send a notification message during the workflow — for example to alert on a key milestone, report a metric, or raise an alert before a risky step
- **Configuration**:
  - **Type**: Severity level — `INFORMATION`, `WARNING`, or `ERROR`
  - **Title**: Short notification subject. Supports `#{...}` template substitution
  - **Message**: Full notification body. Supports `#{...}` template substitution
  - **Link (optional)**: A URL to include with the notification (e.g. to a dashboard). Supports `#{...}` substitution
- **Exit Code**: `0` if the notification was sent successfully; `1` if the notification service returned an error (execution still continues)
- **Output**: Single `out` arrow
- **Notes**:
  - Notifications are delivered through the same channels configured in **Settings → Notifications**
  - A failed notification does not abort the orchestration

### Split Node
- **Purpose**: Fan out to multiple parallel branches so several tasks can run concurrently
- **Configuration**: None (all outgoing arrows from the `out` port become parallel branches)
- **Output**: One or more `out` arrows — each becomes an independent, concurrent branch
- **Notes**:
  - All branches start simultaneously
  - Use a **Join** node downstream to re-synchronise the branches
  - If any branch reaches a **Failure** terminal node the merged result is `failure`

### Join Node
- **Purpose**: Synchronise parallel branches started by a Split node back into a single execution path
- **Configuration**:
  - **Join Strategy**:
    - `Wait for All` (default) — waits until every incoming branch has arrived before continuing
    - `Wait for Any` — releases as soon as the first branch arrives; remaining branches are discarded
- **Output**: Single `out` arrow (continues after all/any branches have arrived)
- **Notes**:
  - A Join node must have at least one incoming edge from each branch you want to synchronise
  - Use `Wait for Any` when you want to race parallel tasks and proceed with whichever finishes first

### Success Node
- **Purpose**: Marks a successful completion path
- **Configuration**: None
- **Exit Port**: None (terminal node)

### Failure Node
- **Purpose**: Marks a failed completion path
- **Configuration**: None
- **Exit Port**: None (terminal node)

---

## Building a Workflow

### Step 1: Create and Configure Nodes

1. **Add Start Node**: Drag the Start node from the palette onto the canvas
2. **Add Execute Nodes**: Drag Execute Script nodes for each  step
3. **Add Logic**: Add Condition nodes for branching
4. **Add Terminals**: Connect to Success or Failure nodes

### Step 2: Configure Each Node

1. Click a node to select it (properties appear on the right)
2. For Execute nodes:
   - Select the **Script** from dropdown
   - Select the **Target Agent**
   - View the script info and parameters
   - Enter any custom **Parameters** if needed
3. For HTTP Request nodes:
   - Choose the **Method** and enter the **URL**
   - Optionally set **Timeout**, **Headers**, **Body**, and **Authentication**
4. For Wait nodes:
   - Enter the **Wait (seconds)** value
5. For Notify nodes:
   - Select the notification **Type** and fill in the **Title** and **Message**
6. For Condition nodes:
   - Choose **Test Type** (Return Code, Output Contains, or Execution Time)
   - Select **Operator** for comparison
   - Enter the **Value** to test against
7. For Split nodes:
   - No configuration required — draw one outgoing arrow per branch
8. For Join nodes:
   - Choose the **Join Strategy** (`Wait for All` or `Wait for Any`)

### Step 3: Connect Nodes

1. Click and drag from the exit port of one node to the entry port (left side) of another
2. For Execute nodes, you can connect multiple paths (Success/Failure)
3. For Condition nodes, connect both TRUE and FALSE paths
4. Nodes must eventually lead to Success or Failure terminals

### Step 4: Name Your Orchestration

1. Click the orchestration name at the top left
2. Enter a descriptive name (required)
3. Optionally add a description explaining the workflow
4. Click **Save & Continue**

### Step 5: Save

Click the **Save Orchestration** button to persist your workflow to the database.

---

## Example Workflows

### Example 1: Sequential Backup with Error Handling

```
Start → Backup Database → [Return Code == 0?]
                                     ├─ YES → Backup Files → Success
                                     └─ NO → Failure
```

### Example 2: Conditional Cleanup

```
Start → Full Backup → [Return Code == 0?]
                          ├─ YES → Cleanup Old Backups → Success
                          └─ NO → Alert/Failure → Failure
```

### Example 3: Multi-Step with Time Check

```
Start → Backup A → [Execution Time < 300s?]
                       ├─ YES → Backup B → Success
                       └─ NO → Cleanup (time exceeded) → Failure
```

### Example 4: HTTP Webhook Notification

```
Start → Run Backup Script → HTTP POST to Slack webhook → Success
```

The HTTP node is configured with:
- **Method**: `POST`
- **URL**: `https://hooks.slack.com/services/T.../B.../...`
- **Body**:
  ```json
  {"text": "Backup completed on #{context.metric.path} (disk was #{context.metric.value}%)"}
  ```

### Example 5: Notify Before a Risky Operation

```
Start → [Disk usage > 95%?]
            ├─ YES → Notify (WARNING: Emergency cleanup) → Emergency Cleanup → Success
            └─ NO  → Standard Cleanup → Success
```

The Notify node is configured with:
- **Type**: `WARNING`
- **Title**: `Emergency disk cleanup triggered`
- **Message**: `Disk on #{context.metric.path} is at #{context.metric.value}%. Running emergency cleanup now.`

### Example 6: Parallel Agent Backups

```
Start → Split
            ├─ Backup Agent 1 ─┐
            ├─ Backup Agent 2 ─┤
            └─ Backup Agent 3 ─┘
                               └─ Join (Wait for All) → Verify Checksums → Success
```

All three backup scripts run concurrently. The Join node waits for all of them to finish before the verification step runs.

### Example 7: Wait for Service Restart

```
Start → Restart Service Script → Wait (30s) → Health Check Script → [Return Code == 0?]
                                                                          ├─ YES → Success
                                                                          └─ NO  → Failure
```

The Wait node gives the service time to become ready before the health check runs.

---

## Template Substitution in HTTP and Notify Nodes

The **HTTP Request** and **Notify** node types support `#{context.*}` template substitution in their text fields, using the same syntax as Execute node parameters. This allows you to embed live trigger context (metric values, webhook payload fields, etc.) directly into HTTP requests and notification messages.

### Supported Fields in HTTP Nodes

| Field | Supports `#{...}` |
|-------|-------------------|
| URL | Yes |
| Header values | Yes |
| Body | Yes |
| Bearer token | Yes |
| Basic auth username / password | Yes |
| API key value | Yes |

**Example — dynamic API call using metric context:**

```
Method:  POST
URL:     https://monitoring.example.com/api/alerts/#{context.metric.type}
Headers: X-Agent: #{context.metric.agent}
Body:
  {
    "value": #{context.metric.value},
    "threshold": #{context.condition.threshold},
    "path": "#{context.metric.path}",
    "executionId": "#{context.executionId}"
  }
```

With a `mount_usage` trigger on `/mnt/data` at 94%, this becomes:

```
POST https://monitoring.example.com/api/alerts/mount_usage
X-Agent: server1

  {
    "value": 94,
    "threshold": 90,
    "path": "/mnt/data",
    "executionId": "a1b2c3d4e5f6"
  }
```

### Supported Fields in Notify Nodes

| Field | Supports `#{...}` |
|-------|-------------------|
| Title | Yes |
| Message | Yes |
| Link URL | Yes |

**Example — notification that includes live metric data:**

```
Type:    WARNING
Title:   High disk usage on #{context.metric.path}
Message: Disk usage reached #{context.metric.value}% (threshold: #{context.condition.threshold}%).
         Triggered at #{context.timestamp}. Execution ID: #{context.executionId}.
Link:    /orchestration/monitor.html?executionId=#{context.executionId}
```

> **Note**: When an orchestration is run manually (not triggered by a rule or webhook), `#{context.*}` fields fall back to safe defaults (empty strings or `0`) rather than causing an error.

---

## Using Orchestrations in Schedules

Once you've created an orchestration, you can use it in a schedule:

1. Go to **Schedules** and create a new schedule (or edit an existing one)
2. In the schedule editor, select the **Orchestration** mode (vs Classic mode)
3. Select your orchestration from the **Orchestration** dropdown
4. Set the schedule timing (daily, weekly, monthly, etc.)
5. Save the schedule

The orchestration will now execute according to the schedule timing, running the entire workflow you designed.

---

## Orchestration Monitor

### Accessing the Monitor

After starting an orchestration execution (manually or via schedule), you can monitor progress:

1. Click **Run** in the orchestration builder, or
2. Navigate to **Orchestrations** list and click the run icon, or
3. View from **History** → click orchestration entry → click View Details

### Monitor Interface

The monitor displays:

- **Orchestration Summary**: Name, current status, execution progress
- **Visual Workflow**: Your orchestration diagram with current execution highlighted
- **Execution Tree**: Hierarchical view of all nodes executed with their status
  - Green checkmark: Success
  - Red flag: Failure
  - Running spinner: In progress

### Node Details

Click any node in the execution tree to view its detail panel on the right. The fields shown depend on the node type:

**All node types:**
- **Status** — Success, Failure, In Progress, or Not Executed
- **Node Type** — The type identifier (e.g. `execute`, `wait`, `notify`, `split-join (split)`)
- **Start Time** — When the node began executing
- **Time Taken** — Duration in seconds

**Execute Script nodes additionally show:**
- **Agent** — Which agent ran the script
- **Exit Code** — Return code (0 = success, non-zero = failure), colour-coded
- **Parameters** — The substituted parameters passed to the script
- **Output Log** — Full stdout from the script

**HTTP Request nodes additionally show:**
- **Service** — Shown as `HTTP Request`
- **Method** — e.g. `GET`, `POST`
- **URL** — The actual URL called (after any `#{...}` template substitution)
- **HTTP Status** — Response status code, colour-coded green (2xx) or red (other)
- **Auth Type** — Authentication method used
- **Exit Code** — `0` for 2xx responses, `1` otherwise
- **Response Body** — The full response body received from the server

**Wait nodes additionally show:**
- **Service** — Shown as `Wait Timer`
- **Delay** — The configured wait duration in seconds
- **Exit Code** — Always `0`
- **Wait Output** — Confirmation message (e.g. `Waited 30 seconds`)

**Notify nodes additionally show:**
- **Service** — Shown as `Notification Framework`
- **Type** — `INFORMATION`, `WARNING`, or `ERROR`
- **Title** — The notification subject (after template substitution)
- **Link** — The URL included in the notification, if configured
- **Exit Code** — `0` if sent successfully, `1` if the notification service returned an error
- **Notification Output** — Status message or error detail

**Condition nodes additionally show:**
- **Condition** — The expression evaluated (e.g. `return_code equals 0`)
- **Result** — True ✓ or False ✕, colour-coded

**Start node additionally shows:**
- **Triggered By** — How the orchestration was started (Manual, Rule, Webhook)
- **Trigger Detail** — The rule name, webhook name, or metric value that fired it

**Split/Join nodes additionally show:**
- **Node Type** — Displayed as `split-join (split)` or `split-join (join)`
- **Parallel** — Whether this node ran concurrently with others, and which branches

### Real-Time Updates

The monitor updates in real-time as the orchestration progresses:
- Your browser maintains a WebSocket connection to the server
- Status updates and log output appear immediately
- No need to refresh the page

---

## History and Re-execution

### Viewing Orchestration History

In the **History** view:
- Orchestrations appear as grouped entries with a schema icon
- Click the expand arrow to view all nodes that were executed
- Each node shows: name, runtime, exit code, and execution status

### Description Display

Orchestrations show their description (if set) in the history:
- Truncated to prevent column stretching
- Full text visible on hover
- Same styling as schedule descriptions for consistency

### Re-running Failed Orchestrations

To re-run a failed orchestration from history:

1. Find the orchestration in **History**
2. Look for the red failure indicator
3. Click the **play_circle** icon (re-run button)
4. The orchestration will execute again with the same configuration
5. Progress updates in **Running List**
6. Monitor the re-execution via the monitor interface

---

## Best Practices

### Workflow Design

1. **Keep it simple**: Complex workflows with many nodes may be harder to debug
2. **Test each script first**: Ensure individual scripts work before adding to orchestrations
3. **Use descriptive names**: Make it clear what each script does
4. **Plan exit paths**: Ensure all execution paths lead to Success or Failure

### Error Handling

1. **Always plan for failure**: Add conditional branches for error cases
2. **Use Return Codes**: Most scripts exit with 0 on success, non-zero on failure
3. **Log output**: Enable script logging to see what went wrong
4. **Test failure paths**: Deliberately cause failures to verify error handling

### Performance

1. **Monitor execution time**: Use Execution Time conditions to catch hung processes
2. **Parallel execution**: Use Split/Join nodes to run multiple agents concurrently
3. **Cleanup**: Add nodes to clean up temporary files after job completion

### Documentation

1. **Use descriptions**: Set orchestration descriptions explaining the workflow
2. **Comment in scripts**: Add comments in job scripts about expected parameters
3. **Document schedules**: Note why each orchestration is scheduled and what it does

---

## Troubleshooting

### Issue: Orchestration won't save
- Ensure all paths lead to Success or Failure nodes
- Check that all Execute nodes have a script and agent selected
- Verify the orchestration has a name

### Issue: Node won't connect
- Ensure you're dragging from an exit port (right side of source node)
- Check that target node has an entry port (left side)
- Failure/Success nodes are terminal (no outgoing connections)

### Issue: Script didn't execute as expected
- Check the agent status in **Agents** list (must be "Connected")
- Verify the script parameters are correct
- Review the execution logs in the Monitor

### Issue: Condition branch not taken
- Verify the test type matches what you're checking
- Check the operator is correct for your comparison
- Review the script output to confirm the test condition

### Issue: Monitor shows no output
- Ensure the script writes output to stdout

### Issue: HTTP request not sending correct values
- Verify `#{...}` template syntax (e.g. `#{context.metric.value}`, not `#{metric.value}`)
- Check that the orchestration was triggered with context (manually-run orchestrations use safe defaults)
- Confirm the URL does not contain spaces or unencoded special characters
- Check the Monitor output for the HTTP node to see the actual URL used and the response status

### Issue: Notification not received
- Verify notification channels are configured in **Settings → Notifications**
- Check that **Title** and **Message** are both set (both are required)
- Review the Monitor output for the Notify node to confirm whether sendNotification returned an error

### Issue: Parallel branches not all running
- Confirm the Split node has one outgoing arrow per intended branch
- Make sure each branch eventually reaches either a Join node or a terminal (Success/Failure)
- Check agent concurrency limits if multiple branches target the same agent

### Issue: Join node not releasing
- Ensure every branch that feeds the Join node has a unique edge `id` (required for `waitAll` counting)
- If using `Wait for All`, all branches must complete — a timed-out script will block the join until it resolves or times out
- Consider switching to `Wait for Any` if you only need one branch to succeed
- Check agent logs for errors (agent may not have permissions)
- Verify the agent hasn't disconnected mid-execution

---

## Advanced Topics

### Condition Testing Tips

**For Return Code testing**:
- 0 = Success, anything else = Failure
- Most scripts follow this convention
- Use `== 0` for success, `!= 0` for failure

**For Output Contains testing**:
- Supports regex patterns: `.*error.*` matches any line with "error"
- Case-sensitive by default
- Test in script first to confirm output format

**For Execution Time testing**:
- Times in seconds: 300 = 5 minutes
- Useful for timeout detection
- Include buffer: expect slowdowns under load

### Advanced Workflows

You can create sophisticated patterns:

**Retry Logic**: 
- Execute script A
- If fails, execute cleanup
- If cleanup succeeds, return to Execute script A

**Parallel-like execution**:
- Not truly parallel, but can simulate with careful branching
- Execute different scripts based on conditions
- Rejoin paths to a final cleanup

---

## Limits and Constraints

- **Maximum nodes per orchestration**: 50 (practical limit, configurable)
- **Maximum connections**: Limited by nodes
- **Execution timeout**: Default 24 hours (configurable in settings)
- **Agent availability**: All required agents must be connected at execution time
- **Script parameters**: Limited by shell command line length and agent restrictions

---

## Related Documentation

- [Backup Schedules](./backup-schedules.md): How to create job schedules
- [Installation](./installation.md): Setting up Orchelium
- [Settings Configuration](./settings-config.md): Server configuration options
- [User Management](./user-management.md): Permission and user setup
