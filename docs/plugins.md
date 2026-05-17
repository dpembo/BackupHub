# Plugin Manager

The Plugin Manager lets you browse, install, update, and remove plugins that add new node types to the [Orchestration builder](orchestrations.md). Plugins are shell scripts with a declarative YAML definition — they run on your connected agents and produce structured output that the workflow engine can use.

---

## Opening the Plugin Manager

Navigate to **Plugins** in the main menu. The page loads the official plugin registry from GitHub and compares it against the plugins already installed on your hub.

---

## Browsing Plugins

### Sidebar filters

The left sidebar lets you narrow the list:

| Filter | Shows |
|--------|-------|
| **All Plugins** | Every plugin in the registry |
| **Installed** | Plugins already on this hub |
| **Updates** | Installed plugins with a newer version available |
| **Not Installed** | Plugins available to install |
| *(category)* | Plugins in a specific category (Backup, Databases, etc.) |

### Search

Type in the search box to filter by name, description, or tag. The filter combines with the active sidebar selection.

### Plugin cards

Each card shows:
- Plugin icon, name, and version
- Short description
- Tags
- Install / Update / Uninstall action button
- A green **Installed** or orange **Update** badge if relevant

Clicking the body of a card (when documentation is available) opens the plugin's docs page in a new tab.

---

## Installing a Plugin

1. Find the plugin you want using the filters or search.
2. Click **Install** on the card.
3. The hub downloads the plugin files from the official repository, validates them, and places them under `plugins/` on the hub server.
4. A confirmation toast appears. The plugin is immediately available as a node type in the Orchestration builder — no restart required.

> **Security notice:** Plugins execute shell scripts on your connected agents. Only install plugins from sources you trust. Review plugin source files before installing in sensitive environments.

---

## Updating a Plugin

When a newer version of an installed plugin is available, the card shows an **Update** badge and an **Update** button. Click it to download and replace the current version. Any orchestrations using the plugin continue working after the update (input fields and output keys are backwards-compatible within minor versions).

---

## Uninstalling a Plugin

Click the **Uninstall** (bin icon) button on any installed plugin card. A confirmation modal appears before the files are removed. Orchestrations that reference an uninstalled plugin will fail when executed.

---

## Plugin Categories

| Category | Description |
|----------|-------------|
| **Backup** | Backup tools — Restic, Borg, rsync, tar, Bitwarden export, etc. |
| **Containers** | Docker and LXC container management |
| **Databases** | Database backup and restore — MySQL, PostgreSQL, SQLite |
| **File Sync** | File synchronisation tools — rclone, S3 |
| **Storage** | Storage management — ZFS snapshots, ZFS send/receive, TrueNAS, mount |
| **System** | System utilities — systemd service control, Wake-on-LAN |

---

## The Official Plugin Registry

Plugins are published in the **orchelium-plugins** GitHub repository:

**[https://github.com/dpembo/orchelium-plugins](https://github.com/dpembo/orchelium-plugins)**

The repository contains one folder per plugin, each with:

```
plugin-name/
  plugin.yaml       ← declarative definition (inputs, command, output)
  run.sh            ← shell script executed on the agent
  icon.svg          ← icon shown in the builder palette and Plugin Manager
  docs.md           ← documentation shown when clicking the card
  examples/
    examples.yaml   ← sample input configurations
```

The hub fetches `registry.json` from this repo to populate the Plugin Manager. The file lists all available plugins with their name, label, description, version, category, and tags.

### Requesting new plugins

Open an issue on the orchelium-plugins repository to request a plugin that isn't in the registry. Include the tool name, what it should do, and any relevant flags or options.

### Writing your own plugins

See the [Plugin Developer Guide](Developers/Engine_Updates/PLUGIN_DEVELOPER_GUIDE.md) for a full walkthrough, or the [Plugin Specification](Developers/Engine_Updates/PLUGIN_SPEC.md) for the schema reference.

Custom plugins can be placed directly in the `plugins/` directory on your hub server without going through the Plugin Manager — the hub hot-reloads them automatically.
