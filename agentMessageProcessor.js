const status_topic = 'backup/agent/status';
const command_topic = 'backup/agent/command';

function processMessage(topic, message,protocol) {
    logger.debug(`Received message on Protocol: '${protocol}' with topic '${topic}': ${message.toString()}`);
    var obj = JSON.parse(message);
    var agentKnown = agents.getAgent(obj.name);
    debugMessage(topic, obj, message, agentKnown);
  
    if(agentKnown){
      
      //Status Notification from Agent
      if (topic == "backup/agent/status" && obj.status == "notification") {
        logger.info("Received Notification From Agent:" + obj.name);
        try {
          logger.info(obj.data);
          var data = obj.data.split(".")[1];
          logger.info(data);
          var decodedString = Buffer.from(data, 'base64').toString('utf-8');
          logger.debug(decodedString);
          var dataObj = JSON.parse(decodedString);
          if(serverConfig.server.jobFailEnabled=="true")notifier.sendNotification(`Error from Agent: ${obj.name}`, `Error Notification From Agent: ${obj.name}`, obj.description + ": data [" + decodedString + "]", "ERROR", `/agentHistory.html?name=${obj.name}`);
        }
        catch (error) {
          if(serverConfig.server.jobFailEnabled=="true")notifier.sendNotification(`Error from Agent: ${obj.name}`, `Error Notification From Agent: ${obj.name}`, obj.description + ": data [" + decodedString + "]", "ERROR", `/agentHistory.html?name=${obj.name}`);
        }
      }
  
      //Known agent registering
      if (topic == "backup/agent/status" && obj.status == "register") {
        agents.updateAgentStatus(obj.name, "online", "Agent Back Online",null,null,null,message,protocol);
      }
  
      //known agent going Offline
      if (topic == "backup/agent/status" && obj.status == "offline") {
        agents.updateAgentStatus(obj.name, obj.status, obj.description,null,null,null,message,protocol);
      }
  
      //known agent running status
      if (topic == "backup/agent/status" && obj.status == "running") {
        logger.debug(">>>>>> RUNNING\n" + JSON.stringify(obj));
        agents.updateAgentStatus(obj.name, obj.status, obj.description, null,obj.jobName, new Date(),message,protocol);
        var item = running.createItem(obj.jobName, obj.lastStatusReport,obj.manual);   
        running.add(item);
      }
  
      //Ping response received
      if (topic == "backup/agent/status" && obj.status == "pong") {
        logger.debug("PONG RECEIVED: " + obj.status);
        logger.debug("AGENT STATUS: " + agents.getAgent(obj.name).status);
        logger.debug("--------------------------------------");
        agentStats.add(obj.name,obj.data);
        logger.debug("--------------------------------------");
        if (agents.getAgent(obj.name).status != "running") {
          agents.updateAgentStatus(obj.name, "online", "Ping response returned",null,null,null,message,protocol);
          thresholdJobs.checkExecuteThresholdJob(obj.name,message);
        }
        else {
          agents.updateAgentStatus(obj.name, "running", "Ping response returned",null,null,null,message,protocol);
          logger.info(`Job [${obj.name}] Skipping request as job in progress")`);
        }
  
      }
  
      //Log submission received
      if (topic = "backup/agent/status" && obj.status == "log_submission" ) {
        logger.info("Received Log event");
        //add log to db
        //console.log("Received log event");
        updateLogRecord(obj);
      }
  
      //ETA Submission received
      if (topic = "backup/agent/status" && obj.status == "eta_submission" ) {
        var runTime = obj.eta;
        var runningItm = running.getItemByName(obj.jobName);
        var startTime = runningItm.startTime;
        logger.info("Received ETA event");
        //add log to db
        if (obj.returnCode !== null && obj.returnCode == "0") {
          //Success run
        }
        else {
          var body = "";
          body += "Job Name     : " + obj.jobName;
          body += "\n---------------------------------------------------------";
          body += "\nStart Time   : " + startTime;
          body += "\nIs Manual    : " + obj.manual;
          body += "\nAgent        : " + obj.name;
          body += "\nTime Running : " + obj.eta;
          body += "\nReturn Code  : " + obj.returnCode;

          if(serverConfig.server.jobFailEnabled=="true")notifier.sendNotification(obj.jobName + "- job failed", JSON.stringify(obj), "WARNING", "/history.html");
        }
        logger.warn("GOING TO ADD HIST RECORD FOR: " + JSON.stringify(obj));
        updateStatusRecords(obj, startTime);
        running.removeItem(obj.jobName);
        agents.updateAgentStatus(obj.name, "online", `Job [${obj.name}] completed`,null,null,null,message,protocol,null);
      }
    }
    else {
      //Register an unknown agent
      if (topic == "backup/agent/status" && obj.status == "register") {
        agents.addObjToAgentStatusDict(obj);
        webSocketBrowser.emitNotification('register', `${message.toString()}`);
      }
  
    }
  }
  
  function debugMessage(topic, obj, message, agentKnown) {
    logger.debug("+------------------+");
    logger.debug("| AGENT MESSAGE    |");
    logger.debug("+------------------+");
    logger.debug("Topic   [" + topic + "]");
    logger.debug("Name    [" + obj.name + "]");
    logger.debug("Status  [" + obj.status + "]");
    logger.debug("Message [" + message + "]");
  
    if (!agentKnown) {
      logger.debug("Agent   [" + obj.name + "] is NEW!");
    }
  }
  

  //Update log record
  function updateLogRecord(obj){
    var key = getDbKey(obj,"log");
    var value;
    db.getData(key, (err, data) => {
      if (err) {
        //logger.warn(`Key [${key}] does not exist`);
        //logger.warn(err);
  
        //Doesn't exist so adding to the db
        db.putData(key, obj.data, (err, result) => {
          if (err) {
            logger.error(`unable to add [${key}] to DB`);
            logger.error(err);
          } else {
            logger.debug(`Data created successfully for Key [${key}] Data \n${obj.data}`);
          }
        });
  
      } else {
        logger.debug('Retrieved data:', data);
        data+=obj.data;
        db.putData(key, data, (err, result) => {
          if (err) {
            logger.error(`unable to add [${key}] to DB`);
            logger.error('Error:', err);
          } else {
            logger.debug(`Data upadated successfully Key [${key}] Data \n${data}`);
          }
        });
  
  
      }
    });
  }

  function updateStatusRecords(obj,startDate){
    var key = getDbKey(obj,"stats");
    var stats={};
    stats.current={};
    stats.previous={};
    if(startDate===undefined||startDate===null)startDate=obj.lastStatusReport;
    stats.current.lastRun = new Date(obj.lastStatusReport);
    stats.current.eta = (obj.eta)
    stats.previous.lastRun = new Date(obj.lastStatusReport);
    stats.previous.eta = (obj.eta)
    stats.etaRollingAvg = (obj.eta).toFixed(0);
    stats.current.returnCode = obj.returnCode;
    stats.previous.returnCode = obj.returnCode;
  
    db.getData(key, (err, data) => {
      if (err) {
        //logger.warn(`Stats Key [${key}] does not exist`);
        //logger.debug(err);
  
        //Doesn't exist so adding to the db
        db.putData(key, stats, (err, result) => {
          if (err) {
            logger.error(`unable to add stats [${key}] to DB`);
            logger.error('Error:', err);
          } else {
            logger.debug(`Stats Data created successfully for Key [${key}] Data \n${obj.data}`);
            addHistoryRecord(obj,startDate);
          }
        });
  
      } else {
        logger.debug('Retrieved data:', data);
        logger.debug('Moving last stats data to previous');
        stats.previous.eta = data.current.eta;
        stats.previous.lastRun = data.current.lastRun;
        stats.previous.returnCode = data.current.returnCode;
        //Now calculate the moving average
        logger.debug(`Previous ETA: ${stats.previous.eta}`);
        logger.debug(`Current ETA: ${stats.current.eta}`);
        var average = ((parseFloat(stats.previous.eta) + parseFloat(stats.current.eta))/2).toFixed(0);
        logger.debug(`Average ETA: ${average}`);
        stats.etaRollingAvg = average;
  
        db.putData(key, stats, (err, result) => {
          if (err) {
            logger.error(`unable to add stats [${key}] to DB`);
            logger.error('Error:', err);
          } else {
            logger.debug(`Data upadated successfully Key [${key}] Data \n${data}`);
            addHistoryRecord(obj,startDate);
          }
        });
  
  
      }
    });
  }
  
  async function addHistoryRecord(obj,startDate)
  {
    logger.info("adding history record");
    var key1 = getDbKey(obj,"stats");
    var key2 = getDbKey(obj,"log");
    var stats = null;
    var log = null;
    try {
        stats = await db.simpleGetData(key1);
        log = await db.simpleGetData(key2);
        var histObj = hist.createHistoryItem(obj.jobName,startDate,stats.current.returnCode,stats.current.eta,log,obj.manual);
        logger.debug("Adding History obj: " + JSON.stringify(histObj));
        hist.add(histObj);
    }
    catch(err){
        logger.warn("Unable to find stats/log data");
        logger.warn(JSON.stringify(err));
        logger.log("Creating a blank history item");
        var histObj = hist.createHistoryItem(obj.jobName,new Date(),9999,0,"");
        logger.debug("Adding blank History obj: " + JSON.stringify(histObj));
        hist.add(histObj);

    }
  }

  //Get a db key
  function getDbKey(logEvent,type)
  {
    return logEvent.name + "_" + logEvent.jobName + "_" + type;
  }


  module.exports = { updateLogRecord, processMessage }