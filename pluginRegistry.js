/**
 * Plugin Registry
 * Loads, validates, and hot-reloads Orchelium plugins from the plugins/ directory.
 *
 * A plugin is a folder under plugins/ containing at minimum a plugin.yaml file.
 * The registry exposes a flat map of plugin definitions keyed by plugin name.
 */

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

const PLUGINS_DIR = path.join(__dirname, 'plugins');

// Registry state
let _registry = {};      // name -> plugin definition
let _watcher = null;
let _reloadTimeout = null;
const RELOAD_DEBOUNCE_MS = 500;

// ─── Validation ────────────────────────────────────────────────────────────────

const VALID_FIELD_TYPES = new Set(['string', 'secret', 'number', 'boolean', 'select', 'list', 'json']);

function validatePlugin(raw, pluginDir) {
  const errors = [];

  if (!raw.name || typeof raw.name !== 'string') errors.push('name is required and must be a string');
  if (!raw.label || typeof raw.label !== 'string') errors.push('label is required and must be a string');
  if (raw.inputs !== undefined && !Array.isArray(raw.inputs)) errors.push('inputs must be an array');

  if (Array.isArray(raw.inputs)) {
    raw.inputs.forEach((field, i) => {
      if (!field.name) errors.push(`inputs[${i}] is missing name`);
      if (!field.type) errors.push(`inputs[${i}] is missing type`);
      if (field.type && !VALID_FIELD_TYPES.has(field.type)) {
        errors.push(`inputs[${i}] has unknown type '${field.type}'`);
      }
      if (field.type === 'select' && (!Array.isArray(field.options) || field.options.length === 0)) {
        errors.push(`inputs[${i}] (select) requires a non-empty options array`);
      }
      if (field.type === 'list' && !field.item_type) {
        errors.push(`inputs[${i}] (list) requires item_type`);
      }
      // Validate visibleWhen if present (optional field for conditional visibility)
      if (field.visibleWhen !== undefined) {
        if (typeof field.visibleWhen !== 'object' || field.visibleWhen === null) {
          errors.push(`inputs[${i}] visibleWhen must be an object`);
        } else {
          // Check that visibleWhen references point to valid fields and have array values
          Object.entries(field.visibleWhen).forEach(([refField, refValues]) => {
            if (!Array.isArray(refValues)) {
              errors.push(`inputs[${i}] visibleWhen.${refField} must be an array of values`);
            }
          });
        }
      }
    });
  }

  if (!raw.template && !raw.command) {
    errors.push('plugin must define either template or command');
  }

  return errors;
}

// ─── Loading ───────────────────────────────────────────────────────────────────

async function loadPlugin(pluginDir) {
  const yamlPath = path.join(pluginDir, 'plugin.yaml');
  try {
    const content = await fsPromises.readFile(yamlPath, 'utf8');
    const raw = yaml.load(content);

    if (!raw || typeof raw !== 'object') {
      logger.warn(`[PLUGINS] ${yamlPath}: plugin.yaml is empty or not an object, skipping`);
      return null;
    }

    const errors = validatePlugin(raw, pluginDir);
    if (errors.length > 0) {
      logger.warn(`[PLUGINS] Plugin at ${pluginDir} has validation errors: ${errors.join('; ')}`);
      return null;
    }

    // Check for icon.svg
    const iconPath = path.join(pluginDir, 'icon.svg');
    let iconSvg = null;
    try {
      iconSvg = await fsPromises.readFile(iconPath, 'utf8');
    } catch (_e) { /* icon is optional */ }

    // Check for docs.md
    const docsPath = path.join(pluginDir, 'docs.md');
    let docsMd = null;
    try {
      docsMd = await fsPromises.readFile(docsPath, 'utf8');
    } catch (_e) { /* docs are optional */ }

    // Resolve command script absolute path if relative
    let resolvedCommand = raw.command || null;
    if (resolvedCommand && !path.isAbsolute(resolvedCommand)) {
      resolvedCommand = path.join(pluginDir, resolvedCommand);
    }

    const plugin = {
      name: raw.name,
      label: raw.label,
      description: raw.description || '',
      version: raw.version || null,
      source: raw.source || 'community', // 'official' or 'community'
      maintainer: raw.maintainer || null,
      repository_url: raw.repository_url || null,
      inputs: raw.inputs || [],
      template: raw.template || null,
      command: resolvedCommand,
      args: raw.args || [],
      output: raw.output || { format: 'auto' },
      iconSvg,
      docsMd,
      pluginDir
    };

    logger.info(`[PLUGINS] Loaded plugin: ${plugin.name} (${plugin.label}) from ${pluginDir}`);
    return plugin;
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Not a plugin dir (no plugin.yaml), silently skip
      return null;
    }
    logger.warn(`[PLUGINS] Error loading plugin from ${pluginDir}: ${err.message}`);
    return null;
  }
}

async function loadAllPlugins() {
  const newRegistry = {};

  let dirs;
  try {
    const entries = await fsPromises.readdir(PLUGINS_DIR, { withFileTypes: true });
    dirs = entries.filter(e => e.isDirectory()).map(e => path.join(PLUGINS_DIR, e.name));
  } catch (err) {
    if (err.code === 'ENOENT') {
      logger.debug('[PLUGINS] No plugins directory found, skipping plugin load');
      _registry = {};
      return;
    }
    throw err;
  }

  for (const dir of dirs) {
    const plugin = await loadPlugin(dir);
    if (plugin) {
      if (newRegistry[plugin.name]) {
        logger.warn(`[PLUGINS] Duplicate plugin name '${plugin.name}' — second entry from ${dir} ignored`);
      } else {
        newRegistry[plugin.name] = plugin;
      }
    }
  }

  _registry = newRegistry;
  logger.info(`[PLUGINS] Registry built: ${Object.keys(_registry).length} plugin(s) loaded`);
}

// ─── Hot Reload ────────────────────────────────────────────────────────────────

function scheduleReload() {
  if (_reloadTimeout) clearTimeout(_reloadTimeout);
  _reloadTimeout = setTimeout(async () => {
    _reloadTimeout = null;
    logger.info('[PLUGINS] Hot-reloading plugin registry...');
    try {
      await loadAllPlugins();
    } catch (err) {
      logger.error(`[PLUGINS] Hot-reload failed: ${err.message}`);
    }
  }, RELOAD_DEBOUNCE_MS);
}

function startWatcher() {
  if (_watcher) return; // Already watching

  try {
    if (!fs.existsSync(PLUGINS_DIR)) {
      fs.mkdirSync(PLUGINS_DIR, { recursive: true });
    }

    _watcher = fs.watch(PLUGINS_DIR, { recursive: true }, (eventType, filename) => {
      if (filename && (filename.endsWith('plugin.yaml') || filename.endsWith('icon.svg') || filename.endsWith('.md') || filename.endsWith('.sh') || filename.endsWith('.js') || filename.endsWith('.py'))) {
        logger.debug(`[PLUGINS] File change detected: ${filename} (${eventType})`);
        scheduleReload();
      }
    });

    _watcher.on('error', (err) => {
      logger.warn(`[PLUGINS] Watcher error: ${err.message}`);
    });

    logger.info(`[PLUGINS] Watching ${PLUGINS_DIR} for changes`);
  } catch (err) {
    logger.warn(`[PLUGINS] Could not start file watcher: ${err.message}`);
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialise the plugin registry: load all plugins and start the file watcher.
 */
async function init() {
  // Ensure plugins directory exists
  if (!fs.existsSync(PLUGINS_DIR)) {
    fs.mkdirSync(PLUGINS_DIR, { recursive: true });
    logger.info(`[PLUGINS] Created plugins directory at ${PLUGINS_DIR}`);
  }

  await loadAllPlugins();
  startWatcher();
}

/**
 * Get the full registry map (name -> plugin definition).
 * @returns {Object}
 */
function getRegistry() {
  return _registry;
}

/**
 * Get a single plugin by name.
 * @param {string} name
 * @returns {Object|null}
 */
function getPlugin(name) {
  return _registry[name] || null;
}

/**
 * Get all plugins as an array, stripped of server-side fields (pluginDir, command path).
 * Safe to send to the browser.
 */
function getPluginsForClient() {
  return Object.values(_registry).map(p => ({
    name: p.name,
    label: p.label,
    description: p.description,
    version: p.version,
    source: p.source,
    maintainer: p.maintainer,
    repository_url: p.repository_url,
    inputs: p.inputs,
    output: p.output,
    hasIcon: !!p.iconSvg,
    iconSvg: p.iconSvg,
    docsMd: p.docsMd || null
  }));
}

/**
 * Apply {{variable}} template substitution for plugin command building.
 * @param {string} template - Template string with {{var}} placeholders
 * @param {Object} values - Map of variable name -> value
 * @returns {string}
 */
function applyPluginTemplate(template, values) {
  if (!template || typeof template !== 'string') return template;
  return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const trimmed = key.trim();
    if (trimmed === 'inputs_json') {
      return JSON.stringify(values);
    }
    const val = values[trimmed];
    if (val === undefined || val === null) return '';
    if (Array.isArray(val)) return val.join(' ');
    return String(val);
  });
}

/**
 * Build the command string and argument list for a plugin node execution.
 * Returns { command: string, args: string[] } ready for agent dispatch.
 *
 * If the plugin uses `template`, the command is the rendered shell command.
 * If the plugin uses `command` + `args`, the command is the script path
 * and args are rendered from the args template array.
 *
 * @param {Object} plugin - Plugin definition from registry
 * @param {Object} inputValues - Map of input name -> value (from node data)
 * @returns {{ scriptContent: string|null, scriptPath: string|null, parameters: string }}
 */
function buildPluginExecution(plugin, inputValues) {
  const values = inputValues || {};

  if (plugin.template) {
    // Render template as an inline shell command
    const rendered = applyPluginTemplate(plugin.template.trim(), values);
    return {
      mode: 'template',
      scriptContent: rendered,
      scriptPath: null,
      parameters: ''
    };
  }

  if (plugin.command) {
    // NOTE: We do NOT pass the JSON as commandParams because the agent sanitizes
    // commandParams (strips {}"\'etc.) which destroys JSON. Instead we inject the
    // inputs directly into the script content as a variable so they never touch
    // the params pipeline. The script reads INPUT_JSON from the environment and
    // falls back to $1 for backward compatibility.
    const inputsJson = JSON.stringify(values);
    // Single-quote wrap the JSON for inline bash assignment; escape any literal
    // single quotes that might appear inside string values.
    const escapedJson = inputsJson.replace(/'/g, "'\\''" );
    return {
      mode: 'command',
      scriptContent: null,
      scriptPath: plugin.command,
      parameters: '',
      injectedEnv: `INPUT_JSON='${escapedJson}'`
    };
  }

  throw new Error(`Plugin '${plugin.name}' has neither template nor command`);
}

module.exports = {
  init,
  reload: () => {
    // Cancel any watcher-scheduled debounced reload before running explicitly
    if (_reloadTimeout) { clearTimeout(_reloadTimeout); _reloadTimeout = null; }
    return loadAllPlugins();
  },
  getRegistry,
  getPlugin,
  getPluginsForClient,
  applyPluginTemplate,
  buildPluginExecution,
  PLUGINS_DIR
};
