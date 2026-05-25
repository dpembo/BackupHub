/**
 * Plugin Manager
 * Handles fetching the remote plugin registry, installing plugins from GitHub,
 * and uninstalling plugins by removing their local directory.
 *
 * Install flow:
 *   1. fetchRemoteRegistry() → downloads registry.json from GitHub raw URL
 *   2. installPlugin(name, entry, config) → uses GitHub Contents API to
 *      recursively download the plugin folder into plugins/<name>/
 *   3. pluginRegistry.js hot-reload detects the new directory automatically
 *
 * Uninstall flow:
 *   1. uninstallPlugin(name) → removes plugins/<name>/ directory
 *   2. pluginRegistry.js hot-reload detects the removal automatically
 */

'use strict';

const axios      = require('axios');
const path       = require('path');
const fsPromises = require('fs').promises;

const { PLUGINS_DIR } = require('./pluginRegistry');

// Plugin names must be lowercase alphanumeric with hyphens, no path separators
const PLUGIN_NAME_REGEX = /^[a-z0-9][a-z0-9-]*$/;

const DEFAULT_REGISTRY_URL    = 'https://raw.githubusercontent.com/dpembo/orchelium-plugins/main/registry.json';
const DEFAULT_GITHUB_API_BASE = 'https://api.github.com/repos/dpembo/orchelium-plugins';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildHeaders(githubToken) {
  const headers = {
    'User-Agent': 'orchelium-plugin-manager/1.0',
    'Accept':     'application/vnd.github.v3+json',
  };
  if (githubToken) {
    headers['Authorization'] = `token ${githubToken}`;
  }
  return headers;
}

function resolveConfig(config) {
  const cfg = config || {};
  return {
    registryUrl:    cfg.url            || DEFAULT_REGISTRY_URL,
    githubApiBase:  cfg.githubApiBase  || DEFAULT_GITHUB_API_BASE,
    githubToken:    cfg.githubToken    || null,
  };
}

function validatePluginName(name) {
  if (!name || typeof name !== 'string' || !PLUGIN_NAME_REGEX.test(name)) {
    throw new Error(`Invalid plugin name '${name}'. Names must match [a-z0-9][a-z0-9-]*.`);
  }
}

function safePluginPath(name) {
  validatePluginName(name);
  const resolved = path.resolve(PLUGINS_DIR, name);
  if (!resolved.startsWith(path.resolve(PLUGINS_DIR))) {
    throw new Error('Plugin path traversal detected');
  }
  return resolved;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * Fetch the remote registry.json from GitHub.
 * @param {object} [config] - { url, githubApiBase, githubToken }
 * @returns {object} Parsed registry object
 */
async function fetchRemoteRegistry(config) {
  const { registryUrl, githubToken } = resolveConfig(config);

  const response = await axios.get(registryUrl, {
    headers: buildHeaders(githubToken),
    timeout: 15000,
  });

  const data = response.data;
  if (!data || !Array.isArray(data.plugins)) {
    throw new Error('Remote registry is malformed — expected { plugins: [...] }');
  }

  return data;
}

// ─── Install ──────────────────────────────────────────────────────────────────

/**
 * Recursively download a directory from the GitHub Contents API.
 * @param {string} apiBase  - e.g. https://api.github.com/repos/owner/repo
 * @param {string} dirPath  - path inside the repo, e.g. "rsync"
 * @param {string} destDir  - absolute local destination directory
 * @param {object} headers  - HTTP headers including optional Authorization
 */
async function downloadDirectory(apiBase, dirPath, destDir, headers) {
  const url      = `${apiBase}/contents/${encodeURIComponent(dirPath).replace(/%2F/g, '/')}`;
  const response = await axios.get(url, { headers, timeout: 20000 });
  const entries  = response.data;

  if (!Array.isArray(entries)) {
    throw new Error(`Unexpected response from GitHub Contents API for path: ${dirPath}`);
  }

  for (const entry of entries) {
    // Guard against unexpected entry names that could escape the dest directory
    if (!entry.name || entry.name.includes('/') || entry.name.includes('\\') || entry.name === '..' || entry.name === '.') {
      continue;
    }

    const destPath = path.join(destDir, entry.name);

    // Extra traversal check — should never fire given the name check above
    if (!path.resolve(destPath).startsWith(path.resolve(destDir))) {
      continue;
    }

    if (entry.type === 'file') {
      if (!entry.content) {
        // Content may be absent for large files — fetch individually
        const fileResp = await axios.get(entry.url, { headers, timeout: 20000 });
        const raw = Buffer.from(fileResp.data.content, 'base64');
        await fsPromises.writeFile(destPath, raw);
      } else {
        const raw = Buffer.from(entry.content, 'base64');
        await fsPromises.writeFile(destPath, raw);
      }

      if (entry.name.endsWith('.sh')) {
        await fsPromises.chmod(destPath, 0o755);
      }
    } else if (entry.type === 'dir') {
      await fsPromises.mkdir(destPath, { recursive: true });
      await downloadDirectory(apiBase, entry.path, destPath, headers);
    }
  }
}

/**
 * Install a plugin by downloading its files from the GitHub Contents API.
 *
 * @param {string} pluginName   - validated plugin name, e.g. "rsync"
 * @param {object} registryEntry - entry from registry.json (must include `path`)
 * @param {object} [config]     - { githubApiBase, githubToken }
 */
async function installPlugin(pluginName, registryEntry, config) {
  validatePluginName(pluginName);

  if (!registryEntry || !registryEntry.path) {
    throw new Error('registryEntry must include a `path` field');
  }

  // Sanitise the repo path — must not contain traversal sequences
  const repoPath = registryEntry.path.replace(/\.\./g, '').replace(/^\/+/, '');

  const destDir = safePluginPath(pluginName);
  const { githubApiBase, githubToken } = resolveConfig(config);
  const headers = buildHeaders(githubToken);

  // Create destination directory
  await fsPromises.mkdir(destDir, { recursive: true });

  try {
    await downloadDirectory(githubApiBase, repoPath, destDir, headers);
  } catch (err) {
    // Clean up partially downloaded directory on failure
    await fsPromises.rm(destDir, { recursive: true, force: true }).catch(() => {});
    // Check for GitHub API rate limit error
    if (err.response && err.response.status === 403) {
      const data = err.response.data;
      const headers = err.response.headers || {};
      let message = '';
      // GitHub REST API v3 returns a message in the body
      if (data && typeof data.message === 'string' && data.message.match(/rate limit/i)) {
        message = data.message;
      }
      // X-RateLimit-Reset is a UNIX timestamp (seconds)
      const reset = headers['x-ratelimit-reset'];
      if (reset) {
        const resetDate = new Date(parseInt(reset, 10) * 1000);
        const now = new Date();
        const waitMins = Math.ceil((resetDate - now) / 60000);
        message += `\nYou can retry after: ${resetDate.toLocaleString()} (${waitMins} min)`;
      }
      if (message) {
        const userError = new Error(`GitHub API rate limit exceeded. ${message}`);
        userError.code = 'GITHUB_RATE_LIMIT';
        throw userError;
      }
    }
    throw err;
  }
}

// ─── Uninstall ────────────────────────────────────────────────────────────────

/**
 * Uninstall a plugin by removing its directory from plugins/.
 *
 * @param {string} pluginName - validated plugin name
 */
async function uninstallPlugin(pluginName) {
  validatePluginName(pluginName);

  const pluginDir = safePluginPath(pluginName);

  try {
    await fsPromises.access(pluginDir);
  } catch {
    throw new Error(`Plugin '${pluginName}' is not installed`);
  }

  await fsPromises.rm(pluginDir, { recursive: true });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  fetchRemoteRegistry,
  installPlugin,
  uninstallPlugin,
};
