
![Orchelium Logo](./public/images/orchelium-light.png)

# Orcheliuim


![GitHub Repo stars](https://img.shields.io/github/stars/dpembo/orchelium?style=flat)

![GitHub License](https://img.shields.io/github/license/dpembo/orchelium)

![GitHub Issues](https://img.shields.io/github/issues/dpembo/orchelium)

*A lightweight automation and orchestration platform for home labs, NAS devices, and small server fleets.*

Orchelium started as a simple backup scheduler. It has since evolved into a distributed automation engine with real‑time orchestration, multi‑agent execution, and a clean web UI for managing scripts, workflows, and triggers across your entire environment.

Whether you're running a Proxmox cluster, a handful of Linux servers, or a mixed home‑lab setup, Orchelium gives you a central place to automate, monitor, and coordinate your tasks.

---

## 📘 Table of Contents
- Key Features
- Quick Start
- Documentation
- Roadmap
- Contributing
- Support
- License

---

## ⭐ Key Features

### 🧠 Orchestrations (Visual Automation Engine)
Design multi‑step workflows using a visual node editor:
- Parallel or sequential execution
- Conditional logic
- Branching flows
- Real‑time step‑by‑step monitoring
- Live log streaming from every node

Perfect for complex backup pipelines, maintenance routines, or multi‑server tasks.

---

### ⏱ Advanced Scheduler
Trigger jobs using:
- Cron‑style schedules
- Threshold rules (CPU, disk, memory)
- Webhooks
- Agent online/offline events

This turns Orchelium into a general automation platform, not just a backup runner.

---

### 🖥 Modern Agent System
Lightweight agents run on any Linux machine and support:
- Encrypted communication
- WebSocket or MQTT transport
- Real‑time status reporting
- Live log streaming
- Automatic reconnect and heartbeat

Agents are simple to deploy and require minimal configuration.

---

### ⚡ Real‑Time Web UI
The interface updates instantly:
- Watch orchestrations run live
- View job logs as they stream
- Track agent status and metrics
- Manage scripts, schedules, and webhooks

It feels like a modern automation dashboard — because it is.

---

### 📦 Script Templates & Library
Orchelium includes (but not limited to) ready‑to‑use templates for:
- Proxmox VM backups
- Rsync jobs
- MySQL/MariaDB dumps
- File pruning
- Threshold checks
- System maintenance tasks

You can also create and store your own reusable scripts, and host your oewn template servder

---

### 🔌 Webhooks & Integrations
Trigger jobs or orchestrations from:
- Home Assistant
- GitHub Actions
- Proxmox hooks
- Monitoring systems
- Any service that can send an HTTP request

Orchelium also exposes REST endpoints for external control.

---

### 🗄 Structured Data Layer
Powered by LevelDB with dedicated stores for:
- Core configuration
- Agents
- Job history
- User accounts
- Metrics

Fast, reliable, and easy to back up.

---

## 🚀 Quick Start

### Run the Hub
``docker run -p 8082:8082 ghcr.io/dpembo/orchelium/hub
``

Then open your browser at:
``
http://localhost:8082
``

---

### Install an Agent
From the UI, generate an agent registration command, then run it on any Linux machine.

Agents automatically:
- Register with the Hub
- Authenticate using shared secrets
- Stream logs and status
- Execute jobs and orchestrations

---

## 📚 Documentation
User documentation is available here:
https://github.com/dpembo/orchelium/blob/main/docs/README.MD

Full documentation is available at:

https://deepwiki.com/dpembo/orchleium

This includes:
- Architecture overview
- Orchestration examples
- Agent deployment
- Script templates
- API reference
- Troubleshooting

---

## 🛠 Roadmap
Planned features include:
- Plugin system for custom nodes
- Windows agent
- Extended Metrics dashboard
- Multi‑Hub federation
- Orchelium Cloud relay mode

---

## 🤝 Contributing
Contributions are welcome!
Whether it’s bug reports, feature ideas, or pull requests — everything helps.

---

## ⭐ Support the Project
If Orchelium is useful to you:
- Star the repo
- Share it with your home‑lab friends
- Open issues with ideas or feedback

---



## License
This project is licensed under the MIT License. See the [LICENSE](https://github.com/dpembo/orchelium/blob/main/LICENSE) file for details.


## Support
For issues or feature requests, open an issue on [GitHub Issues](https://github.com/dpembo/orchelium/issues).
For general inquiries, please use GitHub Discussions or open an issue.
