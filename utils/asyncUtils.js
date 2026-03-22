/**
 * Async Utilities Module
 * Common patterns and helpers for async/await operations
 */

/**
 * Promise-based file reading
 * @param {string} filePath - Path to file
 * @returns {Promise<string>} File contents
 */
async function readFileAsync(filePath) {
  try {
    logger.debug(`Reading file: ${filePath}`);
    const fs = require('fs').promises;
    const content = await fs.readFile(filePath, 'utf8');
    logger.debug(`Successfully read file: ${filePath}`);
    return content;
  } catch (error) {
    logger.error(`Error reading file ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * Promise-based file writing
 * @param {string} filePath - Path to file
 * @param {string} content - Content to write
 * @returns {Promise<void>}
 */
async function writeFileAsync(filePath, content) {
  try {
    logger.debug(`Writing file: ${filePath}`);
    const fs = require('fs').promises;
    await fs.writeFile(filePath, content, 'utf8');
    logger.info(`Successfully wrote file: ${filePath}`);
  } catch (error) {
    logger.error(`Error writing file ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in ms
 * @returns {Promise} Result of function
 */
async function retryAsync(fn, maxRetries = 3, baseDelay = 100) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        logger.error(`Failed after ${maxRetries} retries:`, error.message);
        throw error;
      }
      const delay = baseDelay * Math.pow(2, attempt);
      logger.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error.message);
      await delay_ms(delay);
    }
  }
}

/**
 * Delay execution for specified milliseconds
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
async function delay_ms(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run multiple async tasks in parallel with error handling
 * @param {Array<Promise>} promises - Array of promises
 * @param {boolean} continueOnError - Continue on error or fail fast
 * @returns {Promise<Array>} Results array
 */
async function parallelAsync(promises, continueOnError = false) {
  try {
    if (continueOnError) {
      const results = await Promise.allSettled(promises);
      return results.map((r, i) => {
        if (r.status === 'rejected') {
          logger.warn(`Task ${i} failed:`, r.reason.message);
          return null;
        }
        return r.value;
      });
    } else {
      return await Promise.all(promises);
    }
  } catch (error) {
    logger.error(`Error in parallel execution:`, error.message);
    throw error;
  }
}

/**
 * Execute function with timeout
 * @param {Promise} promise - Promise to execute
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} timeoutMessage - Message for timeout error
 * @returns {Promise}
 */
async function withTimeout(promise, timeoutMs, timeoutMessage = 'Operation timed out') {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
  );
  return Promise.race([promise, timeoutPromise]);
}

/**
 * Safe JSON parsing with error handling
 * @param {string} jsonString - JSON string to parse
 * @param {*} defaultValue - Default value if parsing fails
 * @returns {*} Parsed object or default value
 */
function safeJsonParse(jsonString, defaultValue = null) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    logger.warn(`JSON parse error: ${error.message}`);
    return defaultValue;
  }
}

/**
 * Build query string from object
 * @param {object} params - Parameter object
 * @returns {string} Query string
 */
function buildQueryString(params) {
  if (!params || typeof params !== 'object') return '';
  const entries = Object.entries(params).filter(([_, v]) => v !== null && v !== undefined);
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

/**
 * Get value safely from nested object
 * @param {object} obj - Object to traverse
 * @param {string} path - Dot-notation path (e.g., 'user.profile.name')
 * @param {*} defaultValue - Default value if path not found
 * @returns {*} Value or default
 */
function getNestedValue(obj, path, defaultValue = undefined) {
  try {
    const value = path.split('.').reduce((current, key) => current?.[key], obj);
    return value !== undefined ? value : defaultValue;
  } catch {
    return defaultValue;
  }
}

module.exports = {
  readFileAsync,
  writeFileAsync,
  retryAsync,
  delay_ms,
  parallelAsync,
  withTimeout,
  safeJsonParse,
  buildQueryString,
  getNestedValue
};
