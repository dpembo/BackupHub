//const { clear } = require('console');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
//const { ignore } = require('nodemon/lib/rules');
const filePath = './data/agent-config.json';
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

async function init() {
  try {
    logger.info("Loading and Initializing Agent Configuration File");
    const data = await fsPromises.readFile(filePath, 'utf8');
    const jsonData = JSON.parse(data);
    agentStatusDict = jsonData;
    reset();
    logger.info(`Loaded ${Object.keys(agentStatusDict).length} agents from configuration`);
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
  // Use unique temp file to prevent race conditions with concurrent writes
  const uniqueSuffix = `${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;
  const tempFilePath = `${filePath}.${uniqueSuffix}.tmp`;
  const backupFilePath = `${filePath}.backup`;
  const dataDir = path.dirname(filePath);
  
  try {
    logger.debug("Writing Agent Configuration File to disk");

    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      await fsPromises.mkdir(dataDir, { recursive: true });
      logger.debug(`Created directory: ${dataDir}`);
    }

    const updatedConfig = JSON.stringify(agentStatusDict, null, 2);

    // Create a backup of the existing file before overwriting (using sync for backup)
    if (fs.existsSync(filePath)) {
      try {
        fs.copyFileSync(filePath, backupFilePath);
        logger.debug('Backup created successfully.');
      } catch (err) {
        logger.warn(`Could not create backup: ${err.message}`);
      }
    }

    // Write to a temporary file first (unique to prevent race conditions)
    await fsPromises.writeFile(tempFilePath, updatedConfig, 'utf8');

    // Rename the temporary file to the original file path atomically
    await fsPromises.rename(tempFilePath, filePath);
    logger.info('Agent config file updated successfully.');
  } catch (err) {
    logger.error('Error updating the agent config file:', err.message);
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

module.exports = { init, getDict, addToAgentStatusDict,addObjToAgentStatusDict, getAgent,searchAgent, registerAgent, deleteAgent, updateAgentStatus,reset};