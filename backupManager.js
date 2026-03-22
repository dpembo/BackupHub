/**
 * Backup and Restore Manager
 * Handles exporting and importing BackupHub settings and data
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const archiver = require('archiver');
const unzipper = require('unzipper');
const { AppError, handleError } = require('./utils/errorHandler.js');

// Database instances
const db = require('./db.js');
const agentHistoryDb = require('./agentHistory.js');
const configuration = require('./configuration.js');

const DATA_DIR = './data';
const DATABASES = {
  main: './data/data.db',
  user: './data/user.db',
  agentHistory: './data/agentHistory.db',
};

const CONFIG_FILE = './data/server-config.json';

/**
 * Get available backup items
 * Returns list of what can be backed up
 */
function getBackupItems() {
  return {
    serverConfig: {
      name: 'Server Configuration',
      description: 'MQTT, SMTP, WebSocket, Notifications, Thresholds, Icons settings',
    },
    agentsConfig: {
      name: 'Agents Configuration',
      description: 'All registered agent configurations',
    },
    schedules: {
      name: 'Backup Schedules',
      description: 'All configured backup schedules',
    },
    agentHistory: {
      name: 'Agent Connection History',
      description: 'Historical logs of agent connections',
    },
  };
}

/**
 * Create a backup zip file
 * @param {Object} options - Backup options
 * @param {boolean} options.serverConfig - Include server configuration
 * @param {boolean} options.agentsConfig - Include agents configuration
 * @param {boolean} options.schedules - Include schedules
 * @param {boolean} options.agentHistory - Include agent history
 * @returns {Promise<Buffer>} - Zip file buffer
 */
async function createBackup(options = {}) {
  try {
    const {
      serverConfig = true,
      agentsConfig = true,
      schedules = true,
      agentHistory = true,
    } = options;

    logger.info('Starting backup process with options:', options);

    // Create an in-memory zip archive
    const archive = archiver('zip', { zlib: { level: 6 } });
    const chunks = [];

    // Capture archived data in buffer
    archive.on('data', (chunk) => {
      chunks.push(chunk);
    });

    archive.on('error', (err) => {
      logger.error('Archive error:', err);
      throw new AppError('Failed to create backup archive', 500);
    });

    // Finalize is async, so we need to wait for it
    await new Promise(async (resolve, reject) => {
      archive.on('finish', resolve);
      archive.on('error', reject);

      try {
        // Add files to archive based on selection, then finalize
        await addFilesToArchive(archive, {
          serverConfig,
          agentsConfig,
          schedules,
          agentHistory,
        });

        // Finalize only after all files have been appended
        await archive.finalize();
      } catch (err) {
        reject(err);
      }
    });

    const backupBuffer = Buffer.concat(chunks);
    logger.info(`Backup created successfully (${backupBuffer.length} bytes)`);
    return backupBuffer;
  } catch (err) {
    logger.error('Backup creation failed:', err);
    throw new AppError(`Backup failed: ${err.message}`, 500);
  }
}

/**
 * Helper function to add files to archive
 * @private
 */
async function addFilesToArchive(archive, options) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = `backup-${timestamp}`;

  try {
    // Add server config
    if (options.serverConfig && fsSync.existsSync(CONFIG_FILE)) {
      const configContent = await fs.readFile(CONFIG_FILE, 'utf8');
      archive.append(configContent, { name: `${backupDir}/server-config.json` });
      logger.debug('Added server configuration to backup');
    }

    // Add agents config
    if (options.agentsConfig) {
      try {
        const agents = await db.getData('AGENTS_CONFIG');
        if (agents) {
          archive.append(JSON.stringify(agents, null, 2), {
            name: `${backupDir}/agents-config.json`,
          });
          logger.debug('Added agents configuration to backup');
        }
      } catch (err) {
        logger.debug('No agents config found in database');
      }
    }

    // Add schedules
    if (options.schedules) {
      try {
        const schedules = await db.getData('SCHEDULES_CONFIG');
        if (schedules) {
          archive.append(JSON.stringify(schedules, null, 2), {
            name: `${backupDir}/schedules-config.json`,
          });
          logger.debug('Added schedules to backup');
        }
      } catch (err) {
        logger.debug('No schedules found in database');
      }
    }

    // Add agent history
    if (options.agentHistory) {
      try {
        const historyEntries = await agentHistoryDb.exportAll();
        if (historyEntries.length > 0) {
          archive.append(JSON.stringify(historyEntries, null, 2), {
            name: `${backupDir}/agent-history.json`,
          });
          logger.debug(`Added ${historyEntries.length} history records to backup`);
        }
      } catch (err) {
        logger.debug('No agent history found in database');
      }
    }

    // Add metadata
    const metadata = {
      backupVersion: '1.0',
      backupDate: new Date().toISOString(),
      appVersion: require('./version.js').getVersion(),
      items: {
        serverConfig: options.serverConfig,
        agentsConfig: options.agentsConfig,
        schedules: options.schedules,
        agentHistory: options.agentHistory,
      },
    };
    archive.append(JSON.stringify(metadata, null, 2), {
      name: `${backupDir}/backup-metadata.json`,
    });

    logger.debug('Backup archive created successfully');
  } catch (err) {
    logger.error('Error adding files to backup archive:', err);
    throw err;
  }
}

/**
 * Restore backup from zip file
 * @param {Buffer} zipBuffer - Zip file buffer
 * @returns {Promise<Object>} - Restore results with recommendations
 */
async function restoreBackup(zipBuffer) {
  let tempDir = null;

  try {
    // Create temporary directory for extraction
    tempDir = path.join(DATA_DIR, `.restore_${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    logger.info('Starting backup restore process');

    // Extract zip to temp directory
    await extractZip(zipBuffer, tempDir);

    // Find the backup directory (should be the only directory in temp)
    const files = await fs.readdir(tempDir);
    const backupDirName = files.find((f) => f.startsWith('backup-'));

    if (!backupDirName) {
      throw new AppError('Invalid backup file: no backup directory found', 400);
    }

    const backupPath = path.join(tempDir, backupDirName);

    // Read and parse metadata
    const metadataPath = path.join(backupPath, 'backup-metadata.json');
    let metadata = {};

    if (fsSync.existsSync(metadataPath)) {
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      metadata = JSON.parse(metadataContent);
      logger.info('Backup metadata:', metadata);
    }

    const results = {
      success: true,
      itemsRestored: [],
      warnings: [],
      recommendations: ['Restart the BackupHub server to ensure all changes take effect.'],
    };

    // Restore server config
    if (metadata.items?.serverConfig) {
      const configPath = path.join(backupPath, 'server-config.json');
      if (fsSync.existsSync(configPath)) {
        await restoreServerConfig(configPath);
        results.itemsRestored.push('Server Configuration');
        logger.info('Server configuration restored');
      } else {
        results.warnings.push('Server configuration not found in backup');
      }
    }

    // Restore agents config
    if (metadata.items?.agentsConfig) {
      const agentsPath = path.join(backupPath, 'agents-config.json');
      if (fsSync.existsSync(agentsPath)) {
        await restoreAgentsConfig(agentsPath);
        results.itemsRestored.push('Agents Configuration');
        logger.info('Agents configuration restored');
      } else {
        results.warnings.push('Agents configuration not found in backup');
      }
    }

    // Restore schedules
    if (metadata.items?.schedules) {
      const schedulesPath = path.join(backupPath, 'schedules-config.json');
      if (fsSync.existsSync(schedulesPath)) {
        await restoreSchedules(schedulesPath);
        results.itemsRestored.push('Backup Schedules');
        logger.info('Schedules restored');
      } else {
        results.warnings.push('Schedules not found in backup');
      }
    }

    // Restore agent history
    if (metadata.items?.agentHistory) {
      const historyPath = path.join(backupPath, 'agent-history.json');
      if (fsSync.existsSync(historyPath)) {
        await restoreAgentHistory(historyPath);
        results.itemsRestored.push('Agent Connection History');
        logger.info('Agent history restored');
      } else {
        results.warnings.push('Agent history not found in backup');
      }
    }

    logger.info('Backup restore completed successfully');
    return results;
  } catch (err) {
    logger.error('Backup restore failed:', err);
    throw new AppError(`Restore failed: ${err.message}`, err.statusCode || 500);
  } finally {
    // Clean up temporary directory
    if (tempDir && fsSync.existsSync(tempDir)) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        logger.debug('Temporary restore directory cleaned up');
      } catch (cleanupErr) {
        logger.warn('Failed to clean up temporary restore directory:', cleanupErr);
      }
    }
  }
}

/**
 * Extract zip file to directory
 * @private
 */
async function extractZip(zipBuffer, targetDir) {
  return new Promise((resolve, reject) => {
    const { Readable } = require('stream');
    const readable = Readable.from(zipBuffer);

    readable
      .pipe(unzipper.Extract({ path: targetDir }))
      .on('close', resolve)
      .on('error', (err) => {
        logger.error('Zip extraction error:', err);
        reject(new AppError('Failed to extract backup file', 400));
      });
  });
}

/**
 * Restore server configuration
 * @private
 */
async function restoreServerConfig(configPath) {
  const content = await fs.readFile(configPath, 'utf8');
  const config = JSON.parse(content);

  // Validate config structure
  if (!config.server) {
    throw new AppError('Invalid server configuration format', 400);
  }

  // Update global config and save
  Object.assign(serverConfig, config);
  await configuration.saveServerConfig(serverConfig);
  logger.info('Server configuration restored and saved');
}

/**
 * Restore agents configuration
 * @private
 */
async function restoreAgentsConfig(agentsPath) {
  const content = await fs.readFile(agentsPath, 'utf8');
  const agentsConfig = JSON.parse(content);

  // Validate it's an object (agents are stored as a keyed object, not an array)
  if (!agentsConfig || typeof agentsConfig !== 'object' || Array.isArray(agentsConfig)) {
    throw new AppError('Invalid agents configuration format', 400);
  }

  // Save to database
  await db.putData('AGENTS_CONFIG', agentsConfig);
  logger.info(`Restored ${Object.keys(agentsConfig).length} agent configurations`);
}

/**
 * Restore schedules
 * @private
 */
async function restoreSchedules(schedulesPath) {
  const content = await fs.readFile(schedulesPath, 'utf8');
  const schedules = JSON.parse(content);

  // Validate it's an array
  if (!Array.isArray(schedules)) {
    throw new AppError('Invalid schedules format', 400);
  }

  // Save to database
  await db.putData('SCHEDULES_CONFIG', schedules);
  logger.info(`Restored ${schedules.length} schedules`);
}

/**
 * Restore agent history
 * @private
 */
async function restoreAgentHistory(historyPath) {
  const content = await fs.readFile(historyPath, 'utf8');
  const historyData = JSON.parse(content);

  // Validate it's an array of { key, value } entries
  if (!Array.isArray(historyData)) {
    throw new AppError('Invalid agent history format', 400);
  }

  await agentHistoryDb.importAll(historyData);
  logger.info(`Restored ${historyData.length} agent history records`);
}

module.exports = {
  getBackupItems,
  createBackup,
  restoreBackup,
};
