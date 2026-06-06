const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const db = require('./db.js');

const DB_KEYS = {
  jobs: 'SCHEDULES_CONFIG',
  orchestrations: 'ORCHESTRATION_JOBS'
};

const FILE_EXT = {
  job: '.job.json',
  orchestration: '.orch.json'
};

const DEFAULTS = {
  backend: process.env.DEFINITIONS_BACKEND || 'db',
  jobsDir: path.join(__dirname, 'data', 'jobs'),
  orchestrationsDir: path.join(__dirname, 'data', 'orchestrations'),
  stateDir: path.join(__dirname, 'data', '.state'),
  watcherDebounceMs: 500,
  reconciliationIntervalSeconds: 60
};

let cfg = { ...DEFAULTS };
let backend = DEFAULTS.backend;

let jobsCache = new Map();
let orchestrationsCache = new Map();
let orchestrationPathById = new Map();
let lastReloadAt = null;
let lastErrors = [];

let fsWatchers = [];
let reconcileTimer = null;
let reloadTimer = null;
let writeChain = Promise.resolve();

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isNotFoundError(err) {
  return !!(err && err.message && err.message.includes('NotFoundError'));
}

function sanitizeNameForFile(name) {
  const base = String(name || '').trim();
  if (!base) {
    throw new Error('Definition name is required');
  }
  return base
    .replace(/[\\/]/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_');
}

function nowIso() {
  return new Date().toISOString();
}

function getJobFilePath(jobName) {
  return path.join(cfg.jobsDir, `${sanitizeNameForFile(jobName)}${FILE_EXT.job}`);
}

function getOrchestrationFilePath(id, definition = null) {
  const idPart = sanitizeNameForFile(id);
  const name = definition && definition.name ? sanitizeNameForFile(definition.name) : '';
  const fileName = name ? `${name}--${idPart}${FILE_EXT.orchestration}` : `${idPart}${FILE_EXT.orchestration}`;
  return path.join(cfg.orchestrationsDir, fileName);
}

async function findOrchestrationPathById(id) {
  const idPart = sanitizeNameForFile(id);
  const legacyName = `${idPart}${FILE_EXT.orchestration}`;

  if (!fsSync.existsSync(cfg.orchestrationsDir)) {
    return null;
  }

  const files = await fs.readdir(cfg.orchestrationsDir);

  if (files.includes(legacyName)) {
    return path.join(cfg.orchestrationsDir, legacyName);
  }

  const suffix = `--${idPart}${FILE_EXT.orchestration}`;
  const matched = files.find(file => file.endsWith(suffix));
  return matched ? path.join(cfg.orchestrationsDir, matched) : null;
}

async function ensureDirectories() {
  await fs.mkdir(cfg.jobsDir, { recursive: true });
  await fs.mkdir(cfg.orchestrationsDir, { recursive: true });
  await fs.mkdir(cfg.stateDir, { recursive: true });
}

async function readJsonFileSafe(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

async function writeJsonAtomic(filePath, value) {
  const dir = path.dirname(filePath);
  const tmpName = `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`;
  const tmpPath = path.join(dir, tmpName);
  const json = `${JSON.stringify(value, null, 2)}\n`;

  await fs.writeFile(tmpPath, json, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function enqueueWrite(task) {
  writeChain = writeChain.then(task, task);
  return writeChain;
}

async function dbListJobs() {
  try {
    const data = await db.getData(DB_KEYS.jobs);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if (isNotFoundError(err)) return [];
    throw err;
  }
}

async function dbListOrchestrations() {
  try {
    const data = await db.getData(DB_KEYS.orchestrations);
    return data && typeof data === 'object' ? data : {};
  } catch (err) {
    if (isNotFoundError(err)) return {};
    throw err;
  }
}

async function dbSaveJob(jobName, definition) {
  const jobs = await dbListJobs();
  const idx = jobs.findIndex(j => j && j.jobName === jobName);
  if (idx >= 0) {
    jobs[idx] = definition;
  } else {
    jobs.push(definition);
  }
  await db.putData(DB_KEYS.jobs, jobs);
}

async function dbDeleteJob(jobName) {
  const jobs = await dbListJobs();
  const filtered = jobs.filter(j => !(j && j.jobName === jobName));
  await db.putData(DB_KEYS.jobs, filtered);
}

async function dbReplaceJobs(jobDefs) {
  await db.putData(DB_KEYS.jobs, Array.isArray(jobDefs) ? jobDefs : []);
}

async function dbSaveOrchestration(jobId, definition) {
  const all = await dbListOrchestrations();
  all[jobId] = definition;
  await db.putData(DB_KEYS.orchestrations, all);
}

async function dbDeleteOrchestration(jobId) {
  const all = await dbListOrchestrations();
  delete all[jobId];
  await db.putData(DB_KEYS.orchestrations, all);
}

async function dbReplaceOrchestrations(definitions) {
  await db.putData(DB_KEYS.orchestrations, definitions && typeof definitions === 'object' ? definitions : {});
}

async function loadFilesystemCaches() {
  const nextJobs = new Map();
  const nextOrchestrations = new Map();
  const nextOrchestrationPaths = new Map();
  const errors = [];

  if (fsSync.existsSync(cfg.jobsDir)) {
    const files = await fs.readdir(cfg.jobsDir);
    for (const file of files) {
      if (!file.endsWith(FILE_EXT.job)) continue;
      const full = path.join(cfg.jobsDir, file);
      try {
        const parsed = await readJsonFileSafe(full);
        if (!parsed || typeof parsed !== 'object' || !parsed.jobName) {
          throw new Error('Invalid job file payload: missing jobName');
        }
        nextJobs.set(parsed.jobName, parsed);
      } catch (err) {
        errors.push({ file: full, error: err.message });
      }
    }
  }

  if (fsSync.existsSync(cfg.orchestrationsDir)) {
    const files = await fs.readdir(cfg.orchestrationsDir);
    for (const file of files) {
      if (!file.endsWith(FILE_EXT.orchestration)) continue;
      const full = path.join(cfg.orchestrationsDir, file);
      try {
        const parsed = await readJsonFileSafe(full);
        if (!parsed || typeof parsed !== 'object' || !parsed.id) {
          throw new Error('Invalid orchestration file payload: missing id');
        }
        nextOrchestrations.set(parsed.id, parsed);
        nextOrchestrationPaths.set(parsed.id, full);
      } catch (err) {
        errors.push({ file: full, error: err.message });
      }
    }
  }

  jobsCache = nextJobs;
  orchestrationsCache = nextOrchestrations;
  orchestrationPathById = nextOrchestrationPaths;
  lastErrors = errors;
  lastReloadAt = nowIso();

  if (errors.length > 0) {
    logger.warn(`[DefinitionStore] Loaded with ${errors.length} invalid file(s)`);
    errors.forEach(e => logger.warn(`[DefinitionStore] ${e.file}: ${e.error}`));
  }
}

function stopFilesystemWatchers() {
  fsWatchers.forEach(w => {
    try {
      w.close();
    } catch (err) {
      logger.debug(`[DefinitionStore] watcher close failed: ${err.message}`);
    }
  });
  fsWatchers = [];

  if (reloadTimer) {
    clearTimeout(reloadTimer);
    reloadTimer = null;
  }

  if (reconcileTimer) {
    clearInterval(reconcileTimer);
    reconcileTimer = null;
  }
}

function scheduleReload() {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(async () => {
    reloadTimer = null;
    try {
      await loadFilesystemCaches();
      logger.debug('[DefinitionStore] Reloaded definitions after filesystem change');
    } catch (err) {
      logger.error(`[DefinitionStore] Reload failed: ${err.message}`);
    }
  }, cfg.watcherDebounceMs);
}

function startFilesystemWatchers() {
  const watchDir = (dir, label) => {
    if (!fsSync.existsSync(dir)) return;

    try {
      const watcher = fsSync.watch(dir, { persistent: true }, (_eventType, filename) => {
        if (!filename) return;
        logger.debug(`[DefinitionStore] ${label} change detected: ${filename}`);
        scheduleReload();
      });
      fsWatchers.push(watcher);
    } catch (err) {
      logger.warn(`[DefinitionStore] Unable to watch ${dir}: ${err.message}`);
    }
  };

  watchDir(cfg.jobsDir, 'jobs');
  watchDir(cfg.orchestrationsDir, 'orchestrations');

  reconcileTimer = setInterval(async () => {
    try {
      await loadFilesystemCaches();
    } catch (err) {
      logger.error(`[DefinitionStore] Periodic reconciliation failed: ${err.message}`);
    }
  }, Math.max(10, cfg.reconciliationIntervalSeconds) * 1000);
}

function shouldUseFilesystem() {
  return backend === 'fs' || backend === 'hybrid';
}

function mergeJobLists(preferredJobs, fallbackJobs) {
  const merged = new Map();

  (fallbackJobs || []).forEach(job => {
    if (job && job.jobName) {
      merged.set(job.jobName, deepClone(job));
    }
  });

  (preferredJobs || []).forEach(job => {
    if (job && job.jobName) {
      merged.set(job.jobName, deepClone(job));
    }
  });

  return Array.from(merged.values());
}

function mergeOrchestrationMaps(preferredEntries, fallbackEntries) {
  return {
    ...(fallbackEntries || {}),
    ...(preferredEntries || {})
  };
}

async function init(options = {}) {
  cfg = {
    ...DEFAULTS,
    ...cfg,
    ...options
  };

  backend = (cfg.backend || process.env.DEFINITIONS_BACKEND || 'db').toLowerCase();
  if (!['db', 'fs', 'hybrid'].includes(backend)) {
    logger.warn(`[DefinitionStore] Unknown backend [${backend}] - falling back to db`);
    backend = 'db';
  }

  stopFilesystemWatchers();

  if (shouldUseFilesystem()) {
    await ensureDirectories();
    await loadFilesystemCaches();
    startFilesystemWatchers();
  }

  logger.info(`[DefinitionStore] Initialized using backend [${backend}]`);
}

function getBackend() {
  return backend;
}

async function reload() {
  if (!shouldUseFilesystem()) return;
  await loadFilesystemCaches();
}

async function listJobs() {
  if (backend === 'db') {
    return dbListJobs();
  }

  if (backend === 'hybrid') {
    const dbJobs = await dbListJobs();
    const fsJobs = Array.from(jobsCache.values()).map(deepClone);
    return mergeJobLists(fsJobs, dbJobs);
  }

  return Array.from(jobsCache.values()).map(deepClone);
}

async function getJob(jobName) {
  if (backend === 'db') {
    const jobs = await dbListJobs();
    const match = jobs.find(j => j && j.jobName === jobName);
    return match ? deepClone(match) : null;
  }

  if (jobsCache.has(jobName)) {
    return deepClone(jobsCache.get(jobName));
  }

  if (backend === 'hybrid') {
    const jobs = await dbListJobs();
    const match = jobs.find(j => j && j.jobName === jobName);
    return match ? deepClone(match) : null;
  }

  return null;
}

async function saveJob(jobName, definition) {
  if (!jobName) throw new Error('jobName is required');
  const next = { ...definition, jobName };

  if (backend === 'db') {
    await dbSaveJob(jobName, next);
    return deepClone(next);
  }

  await enqueueWrite(async () => {
    const filePath = getJobFilePath(jobName);
    await writeJsonAtomic(filePath, next);
    jobsCache.set(jobName, next);

    if (backend === 'hybrid') {
      await dbSaveJob(jobName, next);
    }
  });

  return deepClone(next);
}

async function deleteJob(jobName) {
  if (!jobName) return false;

  if (backend === 'db') {
    await dbDeleteJob(jobName);
    return true;
  }

  await enqueueWrite(async () => {
    const filePath = getJobFilePath(jobName);
    if (fsSync.existsSync(filePath)) {
      await fs.unlink(filePath);
    }
    jobsCache.delete(jobName);

    if (backend === 'hybrid') {
      await dbDeleteJob(jobName);
    }
  });

  return true;
}

async function replaceJobs(definitions) {
  const list = Array.isArray(definitions) ? definitions : [];

  if (backend === 'db') {
    await dbReplaceJobs(list);
    return list.length;
  }

  await enqueueWrite(async () => {
    const next = new Map();

    for (const item of list) {
      if (!item || !item.jobName) continue;
      const key = item.jobName;
      next.set(key, item);
      await writeJsonAtomic(getJobFilePath(key), item);
    }

    for (const existing of Array.from(jobsCache.keys())) {
      if (!next.has(existing)) {
        const filePath = getJobFilePath(existing);
        if (fsSync.existsSync(filePath)) {
          await fs.unlink(filePath);
        }
      }
    }

    jobsCache = next;

    if (backend === 'hybrid') {
      await dbReplaceJobs(Array.from(next.values()));
    }
  });

  return list.length;
}

async function clearJobs() {
  return replaceJobs([]);
}

async function listOrchestrations() {
  if (backend === 'db') {
    return dbListOrchestrations();
  }

  if (backend === 'hybrid') {
    const dbOrchestrations = await dbListOrchestrations();
    const fsOrchestrations = {};
    orchestrationsCache.forEach((value, key) => {
      fsOrchestrations[key] = deepClone(value);
    });
    return mergeOrchestrationMaps(fsOrchestrations, dbOrchestrations);
  }

  const asObject = {};
  orchestrationsCache.forEach((value, key) => {
    asObject[key] = deepClone(value);
  });
  return asObject;
}

async function getOrchestration(jobId) {
  if (backend === 'db') {
    const all = await dbListOrchestrations();
    return all[jobId] ? deepClone(all[jobId]) : null;
  }

  if (orchestrationsCache.has(jobId)) {
    return deepClone(orchestrationsCache.get(jobId));
  }

  if (backend === 'hybrid') {
    const all = await dbListOrchestrations();
    return all[jobId] ? deepClone(all[jobId]) : null;
  }

  return null;
}

async function saveOrchestration(jobId, definition) {
  if (!jobId) throw new Error('jobId is required');
  const next = { ...definition, id: jobId };

  if (backend === 'db') {
    await dbSaveOrchestration(jobId, next);
    return deepClone(next);
  }

  await enqueueWrite(async () => {
    const filePath = getOrchestrationFilePath(jobId, next);
    const oldPath = orchestrationPathById.get(jobId);

    await writeJsonAtomic(filePath, next);

    if (oldPath && oldPath !== filePath && fsSync.existsSync(oldPath)) {
      await fs.unlink(oldPath);
    }

    orchestrationsCache.set(jobId, next);
    orchestrationPathById.set(jobId, filePath);

    if (backend === 'hybrid') {
      await dbSaveOrchestration(jobId, next);
    }
  });

  return deepClone(next);
}

async function deleteOrchestration(jobId) {
  if (!jobId) return false;

  if (backend === 'db') {
    await dbDeleteOrchestration(jobId);
    return true;
  }

  await enqueueWrite(async () => {
    let filePath = orchestrationPathById.get(jobId);
    if (!filePath) {
      filePath = await findOrchestrationPathById(jobId);
    }
    if (filePath && fsSync.existsSync(filePath)) {
      await fs.unlink(filePath);
    }
    orchestrationsCache.delete(jobId);
    orchestrationPathById.delete(jobId);

    if (backend === 'hybrid') {
      await dbDeleteOrchestration(jobId);
    }
  });

  return true;
}

async function replaceOrchestrations(definitions) {
  const incoming = definitions && typeof definitions === 'object' ? definitions : {};

  if (backend === 'db') {
    await dbReplaceOrchestrations(incoming);
    return Object.keys(incoming).length;
  }

  await enqueueWrite(async () => {
    const next = new Map();
    const nextPaths = new Map();

    for (const [jobId, item] of Object.entries(incoming)) {
      if (!item) continue;
      const normalized = { ...item, id: item.id || jobId };
      const key = normalized.id;
      const filePath = getOrchestrationFilePath(key, normalized);
      const oldPath = orchestrationPathById.get(key);

      next.set(key, normalized);
      nextPaths.set(key, filePath);
      await writeJsonAtomic(filePath, normalized);

      if (oldPath && oldPath !== filePath && fsSync.existsSync(oldPath)) {
        await fs.unlink(oldPath);
      }
    }

    for (const existing of Array.from(orchestrationPathById.keys())) {
      if (!next.has(existing)) {
        const oldPath = orchestrationPathById.get(existing);
        if (oldPath && fsSync.existsSync(oldPath)) {
          await fs.unlink(oldPath);
        }
      }
    }

    orchestrationsCache = next;
    orchestrationPathById = nextPaths;

    if (backend === 'hybrid') {
      const asObject = {};
      next.forEach((value, key) => {
        asObject[key] = value;
      });
      await dbReplaceOrchestrations(asObject);
    }
  });

  return Object.keys(incoming).length;
}

async function clearOrchestrations() {
  return replaceOrchestrations({});
}

async function migrateSchedulesFromDbToFilesystem(options = {}) {
  if (!shouldUseFilesystem()) {
    throw new Error('Backend must be fs or hybrid to migrate schedules');
  }

  const source = await dbListJobs();
  await replaceJobs(source);

  if (options.deleteSource === true) {
    await dbReplaceJobs([]);
  }

  logger.info(`[DefinitionStore] Migrated ${source.length} schedule definitions from DB to filesystem`);
  return source.length;
}

async function migrateOrchestrationsFromDbToFilesystem(options = {}) {
  if (!shouldUseFilesystem()) {
    throw new Error('Backend must be fs or hybrid to migrate orchestrations');
  }

  const source = await dbListOrchestrations();
  await replaceOrchestrations(source);

  if (options.deleteSource === true) {
    await dbReplaceOrchestrations({});
  }

  logger.info(`[DefinitionStore] Migrated ${Object.keys(source).length} orchestration definitions from DB to filesystem`);
  return Object.keys(source).length;
}

function getStatus() {
  return {
    backend,
    jobsDir: cfg.jobsDir,
    orchestrationsDir: cfg.orchestrationsDir,
    lastReloadAt,
    jobsCount: jobsCache.size,
    orchestrationsCount: orchestrationsCache.size,
    invalidFiles: deepClone(lastErrors)
  };
}

module.exports = {
  init,
  reload,
  getBackend,
  getStatus,
  listJobs,
  getJob,
  saveJob,
  deleteJob,
  replaceJobs,
  clearJobs,
  listOrchestrations,
  getOrchestration,
  saveOrchestration,
  deleteOrchestration,
  replaceOrchestrations,
  clearOrchestrations,
  migrateSchedulesFromDbToFilesystem,
  migrateOrchestrationsFromDbToFilesystem
};
