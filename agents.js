//const { clear } = require('console');
const fs = require('fs');
//const { ignore } = require('nodemon/lib/rules');
const filePath = './data/agent-config.json';
//const agentConfig = loadConfigJson(filePath);
var agentStatusDict={};


function reset()
{
  for (const [key, value] of Object.entries(agentStatusDict)) {
    value.status="offline";
  }

}

function init(){
  logger.info("Loading and Initializing Agent Configuration File");
  try {
    var data = fs.readFileSync(filePath, 'utf8')
  } catch(err) {
    logger.error("Error getting/reading agent config file",err);
    return;
  }

  try {
    const jsonData = JSON.parse(data);      
    agentStatusDict = jsonData;
    reset();
  } catch (err) {
    logger.error('Error parsing JSON:', error); 
  }
}

//@deprecated
function initAsync(){
  logger.info("Loading and Initializing Agent Configuration File");
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      logger.error("Error getting agent config file",err);
      return;
    }
  
    try {
      const jsonData = JSON.parse(data);      
      agentStatusDict = jsonData;
      reset();
      //return jsonData;
    } catch (error) {
      logger.error('Error parsing JSON:', error);
    }
  });
  //return undefined;
}

function deleteAgent(name)
{
  logger.info(`Deleting Agent [${name}]`)
  delete agentStatusDict[name];
  updateConfig();
}


function registerAgent(name,description,command,imageurl,commsType,display){
  logger.info(`Registering Agent [${name}] Display [${description}]`);
  updateAgentStatus(name,"online",description,command,undefined,undefined,undefined,commsType,display);
}

function getDict()
{
  return agentStatusDict;
}

function addToAgentStatusDict(agentJson) {

  // Parse the JSON string
  var jsonData = JSON.parse(agentJson);
  //logger.message("Received: " + agentJson)
  //logger.message("Received: " + jsonData)
  logger.warn("Adding AGENT Status: " + agentJson);
  return addObjToAgentStatusDict(jsonData);
}

function addObjToAgentStatusDict(agentObj) {
  try {
    logger.info("Processing agent [" + agentObj.name + "] status [" +  agentObj.status + "]");  
    if(agentObj.status=="online")agentObj.isOnline="true";
    if(agentObj.status=="offline")agentObj.isOnline="false";
    if(agentObj.isOnline===undefined || agentObj.isOnline===null || agentObj.isOnline.length===0)agentObj.isOnline="UNKNOWN"
    agentStatusDict[agentObj.name] = agentObj;
    updateConfig();
  } 
  catch (error) {
    logger.error('Error parsing JSON:',error);
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
  addObjToAgentStatusDict(agent);
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

function updateConfig() {
  const tempFilePath = `${filePath}.tmp`; // Temporary file
  const backupFilePath = `${filePath}.backup`; // Backup file
  var agents = [];
  logger.info("Updating Agent Configuration File");

  for (const [key, value] of Object.entries(agentStatusDict)) {
    agents.push(value);
  }

  const updatedConfig = JSON.stringify(agentStatusDict, null, 2); // Convert object to JSON string with indentation

  try {
    // Create a backup of the existing file before overwriting
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, backupFilePath);  // Create a backup
      logger.debug('Backup created successfully.');
    }

    // Write to a temporary file first
    fs.writeFileSync(tempFilePath, updatedConfig, 'utf8');

    // Rename the temporary file to the original file path atomically
    fs.renameSync(tempFilePath, filePath);
    logger.debug('Config file updated successfully.');
  } catch (err) {
    logger.error('Error updating the config file:', err);
  }
}

module.exports = { init, getDict, addToAgentStatusDict,addObjToAgentStatusDict, getAgent,searchAgent, registerAgent, deleteAgent, updateAgentStatus,reset};