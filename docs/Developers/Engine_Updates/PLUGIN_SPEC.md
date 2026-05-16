# Orchelium Plugin Specification

Plugins extend Orchelium by defining new nodes for use in workflows.  
Plugins are hub‑based, declarative, multi‑file, and hot‑reloadable.

---

## 1. Plugin Folder Structure

A plugin is a folder:

```
plugin-name/
plugin.yaml
icon.svg
command.sh (optional)
parse.yaml (optional)
docs.md (optional)
examples/ (optional)
```

Only `plugin.yaml` is required.

---

## 2. plugin.yaml Schema

```yaml
name: restic-backup
label: Restic Backup
description: Run a Restic backup with common options.

inputs:
  - name: repo
    label: Repository
    type: string
    required: true

  - name: password_file
    label: Password File
    type: secret
    required: true

  - name: paths
    label: Paths to back up
    type: list
    item_type: path
    required: true

template: | #optional
  restic backup {{paths}} --repo {{repo}} --password-file {{password_file}} 
  
command: ./run.sh   # optional
args:
  - "{{inputs_json}}"   # optional

output:
  format: auto   # auto-detect JSON or plain text

```

---

## 3. Field Types

Supported field types:

* string
* secret
* number
* boolean
* select (with options)
* list (with item_type)
* path
* json

The UI is auto‑generated from these definitions.

---

## 4. Command Templates

Templates support variable substitution only:

````restic backup {{paths}} --repo {{repo}}```

No loops, no conditionals, no logic.

## 5. Helper Scripts (Optional)

If complexity is required, plugins may  use a script rather than a template command:

```yaml
command: ./run.sh
args:
  - "{{inputs_json}}"
```

Scripts may receive:

* Environment variables
* CLI arguments
* JSON blobs

Scripts must output:

* stdout
* stderr
* exit code

---

## 6. Output Handling

Plugins do not define branching or orchestration logic.

Node output may be:

### 6.1 Plain Text

Parsed via regex or line matching.

### 6.2 JSON

If stdout contains JSON:

* It is parsed
* Stored in workflow context
* Available to later nodes

### 6.3 Mixed Output

* JSON blocks inside logs are detected automatically.

## 7. Hot Reloading

Plugins are hot‑reloaded when:

* Files change
* Plugins are added
* Plugins are removed

The hub rebuilds the plugin registry atomically.

---

## 8. Plugin Responsibilities

Plugins define:

* Inputs
* One of either Template or script
* Optional parsing hints
* Icons
* Documentation

Plugins do not define:

* UI code
* Branching logic
* Workflow state
* Agent behavior

---

## 9. Best Practices

* Keep templates simple
* Use scripts rather than templates for complexity
* Prefer JSON output for structured data
* Provide examples in examples/
* Document flags and behavior in docs.md