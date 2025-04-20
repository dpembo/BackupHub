const { Level } = require('level')
var db;
var inDbPath;

// Initialize the LevelDB database
function initializeDB(dbPath) {
    db = new Level(dbPath, { valueEncoding: 'json' })
    inDbPath = dbPath;
}

// Function to store data in the database
function putData(key, value, callback) {
  logger.info(( `DB Storing in [${key}] value [${value}]`));
  db.put(key, value, (err) => {
    if (err) {
      callback(err);
    } else {
      callback(null, 'Data stored successfully.');
    }
  });
}

// Modify putData to return a Promise
function putDataPromise(key, value) {
  return new Promise((resolve, reject) => {
    logger.info(`DB Storing in [${key}] value [${value}]`);
    db.put(key, value, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve('Data stored successfully.');
      }
    });
  });
}

// Promise-based getData
function getData(key, callback) {
  logger.debug("In getData");
  logger.debug(`Attempting to get key [${key}]`);
  db.get(key, (err, value) => {
    logger.debug(`db.get callback invoked for key [${key}]`);
    if (err) {
      callback(err);
    } else {
      logger.debug(`Found item [${key}] value [${value}]`);
      callback(null, value);
    }
  });
}


async function getDataPromise(key) {
  logger.debug("In getDataPromise");
  try {
    logger.debug(`Attempting to get key [${key}]`);
    const value = await db.get(key);
    logger.debug(`Found item [${key}] value [${value}]`);
    if(value==undefined){
      throw new Error('NotFoundError: Item with key [' + key + '] not found');
    }
    return value;
  } catch (err) {
    logger.error(`Error fetching key [${key}]: ${err.message}`);
    throw err;
  }
}

// Function to delete data from the database
function deleteData(key, callback) {
  db.del(key, (err) => {
    if (err) {
      callback(err);
    } else {
      callback(null, 'Data deleted successfully.');
    }
  });
}

function callback(a,b) {
    recordHolder = b;
}

// Function to search for data based on a specific value
function searchData(searchValue, callback) {
  const results = [];

  db.createReadStream()
    .on('data', (data) => {
      if (data.value === searchValue) {
        results.push(data);
      }
    })
    .on('end', () => {
      callback(null, results);
    })
    .on('error', (err) => {
      callback(err);
    });
}

// Function to list all keys in the LevelDB database
function listKeys(callback) {
  const keys = [];

  db.createKeyStream()
    .on('data', (key) => {
      keys.push(key);
    })
    .on('end', () => {
      callback(null, keys);
    })
    .on('error', (err) => {
      callback(err);
    });
}

// Function to get many values based on an array of keys
function getMany(keys, callback) {
  const results = [];
  let count = 0;

  keys.forEach((key) => {
    db.get(key, (err, value) => {
      count++;
      if (!err) {
        results.push({ key, value });
      }

      if (count === keys.length) {
        callback(null, results);
      }
    });
  });
}

// Function to perform batch operations
function batch(operations, callback) {
  db.batch(operations, (err) => {
    if (err) {
      callback(err);
    } else {
      callback(null, 'Batch operation successful.');
    }
  });
}

// Function to perform chained batch operations
function chainedBatch() {
  return db.batch();
}

// Function to create an iterator for iterating over all entries in the database
function iterator(options) {
  return db.iterator(options);
}

// Function to create an iterator for iterating over keys in the database
function keyIterator() {
  return db.createKeyStream();
}

// Function to create an iterator for iterating over values in the database
function valueIterator() {
  return db.createValueStream();
}

// Function to clear the database
function clear(callback) {
    db.clear(undefined,callback)
}

// Function to create a sublevel
function sublevel(sublevelName) {
  return db.sublevel(sublevelName);
}

async function simpleGetData(key){
    logger.debug(`Fetching data from DB [${inDbPath}] with key [${key}]`)
    const value = await db.get(key)
    if(value===undefined||value===null){
      logger.error('NotFoundError: Item with key [' + key + '] not found');
      throw new Error('NotFoundError: Item with key [' + key + '] not found');
    }
    else return value;
}

async function simplePutData(key,value){
  logger.debug(`Putting data info  DB with key [${key}]`);
  const retvalue = await db.put(key, value)
  return retvalue;
}

module.exports = {
  initializeDB,
  putData,
  putDataPromise,
  getData,
  getDataPromise,
  deleteData,
  searchData,
  listKeys,
  getMany,
  batch,
  chainedBatch,
  iterator,
  keyIterator,
  valueIterator,
  clear,
  sublevel,
  callback,
  simpleGetData,
  simplePutData,
};