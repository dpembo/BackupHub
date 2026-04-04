/**
 * Webhooks Data Module
 * 
 * Manages persistence of webhook configurations for jobs.
 * Webhooks allow external systems to trigger jobs with custom payloads.
 */

const webhookManager = require('./webhookManager.js');

const MAX_WEBHOOKS_PER_JOB = 10;
const WEBHOOKS_INDEX_KEY = "WEBHOOKS_INDEX";      // Index of all webhooks: {jobId -> [webhookIds]}
const WEBHOOK_DATA_KEY_PREFIX = "WEBHOOK_DATA_";  // Individual webhook data: WEBHOOK_DATA_<jobId>_<webhookId>

var initialized = false;
var webhooksIndex = {};  // { jobId: [webhookId, webhookId, ...], ... }

/**
 * Initialize webhooks data from database
 */
async function init() {
    logger.debug("Initializing Webhooks Data");
    try {
        await loadWebhooksIndex();
        initialized = true;
        logger.info(`Webhooks data initialized. Total jobs with webhooks: ${Object.keys(webhooksIndex).length}`);
    } catch (error) {
        logger.error('Error initializing webhooks data:', error);
        webhooksIndex = {};
        initialized = true;  // Continue even if load failed
    }
}

/**
 * Load the webhooks index from database
 */
async function loadWebhooksIndex() {
    try {
        const data = await db.getData(WEBHOOKS_INDEX_KEY);
        if (data !== undefined && data !== null) {
            webhooksIndex = data;
            logger.debug(`Loaded webhooks index: ${JSON.stringify(webhooksIndex)}`);
        } else {
            webhooksIndex = {};
        }
    } catch (err) {
        logger.debug("No webhooks index found in database (expected on first run)");
        webhooksIndex = {};
    }
}

/**
 * Save the webhooks index to database
 */
async function saveWebhooksIndex() {
    try {
        await db.putData(WEBHOOKS_INDEX_KEY, webhooksIndex);
        logger.debug("Webhooks index saved to database");
    } catch (err) {
        logger.error("Error saving webhooks index:", err);
        throw err;
    }
}

/**
 * Create a new webhook for a job
 * @param {string} jobId - Job ID
 * @param {string} name - Webhook name
 * @param {string} description - Webhook description
 * @returns {Promise<Object>} Created webhook object
 */
async function createWebhook(jobId, name, description = '') {
    if (!initialized) {
        logger.warn("Webhooks data not initialized yet - retrying in 1 second");
        await new Promise(resolve => setTimeout(resolve, 1000));
        return createWebhook(jobId, name, description);
    }

    try {
        // Check limit
        const jobWebhooks = webhooksIndex[jobId] || [];
        if (jobWebhooks.length >= MAX_WEBHOOKS_PER_JOB) {
            throw new Error(`Maximum webhooks (${MAX_WEBHOOKS_PER_JOB}) reached for job [${jobId}]`);
        }

        // Create webhook object
        const webhook = webhookManager.createWebhook(jobId, name, description);
        
        // Store webhook in index
        if (!webhooksIndex[jobId]) {
            webhooksIndex[jobId] = [];
        }
        webhooksIndex[jobId].push(webhook.id);

        // Store webhook data
        const dataKey = `${WEBHOOK_DATA_KEY_PREFIX}${jobId}_${webhook.id}`;
        await db.putData(dataKey, webhook);

        // Save updated index
        await saveWebhooksIndex();

        logger.info(`Webhook created for job [${jobId}]: [${webhook.id}]`);
        return webhook;
    } catch (err) {
        logger.error(`Error creating webhook for job [${jobId}]:`, err);
        throw err;
    }
}

/**
 * Get all webhooks for a job
 * @param {string} jobId - Job ID
 * @returns {Promise<Array>} Array of webhook objects
 */
async function getWebhooksForJob(jobId) {
    try {
        const webhookIds = webhooksIndex[jobId] || [];
        const webhooks = [];

        for (const webhookId of webhookIds) {
            const dataKey = `${WEBHOOK_DATA_KEY_PREFIX}${jobId}_${webhookId}`;
            try {
                const webhook = await db.getData(dataKey);
                webhooks.push(webhook);
            } catch (err) {
                logger.warn(`Webhook [${webhookId}] not found for job [${jobId}]`);
                // Remove from index if not found
                webhooksIndex[jobId] = webhooksIndex[jobId].filter(id => id !== webhookId);
            }
        }

        return webhooks;
    } catch (err) {
        logger.error(`Error loading webhooks for job [${jobId}]:`, err);
        return [];
    }
}

/**
 * Get a specific webhook
 * @param {string} jobId - Job ID
 * @param {string} webhookId - Webhook ID
 * @returns {Promise<Object>} Webhook object
 */
async function getWebhook(jobId, webhookId) {
    try {
        const dataKey = `${WEBHOOK_DATA_KEY_PREFIX}${jobId}_${webhookId}`;
        const webhook = await db.getData(dataKey);
        return webhook;
    } catch (err) {
        logger.error(`Error loading webhook [${webhookId}] for job [${jobId}]:`, err);
        throw err;
    }
}

/**
 * Validate webhook API key against stored webhook
 * @param {string} jobId - Job ID
 * @param {string} providedKey - API key from request
 * @returns {Promise<Object>} Webhook object if key matches
 */
async function validateWebhookKey(jobId, providedKey) {
    try {
        if (!webhookManager.isValidWebhookKey(providedKey)) {
            throw new Error('Invalid webhook key format');
        }

        const webhooks = await getWebhooksForJob(jobId);
        
        for (const webhook of webhooks) {
            if (!webhook.isActive) continue;
            
            // Compare keys directly (or use hashed comparison if keys are hashed)
            if (webhook.apiKey === providedKey) {
                return webhook;
            }
        }

        throw new Error('Webhook key not found for this job');
    } catch (err) {
        logger.warn(`Webhook validation failed for job [${jobId}]:`, err.message);
        throw err;
    }
}

/**
 * Record webhook trigger event
 * @param {string} jobId - Job ID
 * @param {string} webhookId - Webhook ID
 * @returns {Promise<Object>} Updated webhook
 */
async function recordWebhookTrigger(jobId, webhookId) {
    try {
        const dataKey = `${WEBHOOK_DATA_KEY_PREFIX}${jobId}_${webhookId}`;
        const webhook = await db.getData(dataKey);
        
        webhookManager.recordWebhookTrigger(webhook);
        
        await db.putData(dataKey, webhook);
        logger.info(`Webhook trigger recorded for [${jobId}:${webhookId}]`);
        
        return webhook;
    } catch (err) {
        logger.error(`Error recording webhook trigger [${jobId}:${webhookId}]:`, err);
        throw err;
    }
}

/**
 * Update webhook (enable/disable, name, description)
 * @param {string} jobId - Job ID
 * @param {string} webhookId - Webhook ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated webhook
 */
async function updateWebhook(jobId, webhookId, updates) {
    try {
        const dataKey = `${WEBHOOK_DATA_KEY_PREFIX}${jobId}_${webhookId}`;
        const webhook = await db.getData(dataKey);
        
        // Update allowed fields
        if (updates.isActive !== undefined) webhook.isActive = updates.isActive;
        if (updates.name !== undefined) webhook.name = updates.name;
        if (updates.description !== undefined) webhook.description = updates.description;
        
        await db.putData(dataKey, webhook);
        logger.info(`Webhook updated [${jobId}:${webhookId}]`);
        
        return webhook;
    } catch (err) {
        logger.error(`Error updating webhook [${jobId}:${webhookId}]:`, err);
        throw err;
    }
}

/**
 * Rotate webhook API key
 * @param {string} jobId - Job ID
 * @param {string} webhookId - Webhook ID
 * @param {string} oldKey - Old key for verification (optional for authenticated users)
 * @returns {Promise<Object>} Updated webhook with new key
 */
async function rotateWebhookKey(jobId, webhookId, oldKey) {
    try {
        const dataKey = `${WEBHOOK_DATA_KEY_PREFIX}${jobId}_${webhookId}`;
        const webhook = await db.getData(dataKey);
        
        // If oldKey is provided, verify it matches
        // If oldKey is not provided (authenticated user in admin panel), use current key
        const keyToVerify = oldKey || webhook.apiKey;
        
        // Rotate the key using current key as verification
        webhookManager.rotateWebhookKey(webhook, keyToVerify);
        
        await db.putData(dataKey, webhook);
        logger.info(`Webhook key rotated for [${jobId}:${webhookId}]`);
        
        return webhook;
    } catch (err) {
        logger.error(`Error rotating webhook key [${jobId}:${webhookId}]:`, err);
        throw err;
    }
}

/**
 * Delete a webhook
 * @param {string} jobId - Job ID
 * @param {string} webhookId - Webhook ID
 * @returns {Promise<boolean>} True if deleted
 */
async function deleteWebhook(jobId, webhookId) {
    try {
        const dataKey = `${WEBHOOK_DATA_KEY_PREFIX}${jobId}_${webhookId}`;
        await db.deleteData(dataKey);
        
        // Remove from index
        if (webhooksIndex[jobId]) {
            webhooksIndex[jobId] = webhooksIndex[jobId].filter(id => id !== webhookId);
            if (webhooksIndex[jobId].length === 0) {
                delete webhooksIndex[jobId];
            }
        }
        
        await saveWebhooksIndex();
        logger.info(`Webhook deleted [${jobId}:${webhookId}]`);
        
        return true;
    } catch (err) {
        logger.error(`Error deleting webhook [${jobId}:${webhookId}]:`, err);
        throw err;
    }
}

/**
 * Delete all webhooks for a job
 * @param {string} jobId - Job ID
 * @returns {Promise<number>} Number of webhooks deleted
 */
async function deleteAllWebhooksForJob(jobId) {
    try {
        const webhookIds = webhooksIndex[jobId] || [];
        let count = 0;
        
        for (const webhookId of webhookIds) {
            const dataKey = `${WEBHOOK_DATA_KEY_PREFIX}${jobId}_${webhookId}`;
            try {
                await db.deleteData(dataKey);
                count++;
            } catch (err) {
                logger.warn(`Error deleting webhook [${webhookId}] for job [${jobId}]:`, err);
            }
        }
        
        delete webhooksIndex[jobId];
        await saveWebhooksIndex();
        
        logger.info(`Deleted ${count} webhooks for job [${jobId}]`);
        return count;
    } catch (err) {
        logger.error(`Error deleting webhooks for job [${jobId}]:`, err);
        throw err;
    }
}

/**
 * Get statistics about webhooks
 * @returns {Promise<Object>} Statistics object
 */
async function getWebhookStats() {
    try {
        let totalJobs = 0;
        let totalWebhooks = 0;
        let activeWebhooks = 0;
        
        for (const [jobId, webhookIds] of Object.entries(webhooksIndex)) {
            totalJobs++;
            for (const webhookId of webhookIds) {
                const dataKey = `${WEBHOOK_DATA_KEY_PREFIX}${jobId}_${webhookId}`;
                try {
                    const webhook = await db.getData(dataKey);
                    totalWebhooks++;
                    if (webhook.isActive) activeWebhooks++;
                } catch (err) {
                    // Webhook not found, skip
                }
            }
        }
        
        return {
            jobsWithWebhooks: totalJobs,
            totalWebhooks: totalWebhooks,
            activeWebhooks: activeWebhooks,
            inactiveWebhooks: totalWebhooks - activeWebhooks
        };
    } catch (err) {
        logger.error("Error getting webhook statistics:", err);
        return { error: err.message };
    }
}

/**
 * Get all webhooks across all jobs
 * @returns {Promise<Array>} Array of webhooks with jobId included
 */
async function getAllWebhooks() {
    try {
        const allWebhooks = [];
        
        for (const [jobId, webhookIds] of Object.entries(webhooksIndex)) {
            for (const webhookId of webhookIds) {
                const dataKey = `${WEBHOOK_DATA_KEY_PREFIX}${jobId}_${webhookId}`;
                try {
                    const webhook = await db.getData(dataKey);
                    allWebhooks.push({
                        ...webhook,
                        jobName: jobId
                    });
                } catch (err) {
                    logger.warn(`Error fetching webhook [${webhookId}] for job [${jobId}]:`, err);
                }
            }
        }
        
        return allWebhooks;
    } catch (err) {
        logger.error("Error getting all webhooks:", err);
        throw err;
    }
}

module.exports = {
    init,
    createWebhook,
    getWebhooksForJob,
    getWebhook,
    validateWebhookKey,
    recordWebhookTrigger,
    updateWebhook,
    rotateWebhookKey,
    deleteWebhook,
    deleteAllWebhooksForJob,
    getWebhookStats,
    getAllWebhooks
};
