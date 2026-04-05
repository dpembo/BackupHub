/**
 * Webhook Management Module
 * 
 * Handles webhook configuration, API key generation, and webhook trigger tracking.
 * Webhooks allow external systems to trigger BackupHub jobs with custom JSON payloads.
 */

const crypto = require('crypto');

/**
 * Generate a new webhook API key (GUID format)
 * @returns {string} New webhook key (UUID v4)
 */
function generateWebhookKey() {
  return crypto.randomUUID();
}

/**
 * Create a new webhook configuration
 * @param {string} jobId - Job ID this webhook triggers
 * @param {string} name - Human-readable webhook name
 * @param {string} description - Webhook description
 * @returns {object} New webhook object
 */
function createWebhook(jobId, name, description = '') {
  return {
    id: crypto.randomUUID(),
    jobId,
    name,
    description,
    apiKey: generateWebhookKey(),
    createdAt: new Date().toISOString(),
    lastTriggeredAt: null,
    triggerCount: 0,
    isActive: true
  };
}

/**
 * Validate webhook API key format
 * @param {string} key - API key to validate
 * @returns {boolean} Whether key is valid UUID format
 */
function isValidWebhookKey(key) {
  if (!key || typeof key !== 'string') return false;
  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(key);
}

/**
 * Rotate webhook API key (generate new one)
 * @param {object} webhook - Webhook to rotate
 * @param {string} oldKey - Old key for verification
 * @returns {object} Updated webhook with new key
 */
function rotateWebhookKey(webhook, oldKey) {
  if (webhook.apiKey !== oldKey) {
    throw new Error('Invalid old webhook key provided');
  }
  
  webhook.apiKey = generateWebhookKey();
  webhook.keyRotatedAt = new Date().toISOString();
  
  return webhook;
}

/**
 * Record webhook trigger event
 * @param {object} webhook - Webhook that was triggered
 * @returns {object} Updated webhook
 */
function recordWebhookTrigger(webhook) {
  webhook.lastTriggeredAt = new Date().toISOString();
  webhook.triggerCount = (webhook.triggerCount || 0) + 1;
  return webhook;
}

/**
 * Webhook storage helper - typically integrated with db.js
 * These are example helper functions for managing webhooks in a data store
 */

/**
 * Build webhook key for storage: "WEBHOOK_<jobId>_<webhookId>"
 * @param {string} jobId - Job ID
 * @param {string} webhookId - Webhook ID
 * @returns {string} Storage key
 */
function getWebhookStorageKey(jobId, webhookId) {
  return `WEBHOOK_${jobId}_${webhookId}`;
}

/**
 * Build index key for all webhooks for a job: "WEBHOOKS_<jobId>"
 * @param {string} jobId - Job ID
 * @returns {string} Storage key
 */
function getWebhooksIndexKey(jobId) {
  return `WEBHOOKS_${jobId}`;
}

/**
 * Validate webhook payload structure
 * @param {any} payload - Payload to validate
 * @returns {boolean} Whether payload is valid JSON object
 */
function isValidWebhookPayload(payload) {
  if (payload === null || payload === undefined) return false;
  return typeof payload === 'object' && !Array.isArray(payload);
}

/**
 * Extract webhook API key from request
 * Checks both URL query parameter (?key=...) and X-Webhook-Key header
 * @param {object} req - Express request object
 * @returns {string|null} API key if found, null otherwise
 */
function extractWebhookKeyFromRequest(req) {
  // Check URL query parameter first (priority)
  if (req.query && req.query.key) {
    return req.query.key;
  }
  
  // Check X-Webhook-Key header
  if (req.headers && req.headers['x-webhook-key']) {
    return req.headers['x-webhook-key'];
  }
  
  return null;
}

/**
 * Hash webhook key for storage (if storing hashed keys for security)
 * Use this if storing hashed keys instead of plaintext
 * @param {string} key - Webhook API key
 * @returns {string} SHA-256 hash
 */
function hashWebhookKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Verify hashed webhook key
 * @param {string} providedKey - Key provided in request
 * @param {string} storedHash - Stored hash to compare against
 * @returns {boolean} Whether keys match
 */
function verifyWebhookKey(providedKey, storedHash) {
  const providedHash = hashWebhookKey(providedKey);
  return crypto.timingSafeEqual(
    Buffer.from(providedHash),
    Buffer.from(storedHash)
  );
}

module.exports = {
  generateWebhookKey,
  createWebhook,
  isValidWebhookKey,
  rotateWebhookKey,
  recordWebhookTrigger,
  getWebhookStorageKey,
  getWebhooksIndexKey,
  isValidWebhookPayload,
  extractWebhookKeyFromRequest,
  hashWebhookKey,
  verifyWebhookKey
};
