'use strict';

const axios      = require('axios');
const path       = require('path');
const fs         = require('fs');
const fsPromises = require('fs').promises;
const yaml       = require('js-yaml');
const unzipper   = require('unzipper');
const { Readable } = require('stream');

const { PLUGINS_DIR } = require('./pluginRegistry');

const PLUGIN_NAME_REGEX = /^[a-z0-9][a-z0-9-]*$/;

const COMMUNITY_REPO_PREFIX   = 'orchelium-plugin-community-';
const GITHUB_SEARCH_API       = 'https://api.github.com/search/repositories';
const GITHUB_RAW_BASE         = 'https://raw.githubusercontent.com';

const DEFAULT_REGISTRY_URL    = 'https://orchelium.com/cache/plugins.json';
const DEFAULT_GITHUB_API_BASE = 'https://api.github.com/repos/dpembo/orchelium-plugins';

const COMMUNITY_CACHE_TTL_MS  = 60 * 60 * 1000; // 1 hour
const COMMUNITY_CACHE_FILE    = path.join(PLUGINS_DIR, '.community-cache.json');
const SVG_MAX_BYTES = 50 * 1024;

// --- Helpers ---
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

function githubApiBaseFromRepoUrl(repoUrl) {
  if (!repoUrl || typeof repoUrl !== 'string') return null;
  try {
    const u = new URL(repoUrl);
    if (u.hostname !== 'github.com') return null;
    const parts = u.pathname.replace(/^\/|\/$/g, '').split('/');
    if (parts.length < 2 || !parts[0] || !parts[1]) return null;
    return `https://api.github.com/repos/${parts[0]}/${parts[1]}`;
  } catch {
    return null;
  }
}

function resolveEntryApiBase(registryEntry, configApiBase) {
  return (
    registryEntry.githubApiBase ||
    githubApiBaseFromRepoUrl(registryEntry.repository_url) ||
    configApiBase
  );
}

// --- Registry ---

async function fetchRemoteRegistry(config) {
  const { registryUrl, githubToken } = resolveConfig(config);

  logger.info(`[PLUGIN] Fetching remote registry from ${registryUrl}`);

  const [registryResp, validationResp] = await Promise.allSettled([
    axios.get(registryUrl, { headers: buildHeaders(githubToken), timeout: 15000 }),
    axios.get('https://orchelium.com/cache/validation-report.json', { timeout: 15000 }),
  ]);

  if (registryResp.status === 'rejected') throw registryResp.reason;

  const data = registryResp.value.data;
  if (!data || !Array.isArray(data.plugins)) {
    throw new Error('Remote registry is malformed — expected { plugins: [...] }');
  }

  const validationReport = validationResp.status === 'fulfilled'
    ? validationResp.value.data
    : {};

  if (validationResp.status === 'rejected') {
    logger.warn('[PLUGIN] Could not fetch validation report — warnings will not be shown');
  }

  for (const plugin of data.plugins) {
    plugin.iconUrl = `https://orchelium.com/cache/icons/${plugin.reponame}.svg`;

    if (plugin.source === 'community' && !plugin.path && plugin.repository_url) {
      const repoName = plugin.repository_url.split('/').pop();
      plugin.path = repoName;
    }

    const report = validationReport[plugin.reponame] ?? null;
    plugin.validationWarnings = report?.warnings ?? [];
  }

  logger.info(`[PLUGIN] Registry loaded: ${data.plugins.length} plugins (${data.official} official, ${data.community} community)`);

  return data;
}

async function fetchPluginYaml(owner, repo, headers) {
  const url = `${GITHUB_RAW_BASE}/${owner}/${repo}/main/plugin.yaml`;
  const response = await axios.get(url, { headers, timeout: 15000 });
  const raw = typeof response.data === 'string'
    ? response.data
    : JSON.stringify(response.data);
  return yaml.load(raw);
}

function buildCommunityEntry(pluginYaml, repoMeta) {
  const repoName = repoMeta.name;

  return {
    name:     repoName,
    path:     repoName,
    source:   'community',
    official: false,

    label:       pluginYaml.label       || repoName,
    description: pluginYaml.description || repoMeta.description || '',
    version:     pluginYaml.version     || '0.0.0',
    category:    pluginYaml.category    || 'community',
    tags:        Array.isArray(pluginYaml.tags) ? pluginYaml.tags : [],

    repository_url: repoMeta.html_url,
    githubApiBase:  `https://api.github.com/repos/${repoMeta.full_name}`,
    maintainer:     repoMeta.owner?.login || 'unknown',

    stars:        repoMeta.stargazers_count || 0,
    last_updated: repoMeta.pushed_at        || null,
  };
}

// --- Install ---

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
    if (!entry.name || entry.name.includes('/') || entry.name.includes('\\') || entry.name === '..' || entry.name === '.') {
      continue;
    }

    const destPath = path.join(destDir, entry.name);

    if (!path.resolve(destPath).startsWith(path.resolve(destDir))) {
      continue;
    }

    if (entry.type === 'file') {
      if (!entry.content) {
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

async function installPlugin(pluginName, registryEntry, config) {
  validatePluginName(pluginName);

  if (!registryEntry) {
    throw new Error('registryEntry is required');
  }

  const destDir = safePluginPath(pluginName);

  // ── Community: download pre-built zip from Orchelium cache ────────────────
  if (registryEntry.source === 'community') {
    const repoName = registryEntry.reponame;
    if (!repoName) {
      throw new Error(`Community plugin '${pluginName}' is missing reponame field`);
    }

    const zipUrl = `https://orchelium.com/cache/community/${repoName}.zip`;
    logger.info(`[PLUGIN] Installing community plugin '${pluginName}' from ${zipUrl}`);

    const zipResp   = await axios.get(zipUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const zipBuffer = Buffer.from(zipResp.data);

    logger.debug(`[PLUGIN] Downloaded zip for '${pluginName}' (${zipBuffer.length} bytes), extracting to ${destDir}`);

    await fsPromises.mkdir(destDir, { recursive: true });

    await new Promise((resolve, reject) => {
      Readable.from(zipBuffer)
        .pipe(unzipper.Parse())
        .on('entry', entry => {
          // Strip the root folder (repo name) from the path
          const parts    = entry.path.split('/');
          const stripped = parts.slice(1).join('/');

          if (!stripped) { entry.autodrain(); return; }

          const destPath = path.join(destDir, stripped);

          if (!path.resolve(destPath).startsWith(path.resolve(destDir))) {
            logger.warn(`[PLUGIN] Skipping path traversal attempt in zip: ${entry.path}`);
            entry.autodrain(); return;
          }

          if (entry.type === 'Directory') {
            fsPromises.mkdir(destPath, { recursive: true }).catch(reject);
            entry.autodrain();
          } else {
            fsPromises.mkdir(path.dirname(destPath), { recursive: true })
              .then(() => {
                const writer = fs.createWriteStream(destPath);
                entry.pipe(writer);
                writer.on('finish', () => {
                  if (destPath.endsWith('.sh')) {
                    fsPromises.chmod(destPath, 0o755).catch(reject);
                  }
                });
                writer.on('error', reject);
              })
              .catch(reject);
          }
        })
        .on('finish', resolve)
        .on('error', reject);
    });

    logger.info(`[PLUGIN] Community plugin '${pluginName}' installed successfully`);
    return;
  }

  // ── Official: download from GitHub monorepo ───────────────────────────────
  if (!registryEntry.path) {
    throw new Error('registryEntry must include a `path` field for official plugins');
  }

  const { githubApiBase: configApiBase, githubToken } = resolveConfig(config);
  const repoPath      = registryEntry.path.replace(/\.\./g, '').replace(/^\/+/, '');
  const githubApiBase = resolveEntryApiBase(registryEntry, configApiBase);
  const headers       = buildHeaders(githubToken);

  logger.info(`[PLUGIN] Installing official plugin '${pluginName}' from ${githubApiBase}/${repoPath}`);

  await fsPromises.mkdir(destDir, { recursive: true });

  try {
    await downloadDirectory(githubApiBase, repoPath, destDir, headers);
  } catch (err) {
    await fsPromises.rm(destDir, { recursive: true, force: true }).catch(() => {});
    if (err.response && err.response.status === 403) {
      const data        = err.response.data;
      const respHeaders = err.response.headers || {};
      let message       = '';
      if (data && typeof data.message === 'string' && data.message.match(/rate limit/i)) {
        message = data.message;
      }
      const reset = respHeaders['x-ratelimit-reset'];
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

  // Replace icon with cached version
  try {
    const iconUrl  = `https://orchelium.com/cache/icons/${registryEntry.name}.svg`;
    logger.debug(`[PLUGIN] Replacing icon for '${pluginName}' from ${iconUrl}`);
    const iconResp = await axios.get(iconUrl, { responseType: 'arraybuffer' });
    await fsPromises.writeFile(path.join(destDir, 'icon.svg'), iconResp.data);
  } catch (err) {
    logger.warn(`[PLUGIN] Failed to replace icon for '${pluginName}': ${err.message}`);
  }

  logger.info(`[PLUGIN] Official plugin '${pluginName}' installed successfully`);
}

// --- Uninstall ---
async function uninstallPlugin(pluginName) {
  validatePluginName(pluginName);

  logger.info(`[PLUGIN] Uninstalling plugin '${pluginName}'`);

  const pluginDir = safePluginPath(pluginName);

  try {
    await fsPromises.access(pluginDir);
  } catch {
    throw new Error(`Plugin '${pluginName}' is not installed`);
  }

  await fsPromises.rm(pluginDir, { recursive: true });

  logger.info(`[PLUGIN] Plugin '${pluginName}' uninstalled successfully`);
}

// --- Exports ---
module.exports = {
  fetchRemoteRegistry,
  installPlugin,
  uninstallPlugin,
};