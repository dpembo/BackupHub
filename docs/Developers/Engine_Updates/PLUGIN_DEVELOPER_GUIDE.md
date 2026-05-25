# Plugin Developer Guide

This guide walks through building a plugin for Orchelium from scratch, using the bundled `rsync` plugin as a running example.

For the authoritative field-by-field schema reference, see [PLUGIN_SPEC.md](./PLUGIN_SPEC.md).

---

## 1. What a Plugin Is

A plugin is a **folder** under `plugins/` containing a declarative definition file (`plugin.yaml`) and, optionally, a command script, an icon, and documentation.

The hub reads the folder on startup and whenever any file inside changes. No restart is required.

Plugins are **execution units only**. They define inputs, produce stdout/stderr/exit code, and optionally emit a JSON summary. They do not define workflow logic, branching, or UI code — the builder and engine handle all of that from the plugin definition.

---

## 2. Folder Layout

```
plugins/
  rsync/
    plugin.yaml      ← required
    run.sh           ← the command script (referenced by plugin.yaml)
    icon.svg         ← optional, shown in the workflow builder palette
    docs.md          ← optional, shown in the UI help panel
    examples/        ← optional
      examples.yaml
```

Create a folder under `plugins/` whose name matches the `name` field in `plugin.yaml`. Only `plugin.yaml` is required; everything else is optional.

---

## 3. plugin.yaml

`plugin.yaml` is the only required file. It describes the plugin's identity, inputs, and how to run it.

### 3.1 Minimal example

```yaml
name: rsync
label: Rsync
description: Synchronise files between directories or hosts using rsync.

inputs:
  - name: source
    label: Source
    type: string
    required: true

  - name: destination
    label: Destination
    type: string
    required: true

command: ./run.sh
args:
  - "{{inputs_json}}"

output:
  format: auto
```

### 3.2 Top-level fields

| Field | Required | Description |
|---|---|---|
| `name` | yes | Machine identifier. Must be unique across all plugins. Used as the key in workflow JSON. Lowercase, no spaces. |
| `label` | yes | Human-readable name shown in the builder palette and node label. |
| `description` | no | Short description shown in tooltips and docs panels. |
| `inputs` | no | Array of input field definitions (see §3.3). |
| `template` | yes* | Inline shell command with `{{variable}}` placeholders. |
| `command` | yes* | Path to a script relative to the plugin folder. |
| `args` | no | Array of arguments passed to `command`. Supports `{{variable}}` substitution. |
| `output.format` | no | `auto` (default), `json`, or `text`. |

*Either `template` or `command` is required, but not both.

### 3.3 Input field definitions

Each entry in `inputs` becomes a labelled form field in the builder's properties panel.

```yaml
inputs:
  - name: source           # internal key, used in {{source}} templates
    label: Source          # displayed in the UI
    type: string           # field type (see §3.4)
    required: true
    default: ""            # pre-filled value
    placeholder: "/data/"  # greyed hint text in empty field
    description: >         # help text shown below the field
      Source path. Use a trailing slash to sync contents only.
```

### 3.4 Field types

| Type | UI control | Notes |
|---|---|---|
| `string` | Text input | General text |
| `secret` | Password input | Value masked; not logged |
| `number` | Number input | Numeric only |
| `boolean` | Checkbox | `true` / `false` |
| `select` | Dropdown | Requires `options: [val1, val2, ...]` |
| `list` | Textarea | Requires `item_type: string` (or other scalar type) |
| `json` | Textarea | Free-form JSON |

#### rsync uses `string` and `number`

```yaml
inputs:
  - name: options
    label: Options
    type: string
    required: false
    default: "-avz"

  - name: bandwidth_limit
    label: Bandwidth Limit (KB/s, optional)
    type: number
    required: false
    placeholder: "0"
```

---

## 4. Execution Modes

### 4.1 Template mode

For simple one-liners, define `template` directly in `plugin.yaml`. Variable substitution uses `{{variable}}` syntax.

```yaml
template: |
  restic backup --repo {{repo}} --password-file {{password_file}} {{paths}}
```

No script file needed. The hub expands the template and sends the resulting shell command to the agent.

**Limitations:** Templates support substitution only — no loops, conditionals, or error handling. Use command mode for anything non-trivial.

### 4.2 Command mode

For complex logic, write a script and reference it with `command`:

```yaml
command: ./run.sh
args:
  - "{{inputs_json}}"
```

The hub reads `run.sh` from the plugin folder, sends its content to the agent, and passes `args` as parameters. `{{inputs_json}}` is the special token that expands to a JSON blob of all input values:

```json
{
  "source": "/data/backups/",
  "destination": "user@nas:/vol1/",
  "options": "-avz --delete",
  "ssh_key": "",
  "bandwidth_limit": 0
}
```

The rsync plugin uses command mode because it needs conditional flag construction and error handling that a one-liner cannot express cleanly.

---

## 5. Writing a Command Script

### 5.1 Receiving inputs

The recommended pattern is to accept the JSON blob as the first positional argument (`$1`) and parse it with `python3`:

```bash
#!/usr/bin/env bash
set -euo pipefail

INPUT_JSON="$1"

parse_field() {
  local field="$1"
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$field',''))" \
    <<< "$INPUT_JSON" 2>/dev/null || echo ""
}

SOURCE=$(parse_field source)
DESTINATION=$(parse_field destination)
```

`python3` is the preferred JSON parser because it is available on virtually all Linux systems without additional dependencies. Avoid requiring `jq` unless you know it will be present on all target agents.

### 5.2 Validating required fields

Exit non-zero with a descriptive message when required fields are missing:

```bash
if [ -z "$SOURCE" ] || [ -z "$DESTINATION" ]; then
  echo '{"success":false,"error":"source and destination are required"}' >&2
  exit 1
fi
```

This message appears in the monitor's stderr section and is surfaced to the workflow engine for the failed node.

### 5.3 Building the command

Construct the external command from parsed inputs, applying optional flags conditionally:

```bash
RSYNC_ARGS=()

# Core options (user-supplied flags string → array)
if [ -n "$OPTIONS" ]; then
  read -ra OPT_ARRAY <<< "$OPTIONS"
  RSYNC_ARGS+=("${OPT_ARRAY[@]}")
fi

# Optional SSH key
if [ -n "$SSH_KEY" ]; then
  RSYNC_ARGS+=("-e" "ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no")
fi

# Optional bandwidth cap
if [ -n "$BANDWIDTH" ] && [ "$BANDWIDTH" != "0" ]; then
  RSYNC_ARGS+=("--bwlimit=${BANDWIDTH}")
fi

RSYNC_ARGS+=("$SOURCE" "$DESTINATION")
```

### 5.4 Capturing output and exit code

Capture stdout and stderr together, then replay them so the monitor log is complete:

```bash
START_TS=$(date +%s)
RSYNC_OUTPUT=$(rsync "${RSYNC_ARGS[@]}" 2>&1)
EXIT_CODE=$?
END_TS=$(date +%s)
DURATION=$((END_TS - START_TS))

echo "$RSYNC_OUTPUT"
```

`EXIT_CODE` is preserved manually because `set -e` would abort the script on failure before you can emit the JSON summary.

### 5.5 Emitting a JSON summary

Any JSON object that appears in stdout is automatically detected by the engine (`output.format: auto`) and stored in the workflow context under the node's alias. Later nodes can reference individual fields using `#{nodes.<alias>.parsedOutput.<field>}`.

Emit the summary **after** the human-readable log output so it appears at the end of the monitor's log panel:

```bash
python3 - <<PYEOF
import json
result = {
    "success": $EXIT_CODE == 0,
    "exitCode": $EXIT_CODE,
    "source": "$SOURCE",
    "destination": "$DESTINATION",
    "durationSeconds": $DURATION,
    "filesTransferred": $FILES_TRANSFERRED
}
print(json.dumps(result))
PYEOF

exit $EXIT_CODE
```

Always `exit $EXIT_CODE` at the end. The engine uses the exit code to decide whether the node succeeded or failed — not the JSON content.

---

## 6. Output and Workflow Context

When the node completes, the engine stores its result under `nodeOutputs[alias]`:

```json
{
  "type": "plugin",
  "pluginName": "rsync",
  "exitCode": 0,
  "stdout": "...",
  "stderr": "",
  "parsedOutput": {
    "success": true,
    "exitCode": 0,
    "source": "/data/backups/",
    "destination": "user@nas:/vol1/",
    "durationSeconds": 14,
    "filesTransferred": 87
  },
  "status": "success"
}
```

A downstream node (e.g. a Notify) can reference this with `#{...}` template syntax:

```
Rsync completed in #{nodes.rsync_1.parsedOutput.durationSeconds}s —
#{nodes.rsync_1.parsedOutput.filesTransferred} files transferred.
```

The alias (`rsync_1` here) is assigned by the builder and shown in the node's properties panel. It can be changed by renaming the node.

---

## 7. The Icon

`icon.svg` is optional but recommended — it appears in the palette and on the canvas node.

Keep it simple: a single-colour or two-colour 24×24 viewBox SVG. Complex gradients and filters do not scale well at small sizes.

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
     width="24" height="24" fill="none"
     stroke="#1565C0" stroke-width="1.8"
     stroke-linecap="round" stroke-linejoin="round">
  <!-- ... -->
</svg>
```

If no icon is provided, the builder falls back to the generic `extension` Material Icon.

---

## 8. Hot Reload

The hub watches the `plugins/` directory with `fs.watch({ recursive: true })`. Changes to `plugin.yaml`, `icon.svg`, `.sh`, `.js`, or `.py` files trigger a registry rebuild after a 500 ms debounce. There is no need to restart the server while developing a plugin.

The rebuilt registry is served immediately on the next call to `GET /rest/orchestration/plugins`. Refreshing the builder page loads the updated plugin into the palette.

---

## 9. Complete rsync Example

### plugins/rsync/plugin.yaml

```yaml
name: rsync
label: Rsync
description: >
  Synchronise files between directories or hosts using rsync.

inputs:
  - name: source
    label: Source
    type: string
    required: true
    placeholder: "user@host:/path/  or  /local/path/"
    description: Source path. Trailing slash syncs contents; no slash syncs the directory itself.

  - name: destination
    label: Destination
    type: string
    required: true
    placeholder: "user@host:/path/dest/"

  - name: options
    label: Options
    type: string
    required: false
    default: "-avz"
    placeholder: "-avz --delete"

  - name: ssh_key
    label: SSH Key Path (optional)
    type: string
    required: false
    placeholder: "/home/user/.ssh/id_rsa"

  - name: bandwidth_limit
    label: Bandwidth Limit (KB/s, optional)
    type: number
    required: false
    placeholder: "0"
    description: 0 means unlimited.

command: ./run.sh
args:
  - "{{inputs_json}}"

output:
  format: auto
```

### plugins/rsync/run.sh

```bash
#!/usr/bin/env bash
set -euo pipefail

[ -z "${1:-}" ] && { echo '{"error":"No input JSON provided"}' >&2; exit 1; }

INPUT_JSON="$1"

parse_field() {
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$1',''))" \
    <<< "$INPUT_JSON" 2>/dev/null || echo ""
}

SOURCE=$(parse_field source)
DESTINATION=$(parse_field destination)
OPTIONS=$(parse_field options)
SSH_KEY=$(parse_field ssh_key)
BANDWIDTH=$(parse_field bandwidth_limit)

[ -z "$SOURCE" ] || [ -z "$DESTINATION" ] && {
  echo '{"success":false,"error":"source and destination are required"}' >&2
  exit 1
}

RSYNC_ARGS=()
[ -n "$OPTIONS" ] && { read -ra OPT_ARRAY <<< "$OPTIONS"; RSYNC_ARGS+=("${OPT_ARRAY[@]}"); }
[ -n "$SSH_KEY" ] && RSYNC_ARGS+=("-e" "ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no")
[ -n "$BANDWIDTH" ] && [ "$BANDWIDTH" != "0" ] && RSYNC_ARGS+=("--bwlimit=${BANDWIDTH}")
RSYNC_ARGS+=("$SOURCE" "$DESTINATION")

echo "[rsync] Running: rsync ${RSYNC_ARGS[*]}"

START_TS=$(date +%s)
RSYNC_OUTPUT=$(rsync "${RSYNC_ARGS[@]}" 2>&1)
EXIT_CODE=$?
DURATION=$(( $(date +%s) - START_TS ))
FILES_TRANSFERRED=$(echo "$RSYNC_OUTPUT" | grep -c '^[^/]*/' 2>/dev/null || echo 0)

echo "$RSYNC_OUTPUT"

python3 - <<PYEOF
import json
print(json.dumps({
    "success": $EXIT_CODE == 0,
    "exitCode": $EXIT_CODE,
    "source": "$SOURCE",
    "destination": "$DESTINATION",
    "durationSeconds": $DURATION,
    "filesTransferred": $FILES_TRANSFERRED
}))
PYEOF

exit $EXIT_CODE
```

---

## 10. The Official Plugin Registry

Community plugins are published in a dedicated GitHub repository:

**[https://github.com/dpembo/orchelium-plugins](https://github.com/dpembo/orchelium-plugins)**

### Repository layout

```
orchelium-plugins/
  registry.json        ← master index fetched by the Plugin Manager
  borg/
    plugin.yaml
    run.sh
    icon.svg
    docs.md
    examples/
      examples.yaml
  restic/
    ...
  rsync/
    ...
  (one folder per plugin)
```

### registry.json

Every plugin in the repository is listed in `registry.json`. The hub fetches this file when the Plugin Manager page loads to populate the catalogue.

```json
{
  "registryVersion": "1",
  "updated": "2026-05-17",
  "source": "https://github.com/dpembo/orchelium-plugins",
  "plugins": [
    {
      "name": "rsync",
      "label": "Rsync",
      "description": "Synchronise files between directories or hosts using rsync.",
      "version": "1.0.0",
      "category": "file-sync",
      "tags": ["rsync", "file-sync", "backup"],
      "official": true,
      "path": "rsync",
      "minOrcheliumVersion": "1.0.0"
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `name` | Unique machine identifier. Must match the folder name. |
| `label` | Human-readable name shown in the Plugin Manager. |
| `description` | Short description for the plugin card. |
| `version` | Semver version string. Bump this whenever `plugin.yaml` or `run.sh` changes. |
| `category` | One of: `backup`, `containers`, `databases`, `file-sync`, `storage`, `system`. |
| `tags` | Array of search keywords. |
| `official` | `true` for plugins in this repository. |
| `path` | Path within the repo to the plugin folder (usually just the folder name). |
| `minOrcheliumVersion` | Minimum hub version required. |

### Contributing a plugin

1. Fork `dpembo/orchelium-plugins`.
2. Create a folder named after your plugin (lowercase, hyphens, no spaces).
3. Add `plugin.yaml`, `run.sh` (executable), `icon.svg`, `docs.md`, and `examples/examples.yaml`.
4. Add an entry to `registry.json`.
5. Open a pull request. The plugin will be reviewed for:
   - Correct schema and field types
   - `run.sh` exits with `0` on success and non-zero on failure
   - JSON summary emitted to stdout where useful
   - No hard-coded credentials or unsafe shell patterns
   - `chmod +x` on `run.sh`

### Installing custom plugins (without the registry)

Drop a plugin folder directly into `plugins/` on your hub server. The hub watches that directory with `fs.watch` and hot-reloads within 500 ms — no restart needed. This is the fastest workflow when developing a new plugin locally.

---

## 11. Checklist

Before submitting or deploying a plugin:

- [ ] `plugin.yaml` passes validation (start the server and check logs for `[PLUGINS]` warnings)
- [ ] All required inputs are marked `required: true`
- [ ] The command script is executable (`chmod +x run.sh`)
- [ ] The script exits with `0` on success and non-zero on failure
- [ ] A JSON summary is emitted on stdout if downstream nodes need to reference output
- [ ] `icon.svg` is provided (optional but strongly recommended)
- [ ] `docs.md` describes inputs, expected behaviour, and any system requirements
- [ ] The plugin folder name matches the `name` field in `plugin.yaml`
