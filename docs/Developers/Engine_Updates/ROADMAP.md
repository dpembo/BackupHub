# 📄 **3. ROADMAP.md**

```markdown
# Orchelium Roadmap

This roadmap outlines the planned evolution of Orchelium as the definitive home‑lab backup orchestrator.

---

## Phase 1 — Plugin Framework (MVP)

### Core Deliverables
- Multi‑file plugin system
- Declarative plugin schema
- Hot‑reload support
- Simple templating engine
- Helper script support
- Auto‑generated UI for plugin fields
- Basic output parsing (regex + JSON detection)
- Hub‑based plugin registry

### Official Plugins (MVP)
- Restic Backup
- Restic Check
- Borg Create
- Borg Prune
- Rsync Copy
- Rclone Sync
- ZFS Snapshot
- ZFS Send/Recv
- Proxmox VM Snapshot
- Proxmox VM Backup
- Notification Node (Discord/Telegram/Email)

---

## Phase 2 — Orchestration Enhancements

### Features
- Workflow context object
- Persistent variables
- JSON‑aware branching
- Output referencing in later nodes
- Improved error handling
- Retry logic

### UI Enhancements
- Node output inspector
- Context viewer
- Workflow debugger

---

## Phase 3 — Backup Health Dashboard

### Features
- Backup history
- Verification history
- Retention metrics
- Backup size tracking
- Duration tracking
- Failure analytics
- Per‑node health status

### Integrations
- Proxmox backup metrics
- ZFS health
- Restic stats
- Borg stats

---

## Phase 4 — Plugin Ecosystem

### Features
- Plugin registry
- One‑click install
- Versioning
- Plugin signing
- Community plugin packs

### Community Targets
- Synology DSM
- TrueNAS
- Unraid
- Backblaze B2
- Cloudflare R2
- S3 / Wasabi / MinIO
- Database backup nodes

---

## Phase 5 — Advanced Automation

### Features
- Scheduled maintenance workflows
- System checks
- Cleanup tasks
- Container/LXC backup nodes
- Docker volume backup nodes

---

## Vision

Orchelium becomes the Home Assistant of home‑lab backups:

- A plugin ecosystem
- A unified dashboard
- A powerful orchestration engine
- A simple, declarative plugin model
- A lightweight agent model

The long‑term goal is a thriving community and a stable, extensible platform.
