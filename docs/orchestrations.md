# Rule-Based Triggers and Concurrency

Orchestrations can be triggered by rule-based thresholds (see [settings-config.md](./settings-config.md)). You can design orchestrations to run automatically when a metric rule is met.

Orchestration executions also respect agent concurrency limits. If an agent is at its concurrency limit, orchestration steps targeting that agent will be queued or skipped until capacity is available.

# Orchestrations

Orchestrations allow you to create complex backup workflows by chaining multiple backup scripts together with conditional logic. Instead of running a single script per schedule, you can design sophisticated multi-step processes with decision branches, error handling, and complex execution paths.

## Overview

An orchestration is a visual workflow that defines:
- **Execution nodes**: Scripts to run at different stages
- **Flow control**: How execution moves from one node to another
- **Conditionals**: Branches based on return codes, script output, or execution time
- **Terminal states**: Success or failure outcomes

Once created, orchestrations can be integrated directly into schedules, providing a powerful way to automate complex backup scenarios.

---

## Getting Started

### Prerequisites
1. BackupHub Server installed and running
2. At least one agent deployed
3. Backup scripts already created
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
- **Execute Script**: Run a backup script on a target agent
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
- **Purpose**: Run a specific backup script on a target agent
- **Configuration**:
  - **Script**: Dropdown list of available backup scripts
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
2. **Add Execute Nodes**: Drag Execute Script nodes for each backup step
3. **Add Logic**: Add Condition nodes for branching
4. **Add Terminals**: Connect to Success or Failure nodes

### Step 2: Configure Each Node

1. Click a node to select it (properties appear on the right)
2. For Execute nodes:
   - Select the **Script** from dropdown
   - Select the **Target Agent**
   - View the script info and parameters
   - Enter any custom **Parameters** if needed
3. For Condition nodes:
   - Choose **Test Type** (Return Code, Output Contains, or Execution Time)
   - Select **Operator** for comparison
   - Enter the **Value** to test against

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

Click any node in the execution tree to view:
- **Node Name**: The script or condition
- **Status**: Success, Failure, or Pending
- **Exit Code**: Return code (for Execute nodes)
- **Execution Time**: How long the node took
- **Output/Logs**: Full script output and logs

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
2. **Parallel execution**: Orchestrations execute serially (one node at a time)
3. **Cleanup**: Add nodes to clean up temporary files after backup completion

### Documentation

1. **Use descriptions**: Set orchestration descriptions explaining the workflow
2. **Comment in scripts**: Add comments in backup scripts about expected parameters
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

- [Backup Schedules](./backup-schedules.md): How to create schedules
- [Installation](./installation.md): Setting up BackupHub
- [Settings Configuration](./settings-config.md): Server configuration options
- [User Management](./user-management.md): Permission and user setup
