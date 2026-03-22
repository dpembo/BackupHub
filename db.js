const { Level } = require('level')
var db;
var inDbPath;

// Initialize the LevelDB database
function initializeDB(dbPath) {
    db = new Level(dbPath, { valueEncoding: 'json' })
    inDbPath = dbPath;
}

// ============================================================================
// PRIMARY PROMISE-BASED API (use these in new code)
// ============================================================================

/**
 * Get data from the database
 * @param {string} key - The key to retrieve
 * @returns {Promise} The value stored at the key
 * @throws {Error} If key not found
 */
async function getData(key) {
  logger.debug(`Fetching data from DB [${inDbPath}] with key [${key}]`);
  try {
    const value = await db.get(key);
    if(value === undefined || value === null) {
      throw new Error(`NotFoundError: Item with key [${key}] not found`);
    }
    logger.debug(`Found item [${key}]`);
    return value;
  } catch (err) {
    // NotFoundError is expected behavior, log at debug level
    if (err.message && err.message.includes('NotFoundError')) {
      logger.debug(`Key not found [${key}] (expected if data hasn't been created yet)`);
    } else {
      logger.error(`Error fetching key [${key}]: ${err.message}`);
    }
    throw err;
  }
}

/**
 * Put data to the database
 * @param {string} key - The key to store
 * @param {*} value - The value to store
 * @returns {Promise} Resolves when data is stored
 */
async function putData(key, value) {
  logger.info(`DB Storing in [${key}] value [${value}]`);
  try {
    const result = await db.put(key, value);
    return result;
  } catch (err) {
    logger.error(`Error storing key [${key}]: ${err.message}`);
    throw err;
  }
}

/**
 * Delete data from the database
 * @param {string} key - The key to delete
 * @returns {Promise} Resolves when data is deleted
 */
async function deleteData(key) {
  logger.debug(`Deleting key [${key}] from DB`);
  try {
    const result = await db.del(key);
    return result;
  } catch (err) {
    logger.error(`Error deleting key [${key}]: ${err.message}`);
    throw err;
  }
}

// ============================================================================
// UTILITY FUNCTIONS (Promise-based)
// ============================================================================

/**
 * Get multiple values from the database
 * @param {string[]} keys - Array of keys to retrieve
 * @returns {Promise} Array of {key, value} objects
 */
async function getManyData(keys) {
  const results = [];
  try {
    for (const key of keys) {
      try {
        const value = await db.get(key);
        results.push({ key, value });
      } catch (err) {
        logger.debug(`Key [${key}] not found, skipping`);
      }
    }
    return results;
  } catch (err) {
    logger.error(`Error in getManyData: ${err.message}`);
    throw err;
  }
}

/**
 * Search for data based on a specific value
 * @param {*} searchValue - The value to search for
 * @returns {Promise} Array of matching entries
 */
async function searchData(searchValue) {
  return new Promise((resolve, reject) => {
    const results = [];
    db.createReadStream()
      .on('data', (data) => {
        if (data.value === searchValue) {
          results.push(data);
        }
      })
      .on('end', () => {
        resolve(results);
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}

/**
 * List all keys in the database
 * @returns {Promise} Array of keys
 */
async function listKeys() {
  return new Promise((resolve, reject) => {
    const keys = [];
    db.createKeyStream()
      .on('data', (key) => {
        keys.push(key);
      })
      .on('end', () => {
        resolve(keys);
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}

/**
 * Perform batch operations
 * @param {Array} operations - Array of batch operations
 * @returns {Promise} Resolves when batch is complete
 */
async function batchData(operations) {
  return new Promise((resolve, reject) => {
    db.batch(operations, (err) => {
      if (err) reject(err);
      else resolve('Batch operation successful.');
    });
  });
}

/**
 * Clear the entire database
 * @returns {Promise} Resolves when database is cleared
 */
async function clearData() {
  return new Promise((resolve, reject) => {
    db.clear(undefined, (err) => {
      if (err) reject(err);
      else resolve('Database cleared.');
    });
  });
}

// ============================================================================
// ADVANCED FUNCTIONS (return LevelDB iterators)
// ============================================================================

function chainedBatch() {
  return db.batch();
}

function iterator(options) {
  return db.iterator(options);
}

function keyIterator() {
  return db.createKeyStream();
}

function valueIterator() {
  return db.createValueStream();
}

function sublevel(sublevelName) {
  return db.sublevel(sublevelName);
}

// ============================================================================
// BACKWARDS COMPATIBILITY WRAPPERS (deprecated - use Promise-based functions above)
// ============================================================================

/**
 * @deprecated Use getData() instead
 */
function getDataLegacy(key, callback) {
  getData(key)
    .then(value => callback(null, value))
    .catch(err => callback(err));
}

/**
 * @deprecated Use putData() instead
 */
function putDataLegacy(key, value, callback) {
  putData(key, value)
    .then(result => callback(null, result))
    .catch(err => callback(err));
}

/**
 * @deprecated Use deleteData() instead
 */
function deleteDataLegacy(key, callback) {
  deleteData(key)
    .then(result => callback(null, result))
    .catch(err => callback(err));
}

/**
 * @deprecated Use getManyData() instead
 */
function getManyLegacy(keys, callback) {
  getManyData(keys)
    .then(results => callback(null, results))
    .catch(err => callback(err));
}

/**
 * @deprecated Use batchData() instead
 */
function batchLegacy(operations, callback) {
  batchData(operations)
    .then(result => callback(null, result))
    .catch(err => callback(err));
}

/**
 * @deprecated Use listKeys() instead
 */
function listKeysLegacy(callback) {
  listKeys()
    .then(keys => callback(null, keys))
    .catch(err => callback(err));
}

/**
 * @deprecated Use searchData() instead
 */
function searchDataLegacy(searchValue, callback) {
  searchData(searchValue)
    .then(results => callback(null, results))
    .catch(err => callback(err));
}

/**
 * @deprecated Use clearData() instead
 */
function clearLegacy(callback) {
  clearData()
    .then(result => callback(null, result))
    .catch(err => callback(err));
}

// Legacy placeholder for backwards compat
function callbackLegacy(a, b) {
    recordHolder = b;
}

module.exports = {
  // Primary Promise-based API (recommended)
  initializeDB,
  getData,
  putData,
  deleteData,
  getManyData,
  searchData,
  listKeys,
  batchData,
  clearData,
  
  // Advanced functions
  chainedBatch,
  iterator,
  keyIterator,
  valueIterator,
  sublevel,
  
  // Backwards compatibility wrappers (deprecated - will be removed in future versions)
  getDataPromise: getData,        // Old name -> new function
  putDataPromise: putData,        // Old name -> new function
  getDataLegacy,                   // Old callback API
  putDataLegacy,                   // Old callback API
  deleteDataLegacy,                // Old callback API
  getManyLegacy,                   // Old callback API
  batchLegacy,                     // Old callback API
  listKeysLegacy,                  // Old callback API
  searchDataLegacy,                // Old callback API
  clearLegacy,                     // Old callback API
  
  // Legacy aliases for old code (will be removed)
  simpleGetData: getData,          // Old name -> new function
  simplePutData: putData,          // Old name -> new function
  getMany: getManyData,            // Old name -> new function
  batch: batchData,                // Old name -> new function
  clear: clearData,                // Old name -> new function
  callback: callbackLegacy,        // Old name -> new function
};