# Orchelium Architecture

Orchelium is a centralized, unified backup orchestrator for home labs, designed around a hub‑and‑agent model. Its primary purpose is to orchestrate backups across Proxmox nodes, NAS servers, ZFS datasets, containers, and common backup tools (Restic, Borg, Rsync, Rclone, etc.).

---

## 1. High‑Level Overview

### 1.1 Hub
The hub is the control plane. It is responsible for:

- Storing and loading plugins
- Generating commands from templates
- Rendering UI for plugin‑defined nodes
- Executing orchestration logic
- Managing workflow context
- Parsing node output
- Sending commands to agents
- Receiving logs and results

The hub contains all intelligence.

### 1.2 Agent
The agent is intentionally lightweight and dumb. It:

- Receives commands from the hub
- Executes them in a shell
- Streams stdout/stderr
- Returns exit codes

Agents do not load plugins, templates, or logic.

---

## 2. Plugin System

Plugins are:

- Hub‑based  
- Declarative  
- Multi‑file  
- Hot‑reloadable  

A plugin defines:

- Node metadata
- Input fields
- Command templates
- Optional helper scripts
- Optional parsing hints
- Icons, docs, examples

Plugins do not contain UI code or orchestration logic.

---

## 3. Node Execution Model

Each node produces:

- stdout (string, JSON, xml, csv, Any text format!)
- stderr
- exit code

This is the only contract.

### 3.1 Command Generation
Commands are generated using simple variable substitution (Mustache‑style).  
No loops, no conditionals, no DSL.

### 3.2 Complex Logic
If needed, plugins may include a helper script.  
Scripts are injected by the hub and executed by the agent.

Scripts may receive:

- Environment variables
- Command‑line arguments
- JSON blobs

---

## 4. Orchestration Engine

The orchestration engine supports:

- Sequential execution
- Conditional branching
- Success/failure paths

Plugins do not implement branching.

### 4.1 Workflow Context (Future)
A persistent context object will store:

- Parsed output from nodes
- User‑defined variables
- Structured JSON
- Data for dashboards

---

## 5. Output Handling

The hub supports:

### 5.1 Plain Text
- Regex
- Line matching
- Exit code

### 5.2 JSON Output
If stdout contains JSON:

- It is parsed
- Stored in workflow context
- Available to later nodes
- Available to dashboards

### 5.3 Mixed Output
JSON blocks inside logs are detected automatically.

---

## 6. Agent Requirements

Agents must remain:

- Stateless
- Dependency‑free
- Plugin‑agnostic
- Lightweight
- Universal

Agents never require restarts for plugin changes.

---

## 7. Official Plugin Packs (Roadmap)

### Backup Essentials
- Restic Backup
- Restic Check
- Borg Create
- Borg Prune
- Rsync Copy
- Rclone Sync

### Proxmox Pack
- VM Snapshot
- VM Backup

### ZFS Pack
- Snapshot
- Send/Recv

### Notifications
- Discord
- Telegram
- Email

---

## 8. Design Principles

- Keep agents dumb
- Keep plugins declarative
- Keep templates simple
- Keep orchestration logic in the hub
- Keep UI auto‑generated
- Keep complexity optional via scripts

This architecture ensures Orchelium remains scalable, maintainable, and ideal for home‑lab backup orchestration.
