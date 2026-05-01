const archiver = require('archiver');
const unzipper = require('unzipper');

const PACKAGE_TYPE = 'orchelium-export';
const SCHEMA_VERSION = 1;
const MAX_IMPORT_ENTRY_SIZE = 5 * 1024 * 1024; // 5MB per entry

function sanitizeScriptFilename(inputName) {
  const cleaned = String(inputName || '')
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, '');

  if (!cleaned) return 'imported-script.sh';
  if (cleaned.endsWith('.sh')) return cleaned;
  return cleaned + '.sh';
}

function hasMetadataBlock(scriptContent) {
  const lines = String(scriptContent || '').split('\n');
  const startIndex = lines.findIndex((line) => line.trim() === '#start-params');
  const endIndex = lines.findIndex((line) => line.trim() === '#end-params');
  return startIndex >= 0 && endIndex > startIndex;
}

function sanitizeJobId(rawValue) {
  const normalized = String(rawValue || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');

  return normalized || 'imported-orchestration';
}

function normalizeOrchestrationImportPayload(payload) {
  const source = payload || {};
  return {
    jobId: String(source.jobId || source.id || '').trim(),
    name: String(source.name || '').trim(),
    description: String(source.description || '').trim(),
    icon: String(source.icon || 'schema').trim() || 'schema',
    color: String(source.color || '#000000').trim() || '#000000',
    nodes: Array.isArray(source.nodes) ? source.nodes : null,
    edges: Array.isArray(source.edges) ? source.edges : null,
    type: String(source.type || 'orchestration').trim()
  };
}

function ensureOrchestrationPayloadValid(payload) {
  if (!payload.name) {
    throw new Error('Invalid orchestration payload: missing name');
  }
  if (!Array.isArray(payload.nodes)) {
    throw new Error('Invalid orchestration payload: nodes must be an array');
  }
  if (!Array.isArray(payload.edges)) {
    throw new Error('Invalid orchestration payload: edges must be an array');
  }
  if (payload.type && payload.type !== 'orchestration') {
    throw new Error('Invalid orchestration payload: incorrect type');
  }
}

function resolveUniqueScriptFilename(desiredName, existingFilenames) {
  const target = sanitizeScriptFilename(desiredName);
  const nameSet = new Set((existingFilenames || []).map((name) => String(name || '').toLowerCase()));

  if (!nameSet.has(target.toLowerCase())) {
    return { finalName: target, renamed: false };
  }

  const ext = '.sh';
  const stem = target.slice(0, -ext.length) || 'imported-script';
  let idx = 1;
  while (idx < 10000) {
    const candidate = `${stem}-imported-${idx}${ext}`;
    if (!nameSet.has(candidate.toLowerCase())) {
      return { finalName: candidate, renamed: true };
    }
    idx += 1;
  }

  throw new Error('Unable to resolve a unique script name');
}

function resolveUniqueOrchestrationIdentity({ desiredName, desiredJobId, existingJobs }) {
  const jobs = existingJobs || {};
  const existingIds = new Set(Object.keys(jobs).map((key) => String(key || '').toLowerCase()));
  const existingNames = new Set(
    Object.values(jobs)
      .map((job) => String((job && job.name) || '').trim().toLowerCase())
      .filter(Boolean)
  );

  const baseName = String(desiredName || '').trim() || 'Imported Orchestration';
  const baseJobId = sanitizeJobId(desiredJobId || baseName);

  for (let idx = 0; idx < 10000; idx += 1) {
    const nameCandidate = idx === 0 ? baseName : `${baseName} (imported ${idx})`;
    const idCandidate = idx === 0 ? baseJobId : `${baseJobId}-imported-${idx}`;

    if (!existingNames.has(nameCandidate.toLowerCase()) && !existingIds.has(idCandidate.toLowerCase())) {
      return {
        name: nameCandidate,
        jobId: idCandidate,
        renamed: idx > 0
      };
    }
  }

  throw new Error('Unable to resolve a unique orchestration identity');
}

async function createArchiveBuffer(entries) {
  const archive = archiver('zip', { zlib: { level: 6 } });
  const chunks = [];

  archive.on('data', (chunk) => {
    chunks.push(chunk);
  });

  await new Promise((resolve, reject) => {
    archive.on('finish', resolve);
    archive.on('error', reject);

    (async () => {
      try {
        for (const entry of entries) {
          archive.append(entry.content, { name: entry.name });
        }
        await archive.finalize();
      } catch (err) {
        reject(err);
      }
    })();
  });

  return Buffer.concat(chunks);
}

function getExactEntry(directory, expectedPath) {
  const target = String(expectedPath || '').toLowerCase();
  return directory.files.find((entry) => {
    return String(entry.path || '').toLowerCase() === target;
  });
}

async function readZipTextEntry(directory, entryPath) {
  const entry = getExactEntry(directory, entryPath);
  if (!entry) {
    throw new Error(`Import package is missing required file: ${entryPath}`);
  }

  const uncompressedSize = Number(entry.vars && entry.vars.uncompressedSize) || 0;
  if (uncompressedSize > MAX_IMPORT_ENTRY_SIZE) {
    throw new Error(`Entry too large in import package: ${entryPath}`);
  }

  const contentBuffer = await entry.buffer();
  if (!Buffer.isBuffer(contentBuffer)) {
    throw new Error(`Unable to read import entry: ${entryPath}`);
  }

  if (contentBuffer.length > MAX_IMPORT_ENTRY_SIZE) {
    throw new Error(`Entry too large in import package: ${entryPath}`);
  }

  return contentBuffer.toString('utf8');
}

async function parseManifest(zipBuffer) {
  const directory = await unzipper.Open.buffer(zipBuffer);
  const manifestRaw = await readZipTextEntry(directory, 'manifest.json');

  let manifest;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch (err) {
    throw new Error('Import package manifest.json is not valid JSON');
  }

  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Import package manifest.json is invalid');
  }

  if (manifest.packageType !== PACKAGE_TYPE) {
    throw new Error('Import package type is invalid');
  }

  if (manifest.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Unsupported import schema version: ${manifest.schemaVersion}`);
  }

  if (!manifest.entityType) {
    throw new Error('Import package manifest is missing entityType');
  }

  return { directory, manifest };
}

function toSafeFilenamePart(inputValue, fallbackValue) {
  const candidate = String(inputValue || fallbackValue || 'item')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return candidate || String(fallbackValue || 'item');
}

function getTimestampForFilename() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

async function createScriptExportBuffer({ scriptName, scriptContent }) {
  const normalizedScriptName = sanitizeScriptFilename(scriptName);
  const manifest = {
    packageType: PACKAGE_TYPE,
    schemaVersion: SCHEMA_VERSION,
    entityType: 'script',
    createdAt: new Date().toISOString(),
    scriptName: normalizedScriptName,
    scriptFile: 'script.sh'
  };

  return createArchiveBuffer([
    { name: 'manifest.json', content: JSON.stringify(manifest, null, 2) },
    { name: 'script.sh', content: String(scriptContent || '') }
  ]);
}

async function parseScriptImportBuffer(zipBuffer) {
  const { directory, manifest } = await parseManifest(zipBuffer);
  if (manifest.entityType !== 'script') {
    throw new Error(`Import package entity type mismatch: expected script, received ${manifest.entityType}`);
  }

  const scriptFile = manifest.scriptFile || 'script.sh';
  const scriptText = await readZipTextEntry(directory, scriptFile);
  if (!hasMetadataBlock(scriptText)) {
    throw new Error('Script import is invalid: missing #start-params/#end-params metadata block');
  }

  const importedScriptName = sanitizeScriptFilename(manifest.scriptName || 'imported-script.sh');
  return {
    scriptName: importedScriptName,
    scriptContent: scriptText,
    manifest
  };
}

async function createOrchestrationExportBuffer({ jobId, orchestration }) {
  const payload = normalizeOrchestrationImportPayload({
    jobId,
    id: orchestration.id,
    name: orchestration.name,
    description: orchestration.description,
    icon: orchestration.icon,
    color: orchestration.color,
    type: orchestration.type,
    nodes: orchestration.nodes,
    edges: orchestration.edges
  });

  ensureOrchestrationPayloadValid(payload);

  const manifest = {
    packageType: PACKAGE_TYPE,
    schemaVersion: SCHEMA_VERSION,
    entityType: 'orchestration',
    createdAt: new Date().toISOString(),
    jobId: payload.jobId,
    name: payload.name,
    orchestrationFile: 'orchestration.json'
  };

  return createArchiveBuffer([
    { name: 'manifest.json', content: JSON.stringify(manifest, null, 2) },
    { name: 'orchestration.json', content: JSON.stringify(payload, null, 2) }
  ]);
}

async function parseOrchestrationImportBuffer(zipBuffer) {
  const { directory, manifest } = await parseManifest(zipBuffer);
  if (manifest.entityType !== 'orchestration') {
    throw new Error(`Import package entity type mismatch: expected orchestration, received ${manifest.entityType}`);
  }

  const payloadFile = manifest.orchestrationFile || 'orchestration.json';
  const orchestrationRaw = await readZipTextEntry(directory, payloadFile);

  let parsedPayload;
  try {
    parsedPayload = JSON.parse(orchestrationRaw);
  } catch (err) {
    throw new Error('Import package orchestration payload is not valid JSON');
  }

  const normalizedPayload = normalizeOrchestrationImportPayload(parsedPayload);
  ensureOrchestrationPayloadValid(normalizedPayload);
  return {
    orchestration: normalizedPayload,
    manifest
  };
}

module.exports = {
  PACKAGE_TYPE,
  SCHEMA_VERSION,
  sanitizeScriptFilename,
  hasMetadataBlock,
  sanitizeJobId,
  resolveUniqueScriptFilename,
  resolveUniqueOrchestrationIdentity,
  toSafeFilenamePart,
  getTimestampForFilename,
  createScriptExportBuffer,
  parseScriptImportBuffer,
  createOrchestrationExportBuffer,
  parseOrchestrationImportBuffer
};
