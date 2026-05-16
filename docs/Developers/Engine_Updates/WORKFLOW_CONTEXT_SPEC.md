# Workflow Context — Design Specification

Workflow context allows nodes in an orchestration to reference the output of earlier nodes,
enabling data to flow through a workflow at runtime.

---

## 1. Goals

- Every action node produces a structured, accessible output record
- Later nodes can reference earlier node output via `#{nodes.<alias>.<key>}` template syntax
- Condition nodes can evaluate any node's output, not just the immediately preceding one
- All action nodes appear as children in the history list execution group
- Zero breaking changes to existing workflows

---

## 2. Node Aliases

### 2.1 What is an alias?

Every action node has two name-related fields:

| Field | Purpose | Example |
|---|---|---|
| `data.name` | Free-text display label shown on the canvas | `"My Restic Backup"` |
| `data.alias` | Normalised identifier used in template references | `"my_restic_backup"` |

Control nodes (`start`, `end`, `condition`, `split-join`) have display labels only and are **not referenceable**.

Action node types that carry an alias: `execute`, `http`, `notify`, `wait`, and (future) `plugin`.

### 2.2 Normalisation rules

Applied to `data.name` to produce `data.alias`:

1. Lowercase the string
2. Replace spaces and hyphens with `_`
3. Strip any character that is not `[a-z0-9_]`
4. Collapse consecutive `_` into a single `_`
5. Strip leading and trailing `_`

Examples:

```
"My Restic Backup!"   →  "my_restic_backup"
"HTTP - Check URL"    →  "http_check_url"
"Step 1 (optional)"   →  "step_1_optional"
```

### 2.3 Auto-generation

When a node is dropped onto the canvas, if no alias has been set, one is generated:

```
<type>_<counter>
```

Where `<counter>` is the count of nodes of that type already in the workflow, incremented until unique.

Examples: `execute_1`, `http_2`, `notify_1`

### 2.4 Uniqueness enforcement

Uniqueness is enforced on the **alias**, not on the display name.

- Duplicate display names are allowed
- Duplicate aliases are not — the editor appends `_2`, `_3`, etc. automatically
- Uniqueness is checked on save and on rename

### 2.5 Rename-refactor

When a node's name changes (causing its alias to change), the editor scans all other nodes in the same workflow for references to the old alias and replaces them:

```
#{nodes.old_alias.  →  #{nodes.new_alias.
```

The prefix `#{nodes.old_alias.` is specific enough to avoid false matches.
This happens in-memory at edit time before the workflow is saved.

---

## 3. Node Output Record (`nodeOutputs`)

### 3.1 Structure

`executionLog.nodeOutputs` is a map keyed by **alias** (not node ID), populated as each action node completes:

```js
executionLog.nodeOutputs['my_restic_backup'] = {
  type: 'execute',            // node type
  exitCode: 0,
  stdout: '...',
  stderr: '...',
  parsedOutput: {             // null if stdout is not JSON
    snapshot_id: 'abc123',
    files_new: 4,
    total_size: 1048576
  },
  startTime: '2026-05-15T10:00:00.000Z',
  endTime:   '2026-05-15T10:00:05.123Z',
  status: 'success'           // 'success' | 'failed'
}
```

### 3.2 JSON detection (`auto` mode)

Applied to `stdout` in order:

1. `JSON.parse(stdout)` — if the entire stdout is valid JSON, use it
2. Regex scan `/\{[\s\S]*?\}/` — extract and parse the first embedded JSON block found in mixed output
3. If neither succeeds, `parsedOutput = null` and stdout is treated as plain text

### 3.3 Per-node-type output content

| Node type | `stdout` | `parsedOutput` |
|---|---|---|
| `execute` (script) | Script stdout from agent | JSON-parsed if valid |
| `execute` (http) | HTTP response body | JSON-parsed if valid |
| `notify` | `"Notification sent: INFO - My Title"` | `{ sent: true, channel: 'discord', title: '...' }` |
| `wait` | `"Waited 5 seconds"` | `{ waited_ms: 5000 }` |
| `plugin` (template) | Command stdout | JSON-parsed if valid |
| `plugin` (script) | Script stdout from agent | JSON-parsed if valid |

### 3.4 Backward compatibility

`executionLog.scriptOutputs` is retained alongside `nodeOutputs` for backward compatibility with the
monitor view, history display, and `saveMissingScriptNodeHistory`. Both are populated — they are not
alternatives.

---

## 4. Template Reference Syntax

### 4.1 Reference format

```
#{nodes.<alias>.<path>}
```

`<path>` resolves as follows:

1. Check top-level meta fields first: `exitCode`, `stdout`, `stderr`, `status`, `startTime`, `endTime`
2. Otherwise resolve as a dot-path into `parsedOutput`

Examples:

```
#{nodes.my_restic_backup.snapshot_id}         →  parsedOutput.snapshot_id
#{nodes.my_restic_backup.exitCode}            →  exitCode (meta)
#{nodes.my_restic_backup.stdout}              →  raw stdout string
#{nodes.size_check.stats.total_size}          →  parsedOutput.stats.total_size (nested)
#{nodes.file_list.items[0].name}              →  parsedOutput.items[0].name (array index)
#{nodes.file_list.results[2].size}            →  parsedOutput.results[2].size
```

### 4.2 Dot-path resolution

A recursive resolver against a plain JS object. Supports dot-separated keys and `[n]` array indexing.

```js
function resolvePath(obj, path) {
  // Tokenise: split on '.' but also treat '[n]' as a separate step
  // e.g. 'items[0].name' → ['items', '0', 'name']
  const tokens = path.split('.').flatMap(segment => {
    const parts = [];
    let rest = segment;
    const arrayRe = /^([^\[]*)(\[(\d+)\])(.*)$/;
    let m;
    while ((m = arrayRe.exec(rest)) !== null) {
      if (m[1]) parts.push(m[1]);   // key before '['
      parts.push(m[3]);              // numeric index
      rest = m[4];                   // remainder after ']'
    }
    if (rest) parts.push(rest);
    return parts;
  });
  return tokens.reduce((cur, key) => cur?.[key], obj) ?? '';
}
```

Array indices use `[n]` notation: `items[0].name`, `results[2].size`.

Unresolved references (alias not found, path not found, `parsedOutput` is null) resolve to an empty
string `''` and a warning is logged. No hard failure.

### 4.3 Integration with existing syntax

The `nodes.` namespace is additive. All existing token patterns continue to work unchanged:

| Prefix | Source |
|---|---|
| `#{webhook.payload.*}` | `triggerContext.webhook` |
| `#{metric.*}` | `triggerContext.metric` |
| `#{trigger.*}` | `triggerContext` root |
| `#{nodes.*}` | **new** — `executionLog.nodeOutputs` |

### 4.4 Where substitution applies

`#{nodes.*}` references are resolved at node execution time, not at workflow start.
The `nodeOutputs` map is passed into `substituteTemplate()` alongside the trigger context.

Template substitution is applied in all locations where `#{` can appear today:

- `execute` node parameters
- `http` node URL, headers, body
- `notify` node title and body
- `wait` node (not currently templated — no change needed)

---

## 5. Condition Node Updates

### 5.1 Source node selection

A new optional field `sourceNodeAlias` is added to condition node data.

Resolution logic:

```
if (node.data.sourceNodeAlias) {
  // Read from nodeOutputs keyed by alias
  source = executionLog.nodeOutputs[node.data.sourceNodeAlias]
} else {
  // Existing behaviour — last script node on this execution path
  source = executionLog.scriptOutputs[pathContext.lastScriptNodeId]
}
```

Existing workflows that have no `sourceNodeAlias` are unaffected.

### 5.2 New condition type: `json_value`

Evaluates a dot-path into `parsedOutput` against a value.

| Field | Description |
|---|---|
| `conditionType` | `"json_value"` |
| `sourceNodeAlias` | Alias of the node whose output to inspect |
| `conditionPath` | Dot-path into `parsedOutput`, e.g. `snapshot_id` or `stats.total_size` |
| `operator` | Same operators as today: `==`, `!=`, `>`, `<`, `>=`, `<=` |
| `conditionValue` | Value to compare against (string or numeric) |

Evaluation:

```js
const actual = resolvePath(source.parsedOutput, conditionPath);
// For numeric operators, parseFloat(actual) vs parseFloat(conditionValue)
// For == and !=, string comparison if either value is non-numeric
```

If `parsedOutput` is null or the path does not resolve, the condition evaluates to `false` and a
warning is logged.

### 5.3 Full condition type table (updated)

| Type | Source | Tests |
|---|---|---|
| `return_code` | `exitCode` | Numeric comparison (existing) |
| `output_contains` | `stdout` | String contains (existing) |
| `regex_match` | `stdout` | Regex match (existing) |
| `execution_time` | `nodeMetrics.duration` | Numeric comparison (existing) |
| `json_value` | `parsedOutput` via dot-path | String or numeric comparison (new) |

---

## 6. History Store — All Nodes Write Entries

### 6.1 Current gap

Only `execute` (script) nodes write a `JOB_HISTORY` entry. This happens via the agent message
processor callback. `http`, `notify`, and `wait` nodes complete entirely within the hub — no agent
callback — so they never call `history.add()` and are invisible in the history list execution group.

### 6.2 Fix: shared `writeNodeHistory` helper

The engine calls this helper directly after every action node completes:

```js
function writeNodeHistory(executionLog, nodeId, nodeAlias, output) {
  const nodeJobName =
    `Orchestration [${executionLog.jobId}] Execution [${executionLog.executionId}] Node [${nodeId}]`;

  const startTime  = output.startTime || new Date().toISOString();
  const endTime    = output.endTime   || startTime;
  const runTimeSecs = Math.round((new Date(endTime) - new Date(startTime)) / 1000);
  const logMessage  = [output.stdout, output.stderr].filter(Boolean).join('\n\n');

  const histItem = history.createHistoryItem(
    nodeJobName,
    startTime,
    output.exitCode ?? 0,
    runTimeSecs,
    logMessage,
    executionLog.manual || false,
    executionLog.executionId,
    executionLog.rerunFrom || null
  );

  history.add(histItem);
}
```

### 6.3 Who writes per node type

| Node | Written by | Trigger |
|---|---|---|
| `execute` (script) | `agentMessageProcessor.js` (existing, no change) | Agent callback |
| `execute` (http) | Engine directly via `writeNodeHistory` (new) | After axios response |
| `notify` | Engine directly via `writeNodeHistory` (new) | After `sendNotification` resolves |
| `wait` | Engine directly via `writeNodeHistory` (new) | After timeout resolves |
| `plugin` (template) | Engine directly via `writeNodeHistory` (new) | After command completes |
| `plugin` (script) | `agentMessageProcessor.js` (existing) | Agent callback |

`saveMissingScriptNodeHistory` is retained unchanged — it handles the specific edge case where a
script-read failure occurs before the agent is ever contacted.

### 6.4 History list display

`getItemsGroupedByOrchestration()` in `history.js` requires no changes. It groups children by the
`"Orchestration [...] Execution [...] Node [...]"` name pattern already. Once all nodes write entries,
they automatically appear as children.

The child row currently shows the raw node ID in the job name string. The node alias (more readable)
should be made available — the simplest approach is to store it as an extra field on the history item
(`nodeAlias`) and render it in `historyListData.ejs` when present.

---

## 7. Implementation Scope

### 7.1 Files changed

| File | Change |
|---|---|
| `orchestrationEngine.js` | Add `nodeOutputs` to `executionLog`; populate for all action nodes; add `writeNodeHistory` helper; call it for http/notify/wait nodes; extend `applyTemplate` to resolve `#{nodes.*}`; update condition handler for `sourceNodeAlias` + `json_value` |
| `triggerContext.js` | Extend `substituteTemplate` to accept and resolve a `nodeOutputs` map alongside the existing trigger context |
| `history.js` | Add optional `nodeAlias` field to `createHistoryItem`; no logic changes |
| `views/historyListData.ejs` | Render `nodeAlias` as the child row label when present, falling back to the node ID extracted from the job name |
| `public/js/` (workflow editor) | Alias auto-generation on node drop; normalisation function; uniqueness check + collision suffix; rename-refactor scan on name change; `sourceNodeAlias` picker in condition node panel |

### 7.2 No changes required

- `agentMessageProcessor.js` — script node history path is unchanged
- `history.js` data structures — `createHistoryItem` gains one optional field, nothing else moves
- Agent code — agents remain unaware of workflow context
- Database schema — `ORCHESTRATION_EXECUTIONS` already stores the full `executionLog`; `nodeOutputs` is just a new key on that object

---

## 8. What is Deferred

| Item | Phase |
|---|---|
| Context viewer in monitor UI — a formatted JSON panel alongside the existing stdout textarea, pretty-printing `parsedOutput` (which is derived from stdout at execution time) so available reference keys are clearly visible | Phase 2 |
| Reference picker in the workflow builder — if a prior execution exists and a node produced `parsedOutput`, input fields (parameters, HTTP body/URL, notify body, condition path) show a helper that lets the user browse and select available keys, inserting the correct `#{nodes.<alias>.<path>}` token rather than requiring manual dot-notation entry | Phase 2 |
| Workflow debugger (step-through with live context inspection) | Phase 2 |
| `parse.yaml` (structured extraction hints in plugins) | Phase 2 |
| Plugin node type | Plugin Phase 1 (separate spec) |
