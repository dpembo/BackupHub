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

---

## External Plugin Repositories

In addition to the official registry, plugins can be sourced from any public GitHub repository. This allows community maintainers, teams, or third parties to publish and distribute their own plugins without contributing to the official repo.

### How it works

Each entry in a `registry.json` file can include a `repository_url` field pointing to the GitHub repository that hosts its plugin files:

```json
{
  "name": "my-plugin",
  "label": "My Plugin",
  "path": "my-plugin",
  "repository_url": "https://github.com/someuser/their-plugins",
  ...
}
```

When installing a plugin, the hub resolves the source repository in the following priority order:

| Priority | Source |
|----------|--------|
| 1 | `githubApiBase` field on the registry entry (explicit API URL override) |
| 2 | `repository_url` field on the registry entry (standard GitHub URL, auto-converted) |
| 3 | Global `githubApiBase` in hub config |
| 4 | Built-in default (the official orchelium-plugins repo) |

This means a third-party registry entry only needs a valid `repository_url` — no other configuration is required on the hub.

### Adding an external registry

To point the hub at an external `registry.json`, update your hub configuration with the URL of the external registry file:

```json
{
  "url": "https://raw.githubusercontent.com/someuser/their-plugins/main/registry.json"
}
```

The external registry must follow the same schema as the official one — a JSON object with a `plugins` array. Each entry should include a `repository_url` pointing to the GitHub repository where its plugin files live, so the hub knows where to download them from.

### External registry schema

A minimal valid external registry looks like this:

```json
{
  "registryVersion": "1",
  "plugins": [
    {
      "name": "my-plugin",
      "label": "My Plugin",
      "description": "Does something useful.",
      "version": "1.0.0",
      "category": "tools",
      "tags": ["example"],
      "path": "my-plugin",
      "repository_url": "https://github.com/someuser/their-plugins"
    }
  ]
}
```

The `path` field is the folder name within the repository that contains the plugin files. The `repository_url` must be a standard `https://github.com/owner/repo` URL — the hub derives the GitHub API endpoint from it automatically.

### Authentication

The hub uses a single GitHub token (set in your hub config as `githubToken`) for all registry and download requests. If the external repository is private, that token must have read access to it. Separate tokens per repository are not currently supported.

### Security considerations

> **External plugins carry the same risks as any third-party code.** Before adding an external registry or installing a plugin from it, review the source repository and satisfy yourself that the plugin scripts are safe to run on your agents. Orchelium cannot verify the integrity or intent of plugins hosted outside the official repository.

---

## Community Plugins

Community plugins are discovered automatically by searching GitHub for public repositories that follow the naming convention `orchelium-plugin-community-<name>`. No registry file or manual configuration is needed — publishing a correctly named repo is enough to make a plugin discoverable.

### Repository structure

A community plugin repository must contain a `plugin.yaml` at its root, using the same schema as official plugins:

```
orchelium-plugin-community-rsnapshot/   ← the repo itself
  plugin.yaml       ← declarative definition (inputs, command, output)
  run.sh            ← shell script executed on the agent
  icon.svg          ← icon shown in the builder palette and Plugin Manager
  docs.md           ← documentation shown when clicking the card
  examples/
    examples.yaml   ← sample input configurations
```

The full repository name (e.g. `orchelium-plugin-community-rsnapshot`) is used as both the plugin name and its local directory under `plugins/` when installed, making community plugins immediately identifiable on the file system.

### How discovery works

When the Plugin Manager loads the community plugins tab, the hub:

1. Searches GitHub for public repositories whose names start with `orchelium-plugin-community-`
2. Fetches `plugin.yaml` from the `main` branch of each matched repo
3. Builds a registry-compatible entry from the YAML metadata and GitHub repo info (including star count and last updated date)
4. Returns the results sorted by stars

Repos that are unreachable or lack a valid `plugin.yaml` are silently skipped and do not affect the rest of the results.

### Discovery cache

Discovery results are cached to disk at `plugins/.community-cache.json` and reused for **1 hour** before the hub re-queries GitHub. This keeps the Plugin Manager fast and avoids unnecessary API requests.

The cache is refreshed automatically when it expires. You can also force an immediate refresh using the **Refresh** button in the community plugins tab — this bypasses the cache and fetches live results from GitHub.

The cache file stores the timestamp of the last fetch, which the Plugin Manager displays as "Last updated X minutes ago" alongside the Refresh button.

### Installing a community plugin

Installing a community plugin works identically to an official plugin — click **Install** on the card. The hub downloads all files from the root of the plugin's repository into `plugins/orchelium-plugin-community-<name>/` on the hub server and makes it immediately available in the Orchestration builder.

### Publishing a community plugin

To publish a community plugin:

1. Create a public GitHub repository named `orchelium-plugin-community-<name>` (e.g. `orchelium-plugin-community-rsnapshot`)
2. Add a `plugin.yaml`, `run.sh`, and optionally `icon.svg`, `docs.md`, and `examples/examples.yaml` at the repository root
3. Push to the `main` branch

The plugin will appear in the Orchelium community plugins list the next time discovery runs (within 1 hour, or immediately after a manual refresh).

> **Security notice:** Community plugins are not reviewed or endorsed by Orchelium. They execute shell scripts on your connected agents. Only install community plugins from authors you trust, and review the source code before installing in sensitive environments.