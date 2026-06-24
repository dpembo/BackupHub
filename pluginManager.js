'use strict';

const axios      = require('axios');
const path       = require('path');
const fs         = require('fs');
const fsPromises = require('fs').promises;
const unzipper   = require('unzipper');
const { Readable } = require('stream');

const { PLUGINS_DIR } = require('./pluginRegistry');

const PLUGIN_NAME_REGEX = /^[a-z0-9][a-z0-9-]*$/;

const COMMUNITY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const COMMUNITY_CACHE_FILE   = path.join(PLUGINS_DIR, '.community-cache.json');
const SVG_MAX_BYTES          = 50 * 1024;

// --- Registry URL helpers ---

function getRegistryBase() {
  return (serverConfig.pluginRegistry.url || 'https://orchelium.com').replace(/\/$/, '');
}

function getRegistryUrl() {
  const base = getRegistryBase();
  const pluginsPath = serverConfig.pluginRegistry.plugins || '/cache/plugins.json';
  return `${base}${pluginsPath}`;
}

function getValidationUrl() {
  const base = getRegistryBase();
  const validationPath = serverConfig.pluginRegistry.validation || '/cache/validation-report.json';
  return `${base}${validationPath}`;
}

function getIconUrl(reponame) {
  const base = getRegistryBase();
  const iconsPath = (serverConfig.pluginRegistry.icons || '/cache/icons/').replace(/\/$/, '');
  return `${base}${iconsPath}/${reponame}.svg`;
}

function getCommunityZipUrl(reponame) {
  const base = getRegistryBase();
  const installsPath = (serverConfig.pluginRegistry.installs || '/cache/community/').replace(/\/$/, '');
  return `${base}${installsPath}/${reponame}.zip`;
}

// --- Helpers ---

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

// --- Registry ---

async function fetchRemoteRegistry() {
  const registryUrl   = getRegistryUrl();
  const validationUrl = getValidationUrl();

  logger.info(`[PLUGIN] Fetching remote registry from ${registryUrl}`);

  const [registryResp, validationResp] = await Promise.allSettled([
    axios.get(registryUrl,   { timeout: 15000 }),
    axios.get(validationUrl, { timeout: 15000 }),
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
    plugin.iconUrl = getIconUrl(plugin.reponame);

    if (plugin.source === 'community' && !plugin.path && plugin.repository_url) {
      plugin.path = plugin.repository_url.split('/').pop();
    }

    const report = validationReport[plugin.reponame] ?? null;
    plugin.validationWarnings = report?.warnings ?? [];
  }

  logger.info(`[PLUGIN] Registry loaded: ${data.plugins.length} plugins (${data.official} official, ${data.community} community)`);

  return data;
}

// --- Install ---

async function installPlugin(pluginName, registryEntry) {
  validatePluginName(pluginName);

  if (!registryEntry) {
    throw new Error('registryEntry is required');
  }

  const repoName = registryEntry.reponame;
  if (!repoName) {
    throw new Error(`Plugin '${pluginName}' is missing reponame field`);
  }

  const destDir = safePluginPath(pluginName);
  const zipUrl  = getCommunityZipUrl(repoName);

  logger.info(`[PLUGIN] Installing plugin '${pluginName}' from ${zipUrl}`);

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

  logger.info(`[PLUGIN] Plugin '${pluginName}' installed successfully`);
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