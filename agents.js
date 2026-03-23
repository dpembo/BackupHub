//const { clear } = require('console');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
//const { ignore } = require('nodemon/lib/rules');
const db = require('./db.js');
const filePath = './data/agent-config.json';
const DB_KEY = 'AGENTS_CONFIG';
//const agentConfig = loadConfigJson(filePath);
var agentStatusDict = {};
const { handleError, AppError } = require('./utils/errorHandler.js');

// Debounce timer for config writes (prevents excessive disk writes)
let configWriteTimer = null;
const CONFIG_WRITE_DELAY = 50; // ms - batch writes within 50ms


function reset() {
  for (const [key, value] of Object.entries(agentStatusDict)) {
    value.status = "offline";
  }
}

/**
 * Migrate agent config from JSON file to database
 * Checks if the JSON file exists, and if so, migrates all agents to the database
 * and deletes the file after successful migration
 */
async function migrateAgentConfigToDatabase() {
  try {
    // Check if the JSON file exists
    if (!fs.existsSync(filePath)) {
      logger.info("Agent config JSON file not found - no migration needed");
      return false;
    }

    logger.info("Found agent config JSON file, starting migration to database...");
    
    // Read the JSON file
    const data = await fsPromises.readFile(filePath, 'utf8');
    const jsonData = JSON.parse(data);
    const agentCount = Object.keys(jsonData).length;

    if (agentCount === 0) {
      logger.info("Agent config file is empty, deleting file");
      await fsPromises.unlink(filePath);
      return false;
    }

    // Migrate all agents to database
    await db.putData(DB_KEY, jsonData);
    logger.info(`Successfully migrated ${agentCount} agents to database`);

    // Delete the JSON file after successful migration
    await fsPromises.unlink(filePath);
    logger.info("Agent config JSON file deleted after successful migration");
    
    return true;
  } catch (err) {
    logger.error(`Error during agent config migration: ${err.message}`);
    throw new AppError(`Failed to migrate agent config: ${err.message}`, 500);
  }
}

async function init() {
  try {
    logger.info("Initializing Agent Configuration");
    
    // Attempt automatic migration from JSON file to database
    const migrated = await migrateAgentConfigToDatabase();

    // Load agents from database
    try {
      const data = await db.getData(DB_KEY);
      agentStatusDict = data || {};
      reset();
      logger.info(`Loaded ${Object.keys(agentStatusDict).length} agents from database${migrated ? ' (after migration)' : ''}`);
    } catch (err) {
      if (err.message && err.message.includes('NotFoundError')) {
        logger.info("No agent config found in database, starting with empty config");
        agentStatusDict = {};
      } else {
        throw err;
      }
    }
  } catch (err) {
    logger.error("Error initializing agent config:", err.message);
    agentStatusDict = {};
  }
}

function deleteAgent(name) {
  logger.info(`Deleting Agent [${name}]`);
  delete agentStatusDict[name];
  return debouncedUpdateConfig();
}

function registerAgent(name, description, command, imageurl, commsType, display) {
  logger.info(`Registering Agent [${name}] Display [${description}]`);
  
  // Create the agent if it doesn't exist
  let agent = getAgent(name);
  if (agent === undefined) {
    agent = {
      name: name,
      status: 'online',
      description: description,
      command: command,
      commsType: commsType,
      display: display,
      lastStatusReport: new Date().toISOString(),
      isOnline: 'true',
    };
    agentStatusDict[name] = agent;
    // Persist the new agent to config
    debouncedUpdateConfig().catch(err => {
      logger.error(`Failed to persist new agent [${name}]:`, err.message);
    });
  } else {
    // Agent exists, update it using the existing function
    updateAgentStatus(name, "online", description, command, undefined, undefined, undefined, commsType, display);
  }
}

function getDict() {
  return agentStatusDict;
}

async function addToAgentStatusDict(agentJson) {
  try {
    // Parse the JSON string
    var jsonData = JSON.parse(agentJson);
    logger.warn("Adding AGENT Status: " + agentJson);
    return await addObjToAgentStatusDict(jsonData);
  } catch (error) {
    logger.error('Error parsing JSON:', error);
    throw new AppError(`Failed to parse agent JSON: ${error.message}`, 400);
  }
}

async function addObjToAgentStatusDict(agentObj) {
  try {
    logger.info("Processing agent [" + agentObj.name + "] status [" + agentObj.status + "]");
    if (agentObj.status == "online") agentObj.isOnline = "true";
    if (agentObj.status == "offline") agentObj.isOnline = "false";
    if (agentObj.isOnline === undefined || agentObj.isOnline === null || agentObj.isOnline.length === 0) agentObj.isOnline = "UNKNOWN"
    agentStatusDict[agentObj.name] = agentObj;
    return await debouncedUpdateConfig();
  } catch (error) {
    logger.error('Error processing agent object:', error);
    throw new AppError(`Failed to process agent object: ${error.message}`, 500);
  }
}

function updateAgentStatus(inAgentName,status,description,command,jobName,dateTime,message,commsType,display)
{
  logger.info(`Updating Agent [${inAgentName}] Display [${display}] Description [${description}] Status [${status}] command [${command}] commsType [${commsType}]`);
  logger.debug('Message : ' + message);
  var agent = getAgent(inAgentName);
  if(agent===undefined){
    logger.warn(`Unknown Agent [${inAgentName}] connected but not found`);
    return;
  }

  if(commsType===undefined||commsType===null)commsType=agent.commsType;
  
  var date = new Date();
  var updated = date.toISOString();
  agent.lastStatusReport = updated;
  if(commsType!==undefined)agent.commsType = commsType;
  if(display!==undefined)agent.display = display;
  if(status=="running" && dateTime!==undefined && dateTime!==null)agent.jobStarted=dateTime;
  agent.status = status;
  if(description!==undefined && description!==null)agent.description=description;
  if(command!==undefined && command!==null)agent.command=command;
  if(jobName!==undefined && jobName!==null)agent.jobName=jobName;
  if(message!==undefined && message!==null)agent.message=message;
  
  /*switch(String(status)){
    case "offline":
      break;
    
    case "online":
      break
  }*/
  agentHistory.addStatus(agent.name,date,status,agent.jobName);
  addObjToAgentStatusDict(agent).catch(err => {
    logger.error(`Failed to update agent config after status update for [${agent.name}]:`, err.message);
  });
  //updateConfig();
}  

function searchAgent(inAgentName){
  for (const [key, value] of Object.entries(agentStatusDict)) {
    logger.debug("[" + key + "]" + ":" + JSON.stringify(value));
    logger.debug(`Checking Key [${key}] with [${inAgentName}]`);
    if(key===inAgentName){
      //console.log("Found");
      return value;
    }
  }
}

function getAgent(inAgentName)
{
    logger.debug("Getting Agent: [" + inAgentName + "]");
    var agent = agentStatusDict[inAgentName];
    logger.debug(agent);
    return agent;
}

/** Get an agent object */
function createAgentObject(name, server, description, command, status, lastStatusReport)
{
  var agent={};
  agent.name = name;
  agent.server = server;
  agent.description = description;
  agent.command = command;
  agent.status = status;
  agent.lastStatusReport = lastStatusReport;
  return agent;
}

async function updateConfig() {
  try {
    logger.debug("Writing Agent Configuration to database");
    
    // Store the entire agentStatusDict to the database
    await db.putData(DB_KEY, agentStatusDict);
    logger.debug('Agent config stored to database successfully');
  } catch (err) {
    logger.error('Error updating agent config:', err.message);
    throw new AppError(`Failed to update agent config: ${err.message}`, 500);
  }
}

/**
 * Debounced config write - batches multiple writes within CONFIG_WRITE_DELAY ms
 * @returns {Promise} Resolves when write completes
 */
function debouncedUpdateConfig() {
  return new Promise((resolve, reject) => {
    // Clear any pending write timer
    if (configWriteTimer) {
      clearTimeout(configWriteTimer);
    }

    // Set new timer to write after delay
    configWriteTimer = setTimeout(async () => {
      try {
        await updateConfig();
        resolve();
      } catch (err) {
        reject(err);
      }
    }, CONFIG_WRITE_DELAY);
  });
}

/**
 * Update an agent's network address (IP or hostname)
 * Used for server restart notifications
 */
function updateAgentAddress(agentName, address) {
  try {
    const agent = getAgent(agentName);
    if (agent === undefined) {
      logger.warn(`Cannot update address for unknown agent [${agentName}]`);
      return;
    }
    agent.address = address;
    logger.debug(`Updated agent [${agentName}] address to [${address}]`);
    // Persist the update
    debouncedUpdateConfig().catch(err => {
      logger.error(`Failed to persist address update for agent [${agentName}]:`, err.message);
    });
  } catch (err) {
    logger.error(`Error updating agent address for [${agentName}]:`, err.message);
  }
}

module.exports = { init, getDict, addToAgentStatusDict,addObjToAgentStatusDict, getAgent,searchAgent, registerAgent, deleteAgent, updateAgentStatus, updateAgentAddress, reset};