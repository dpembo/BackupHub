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
 *
 * External repository support:
 *   Registry entries may include a `repository_url` (standard github.com URL)
 *   or an explicit `githubApiBase` field to source plugins from a different
 *   GitHub repository than the default. The entry-level values take priority
 *   over the global config, allowing community or third-party registries to
 *   serve plugins from their own repos without any extra configuration.
 *
 * Community plugin discovery:
 *   discoverCommunityPlugins() searches GitHub for public repositories whose
 *   names match the pattern "orchelium-plugin-community-<name>". Each matching
 *   repo is expected to contain a plugin.yaml at its root, which is fetched and
 *   parsed to produce a registry-compatible entry. Repos that are unreachable or
 *   lack a valid plugin.yaml are skipped and reported in the `errors` array.
 *
 *   Results are cached to disk at plugins/.community-cache.json and reused for
 *   up to COMMUNITY_CACHE_TTL_MS milliseconds (default: 1 hour) to avoid
 *   hammering the GitHub API on every page load. Pass { forceRefresh: true } to
 *   bust the cache explicitly (e.g. from a UI "Refresh" button).
 *
 *   Install flow for community plugins is identical to standard plugins — the
 *   full repo name (e.g. "orchelium-plugin-community-rsnapshot") is used as
 *   both the plugin name and the local directory name under plugins/, making
 *   community plugins immediately identifiable on the file system.
 */

'use strict';

const axios      = require('axios');
const path       = require('path');
const fsPromises = require('fs').promises;
const yaml       = require('js-yaml');

const { PLUGINS_DIR } = require('./pluginRegistry');

// Plugin names must be lowercase alphanumeric with hyphens, no path separators
const PLUGIN_NAME_REGEX = /^[a-z0-9][a-z0-9-]*$/;

const COMMUNITY_REPO_PREFIX   = 'orchelium-plugin-community-';
const GITHUB_SEARCH_API       = 'https://api.github.com/search/repositories';
const GITHUB_RAW_BASE         = 'https://raw.githubusercontent.com';

const DEFAULT_REGISTRY_URL    = 'https://raw.githubusercontent.com/dpembo/orchelium-plugins/main/registry.json';
const DEFAULT_GITHUB_API_BASE = 'https://api.github.com/repos/dpembo/orchelium-plugins';

// Community plugin discovery cache
const COMMUNITY_CACHE_TTL_MS  = 60 * 60 * 1000; // 1 hour
const COMMUNITY_CACHE_FILE    = path.join(PLUGINS_DIR, '.community-cache.json');
const SVG_MAX_BYTES = 50 * 1024; // 50 KB — generous for any reasonable icon
// ─── Helpers ──────────────────────────────────────────────────────────────────
//------------------------------------------------------------------


/**
 * Fetch an SVG icon from a GitHub raw URL, validate it is safe, and return
 * the sanitised SVG string. Returns null if missing, too large, or unsafe.
 *
 * Safety checks:
 *   - Content-Type must start with image/svg or text/ (GitHub serves SVG as text/plain)
 *   - Must begin with <svg (after stripping whitespace/BOM)
 *   - Strips XML declarations and DOCTYPE to prevent XXE
 *   - Removes any <script> tags and on* event attributes
 *   - Removes <foreignObject>, <use href>, and xlink:href to block injection
 *   - Size capped at SVG_MAX_BYTES before parsing
 */
async function fetchAndSanitiseSvg(url, headers) {
  try {
    logger.info(`[PLUGIN MANAGER] Fetching icon from: ${url}`);
    const response = await axios.get(url, {
      headers,
      timeout: 8000,
      maxContentLength: SVG_MAX_BYTES,
      responseType: 'text',
      validateStatus: s => s === 200,
    });

    logger.info(`[PLUGIN MANAGER] Icon fetch status: ${response.status}, content-type: ${response.headers['content-type']}`);
    const raw = typeof response.data === 'string' ? response.data : String(response.data);
    logger.info(`[PLUGIN MANAGER] Icon raw length: ${raw.length}, first 100 chars: ${raw.substring(0, 100)}`);

    // Must look like SVG after stripping leading whitespace/BOM
    const trimmed = raw.replace(/^\uFEFF/, '').trimStart();
    if (!trimmed.startsWith('<svg') && !trimmed.startsWith('<?xml')) {
      logger.warn(`[PLUGIN MANAGER] Icon rejected — does not start with <svg or <?xml`);
      return null;
    }

    // Strip XML declaration and DOCTYPE entirely
    let svg = trimmed
      .replace(/<\?xml[^>]*\?>/gi, '')
      .replace(/<!DOCTYPE[^>[]*(?:\[[^\]]*\])?\s*>/gi, '')
      .trimStart();

    // Must start with <svg after stripping declarations
    if (!svg.toLowerCase().startsWith('<svg')) {
      return null;
    }

    // Remove <script> blocks (including content)
    svg = svg.replace(/<script[\s\S]*?<\/script>/gi, '');

    // Remove <foreignObject> blocks (can embed HTML)
    svg = svg.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');

    // Remove on* event attributes (onclick, onload, onmouseover, etc.)
    svg = svg.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');

    // Remove xlink:href and href attributes that point to non-data URIs
    // (keeps data: URIs for inline images but blocks javascript: and external refs)
    svg = svg.replace(/\s+(?:xlink:href|href)\s*=\s*"(?!data:)([^"]*)"/gi, '');
    svg = svg.replace(/\s+(?:xlink:href|href)\s*=\s*'(?!data:)([^']*)'/gi, '');

    // Remove <use> elements entirely (can reference external content)
    svg = svg.replace(/<use[\s\S]*?\/>/gi, '');
    svg = svg.replace(/<use[\s\S]*?<\/use>/gi, '');

    // Remove <style> blocks (including content) — prevents CSS injection
    svg = svg.replace(/<style[\s\S]*?<\/style>/gi, '');

    // Remove SVG filter primitive elements — prevents canvas fingerprinting
    // and other filter-based attacks (feBlend, feTurbulence, feGaussianBlur, etc.)
    svg = svg.replace(/<fe[A-Za-z]+[\s\S]*?\/>/gi, '');
    svg = svg.replace(/<fe[A-Za-z]+[\s\S]*?<\/fe[A-Za-z]+>/gi, '');

    // Remove <filter> wrapper elements too — no point keeping them empty
    svg = svg.replace(/<filter[\s\S]*?<\/filter>/gi, '');

    // Remove <defs> blocks that may contain filter or style definitions
    svg = svg.replace(/<defs[\s\S]*?<\/defs>/gi, '');

    // Final check — must still contain an <svg tag after sanitisation
    if (!svg.toLowerCase().includes('<svg')) {
      return null;
    }

    return svg.trim();
  } catch (_) {
    return null;
  }
}


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
    registryUrl:   cfg.url           || DEFAULT_REGISTRY_URL,
    githubApiBase: cfg.githubApiBase || DEFAULT_GITHUB_API_BASE,
    githubToken:   cfg.githubToken   || null,
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

/**
 * Derive a GitHub API base URL from a standard github.com repository URL.
 *
 * e.g. "https://github.com/someuser/some-plugins"
 *   →  "https://api.github.com/repos/someuser/some-plugins"
 *
 * Returns null if the URL is absent or not a recognisable github.com repo URL,
 * so callers can safely fall back to the configured default.
 *
 * @param {string|undefined} repoUrl
 * @returns {string|null}
 */
function githubApiBaseFromRepoUrl(repoUrl) {
  if (!repoUrl || typeof repoUrl !== 'string') return null;
  try {
    const u = new URL(repoUrl);
    if (u.hostname !== 'github.com') return null;
    // pathname is like /owner/repo or /owner/repo/
    const parts = u.pathname.replace(/^\/|\/$/g, '').split('/');
    if (parts.length < 2 || !parts[0] || !parts[1]) return null;
    return `https://api.github.com/repos/${parts[0]}/${parts[1]}`;
  } catch {
    return null;
  }
}

/**
 * Resolve the GitHub API base URL for a registry entry.
 *
 * Priority order:
 *   1. registryEntry.githubApiBase  — explicit override on the entry
 *   2. registryEntry.repository_url — derived via githubApiBaseFromRepoUrl()
 *   3. config.githubApiBase         — global default from caller config
 *   4. DEFAULT_GITHUB_API_BASE      — hard-coded fallback
 *
 * @param {object} registryEntry
 * @param {string} configApiBase  - already-resolved value from resolveConfig()
 * @returns {string}
 */
function resolveEntryApiBase(registryEntry, configApiBase) {
  return (
    registryEntry.githubApiBase ||
    githubApiBaseFromRepoUrl(registryEntry.repository_url) ||
    configApiBase
  );
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

// ─── Community Discovery Cache ────────────────────────────────────────────────

/**
 * Read the community cache from disk.
 * Returns null if the file is missing, unreadable, or malformed.
 *
 * @returns {{ cachedAt: number, plugins: object[], errors: object[] } | null}
 */
async function readCommunityCache() {
  try {
    const raw = await fsPromises.readFile(COMMUNITY_CACHE_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (typeof data.cachedAt !== 'number' || !Array.isArray(data.plugins)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * Write discovery results to the community cache file.
 * Failures are silently swallowed — a cache write error should never
 * prevent discovery results from being returned to the caller.
 *
 * @param {{ plugins: object[], errors: object[] }} result
 */
async function writeCommunityCache(result) {
  const payload = {
    cachedAt: Date.now(),
    plugins:  result.plugins,
    errors:   result.errors,
  };
  try {
    await fsPromises.writeFile(COMMUNITY_CACHE_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch {
    // Non-fatal — discovery still succeeded even if we can't cache it
  }
}



/**
 * Fetch and parse plugin.yaml from the root of a GitHub repo's main branch.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {object} headers - HTTP headers including optional Authorization
 * @returns {object} Parsed YAML content
 */
async function fetchPluginYaml(owner, repo, headers) {
  const url = `${GITHUB_RAW_BASE}/${owner}/${repo}/main/plugin.yaml`;
  const response = await axios.get(url, { headers, timeout: 15000 });
  // axios parses JSON automatically; for plain text we get a string
  const raw = typeof response.data === 'string'
    ? response.data
    : JSON.stringify(response.data);
  return yaml.load(raw);
}

/**
 * Convert a parsed plugin.yaml and GitHub repo metadata into a registry-
 * compatible entry, using the full repo name as both the plugin name and
 * the local install path.
 *
 * @param {object} pluginYaml  - parsed contents of plugin.yaml
 * @param {object} repoMeta    - item from GitHub search results
 * @returns {object} Registry entry
 */
function buildCommunityEntry(pluginYaml, repoMeta) {
  const repoName = repoMeta.name; // e.g. "orchelium-plugin-community-rsnapshot"

  return {
    // Identity — full repo name used as plugin name and install path
    name:    repoName,
    path:    repoName,
    source:  'community',
    official: false,

    // Metadata from plugin.yaml (with fallbacks to repo metadata)
    label:       pluginYaml.label       || repoName,
    description: pluginYaml.description || repoMeta.description || '',
    version:     pluginYaml.version     || '0.0.0',
    category:    pluginYaml.category    || 'community',
    tags:        Array.isArray(pluginYaml.tags) ? pluginYaml.tags : [],

    // GitHub source — used by installPlugin() to locate the files
    repository_url: repoMeta.html_url,
    githubApiBase:  `https://api.github.com/repos/${repoMeta.full_name}`,
    maintainer:     repoMeta.owner?.login || 'unknown',

    // Discovery metadata — useful for surfacing in the UI
    stars:       repoMeta.stargazers_count || 0,
    last_updated: repoMeta.pushed_at       || null,
  };
}

/**
 * Search GitHub for public repositories matching the community plugin naming
 * convention ("orchelium-plugin-community-<name>"), fetch each repo's
 * plugin.yaml, and return a list of registry-compatible entries.
 *
 * Results are cached to disk for COMMUNITY_CACHE_TTL_MS milliseconds.
 * Pass { forceRefresh: true } in config to bypass the cache (e.g. from a
 * UI "Refresh" button). A stale or missing cache always triggers a fresh fetch.
 *
 * Repos that are unreachable or lack a valid plugin.yaml are skipped; details
 * are collected in the returned `errors` array rather than throwing, so a
 * single bad repo does not abort the whole discovery run.
 *
 * @param {object} [config] - { githubToken, forceRefresh }
 * @returns {{ plugins: object[], errors: object[], fromCache: boolean, cachedAt: number|null }}
 */
async function discoverCommunityPlugins(config) {
  const cfg          = config || {};
  const forceRefresh = cfg.forceRefresh === true;

  // Return cached results if they exist and are still fresh
  if (!forceRefresh) {
    const cache = await readCommunityCache();
    if (cache && (Date.now() - cache.cachedAt) < COMMUNITY_CACHE_TTL_MS) {
      return {
        plugins:   cache.plugins,
        errors:    cache.errors,
        fromCache: true,
        cachedAt:  cache.cachedAt,
      };
    }
  }

  const { githubToken } = resolveConfig(cfg);
  const headers = buildHeaders(githubToken);

  // Search for repos matching the naming convention
  const searchResponse = await axios.get(GITHUB_SEARCH_API, {
    headers,
    timeout: 15000,
    params: {
      q:        `${COMMUNITY_REPO_PREFIX} in:name`,
      sort:     'stars',
      order:    'desc',
      per_page: 100,
    },
  });

  const repos = searchResponse.data?.items ?? [];

  const plugins = [];
  const errors  = [];

  // Fetch plugin.yaml from each matched repo in parallel
  await Promise.all(repos.map(async (repo) => {
    // Only process repos whose name strictly starts with the expected prefix
    if (!repo.name.startsWith(COMMUNITY_REPO_PREFIX)) return;

    // The part after the prefix must itself be a valid plugin name segment
    const suffix = repo.name.slice(COMMUNITY_REPO_PREFIX.length);
    if (!suffix || !PLUGIN_NAME_REGEX.test(suffix)) {
      errors.push({
        repo: repo.full_name,
        error: `Repo name suffix '${suffix}' is not a valid plugin name segment`,
      });
      return;
    }

    try {
      const pluginYaml = await fetchPluginYaml(repo.owner.login, repo.name, headers);

      if (!pluginYaml || typeof pluginYaml !== 'object') {
        throw new Error('plugin.yaml is empty or not a valid YAML object');
      }

      // Fetch and sanitise icon — non-fatal if missing
      const iconUrl = `${GITHUB_RAW_BASE}/${repo.owner.login}/${repo.name}/main/icon.svg`;
      const iconSvg = await fetchAndSanitiseSvg(iconUrl, headers);

      const entry = buildCommunityEntry(pluginYaml, repo);
      if (iconSvg) entry.iconSvg = iconSvg;

      plugins.push(entry);
    } 
    catch (err) {
      errors.push({ repo: repo.full_name, error: err.message });
    }
  }));

  // Sort by stars descending (Promise.all does not preserve order)
  plugins.sort((a, b) => b.stars - a.stars);

  const result = { plugins, errors };
  await writeCommunityCache(result);

  return {
    plugins,
    errors,
    fromCache: false,
    cachedAt:  Date.now(),
  };
}

// ─── Install ──────────────────────────────────────────────────────────────────

/**
 * Recursively download a directory from the GitHub Contents API.
 *
 * Pass an empty string for dirPath to download from the repo root.
 *
 * @param {string} apiBase  - e.g. https://api.github.com/repos/owner/repo
 * @param {string} dirPath  - path inside the repo, e.g. "rsync" or "" for root
 * @param {string} destDir  - absolute local destination directory
 * @param {object} headers  - HTTP headers including optional Authorization
 */
async function downloadDirectory(apiBase, dirPath, destDir, headers) {
  const contentPath = dirPath
    ? encodeURIComponent(dirPath).replace(/%2F/g, '/')
    : '';
  const url      = `${apiBase}/contents/${contentPath}`;
  const response = await axios.get(url, { headers, timeout: 20000 });
  const entries  = response.data;

  if (!Array.isArray(entries)) {
    throw new Error(`Unexpected response from GitHub Contents API for path: ${dirPath || '(root)'}`);
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
 * The source repository is resolved in priority order:
 *   1. registryEntry.githubApiBase  — explicit API base on the entry
 *   2. registryEntry.repository_url — standard github.com URL, auto-converted
 *   3. config.githubApiBase         — global config override
 *   4. DEFAULT_GITHUB_API_BASE      — built-in fallback
 *
 * For community plugins, registryEntry.path equals the repo name (e.g.
 * "orchelium-plugin-community-rsnapshot") and the plugin files live at the
 * repo root, so downloadDirectory is called with an empty dirPath.
 *
 * @param {string} pluginName    - validated plugin name
 * @param {object} registryEntry - entry from registry.json or discoverCommunityPlugins()
 * @param {object} [config]      - { githubApiBase, githubToken }
 */
async function installPlugin(pluginName, registryEntry, config) {
  validatePluginName(pluginName);

  if (!registryEntry || !registryEntry.path) {
    throw new Error('registryEntry must include a `path` field');
  }

  // Sanitise the repo path — must not contain traversal sequences.
  // For community plugins this equals the repo name; for official plugins it
  // is a subfolder within the shared repo. An empty string means repo root.
  const repoPath = registryEntry.path.replace(/\.\./g, '').replace(/^\/+/, '');

  // For community plugins the files are at the repo root, so when the path
  // equals the plugin name (i.e. there is no subfolder), pass '' to
  // downloadDirectory so it lists the root rather than looking for a folder
  // named after the plugin inside itself.
  const isCommunity = registryEntry.source === 'community';
  const downloadPath = isCommunity ? '' : repoPath;

  const destDir  = safePluginPath(pluginName);
  const { githubApiBase: configApiBase, githubToken } = resolveConfig(config);

  // Prefer the entry's own repo information over the global default
  const githubApiBase = resolveEntryApiBase(registryEntry, configApiBase);
  const headers = buildHeaders(githubToken);

  // Create destination directory
  await fsPromises.mkdir(destDir, { recursive: true });

  try {
    await downloadDirectory(githubApiBase, downloadPath, destDir, headers);
  } catch (err) {
    // Clean up partially downloaded directory on failure
    await fsPromises.rm(destDir, { recursive: true, force: true }).catch(() => {});
    // Check for GitHub API rate limit error
    if (err.response && err.response.status === 403) {
      const data    = err.response.data;
      const headers = err.response.headers || {};
      let message   = '';
      // GitHub REST API v3 returns a message in the body
      if (data && typeof data.message === 'string' && data.message.match(/rate limit/i)) {
        message = data.message;
      }
      // X-RateLimit-Reset is a UNIX timestamp (seconds)
      const reset = headers['x-ratelimit-reset'];
      if (reset) {
        const resetDate = new Date(parseInt(reset, 10) * 1000);
        const now       = new Date();
        const waitMins  = Math.ceil((resetDate - now) / 60000);
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
  discoverCommunityPlugins,
  installPlugin,
  uninstallPlugin,
};