const status_topic = 'backup/agent/status';
const command_topic = 'backup/agent/command';

async function processMessage(topic, message,protocol) {
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
        agentStats.set(obj.name,obj.data);
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
      if (obj.status == "log_submission") {
        logger.info("Received Log event");
        //add log to db
        //console.log("Received log event");
        updateLogRecord(obj).catch(err => logger.error('Failed to update log record:', err.message));
      }
  
      //ETA Submission received
      if (obj.status == "eta_submission") {
        var runTime = obj.eta;
        var runningItm = running.getItemByName(obj.jobName);
        var startTime = runningItm ? runningItm.startTime : null;
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
        logger.debug("Adding History record for: " + JSON.stringify(obj));
        
        // Signal orchestration engine if this is an orchestration job
        if (obj.jobName && obj.jobName.includes('Orchestration [')) {
          try {
            logger.debug(`[ORCHESTRATION] Received eta_submission for orchestration job [${obj.jobName}]`);
            const orchestrationEngine = require('./orchestrationEngine.js');
            
            // Fetch the log from database using the same key structure as updateLogRecord
            let logOutput = '';
            try {
              const logKey = `${obj.name}_${obj.jobName}_log`;
              logger.debug(`[ORCHESTRATION] Fetching log with key: [${logKey}]`);
              const logData = await db.getData(logKey);
              logOutput = logData || '';
              logger.debug(`[ORCHESTRATION] Fetched log (${logOutput.length} bytes) for job [${obj.jobName}]`);
              logger.debug(`[ORCHESTRATION] Log content first 100 chars: ${logOutput.substring(0, 100)}`);
              
              // Clear the log from the database to prevent mixing with future runs if same job ID is reused
              try {
                await db.deleteData(logKey);
                logger.debug(`[ORCHESTRATION] Cleared log data for key [${logKey}]`);
              } catch (deleteErr) {
                logger.debug(`[ORCHESTRATION] Could not clear log (non-critical): ${deleteErr.message}`);
              }
            } catch (logErr) {
              logger.debug(`[ORCHESTRATION] No log data found for job [${obj.jobName}]: ${logErr.message}`);
            }
            
            orchestrationEngine.signalScriptCompletion(obj.jobName, {
              exitCode: parseInt(obj.returnCode || 0),
              stdout: logOutput,
              stderr: ''
            });
            logger.debug(`[ORCHESTRATION] Signaled orchestration completion for job [${obj.jobName}]`);
          } catch (err) {
            logger.error(`[ORCHESTRATION] Failed to signal orchestration completion: ${err.message}`);
          }
        }
        
        updateStatusRecords(obj, startTime);
        running.removeItem(obj.jobName);
        agents.updateAgentStatus(obj.name, "online", `Job [${obj.name}] completed`,null,null,null,message,protocol,null);
        
        // Emit schedule update to notify frontend that job completed (skip for orchestration jobs)
        if (!obj.jobName || !obj.jobName.includes('Orchestration [')) {
          emitScheduleUpdate(obj.jobName);
        }
      }
    }
    else {
      //Register an unknown agent
      if (topic == "backup/agent/status" && obj.status == "register") {
        agents.addObjToAgentStatusDict(obj).catch(err => {
          logger.error(`Failed to register unknown agent [${obj.name}]:`, err.message);
        });
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
  async function updateLogRecord(obj){
    var key = getDbKey(obj,"log");
    var value;
   
    var data;
    var resp;
    try{
      data = await db.simpleGetData(key);
    }
    catch (error){
      //If item doesn't exist add to DB
      if (error.message.includes('NotFoundError')){
        try {
            logger.debug(`No Log record found - creating with key [${key}]`);
            resp = await db.simplePutData(key,obj.data);
            logger.debug(`Data created successfully for Key [${key}], Response [${resp}], Data \n${obj.data}`);
            if (!obj.jobName || !obj.jobName.includes('Orchestration [')) {
              emitScheduleLogUpdate(obj.jobName, obj.data);
            } else {
              emitOrchestrationNodeLogUpdate(obj.jobName, obj.data);
            }
        }
        catch (insertErr){
          logger.error(`Unknown Issue creating new entry for key [${key}] to DB`);
          logger.error(insertErr);
          throw insertErr;
        }
      }
      else{
        logger.error(`Unknown Issue searching DB for key [${key}]`);
        logger.error(error);
        throw insertErr;
      }
    }

    if(data!==undefined){
      logger.debug('Retrieved data:', data);
      data+=obj.data;
      try{
        logger.debug(``)
        resp = await db.simplePutData(key,data);
        logger.debug(`Data upadated successfully Key [${key}], Response [${resp}], Data \n${data}`);
        if (!obj.jobName || !obj.jobName.includes('Orchestration [')) {
          emitScheduleLogUpdate(obj.jobName, data);
        } else {
          emitOrchestrationNodeLogUpdate(obj.jobName, data);
        }
      }
      catch (error){
        logger.error(`unable to add [${key}] to DB`);
        logger.error(error);
        throw error;
      }
    }

  }

  function emitOrchestrationNodeLogUpdate(jobName, logData) {
    try {
      // jobName format: "Orchestration [jobId] Node [nodeId]"
      const match = jobName.match(/^Orchestration\s+\[(.+?)\]\s+Node\s+\[(.+?)\]/);
      if (!match) return;
      const jobId = match[1];
      const nodeId = match[2];
      const orchestrationEngine = require('./orchestrationEngine.js');
      const executionId = orchestrationEngine.activeOrchestrationExecutions[jobId];
      if (!executionId) return;
      const wsBrowserTransport = require('./communications/wsBrowserTransport.js');
      const io = wsBrowserTransport.getIO();
      if (io) {
        const eventName = `orchestrationNodeLog:${jobId}:${executionId}:${nodeId}`;
        io.emit(eventName, { nodeId, log: logData });
        logger.debug(`[emitOrchestrationNodeLogUpdate] Emitted ${eventName} (${logData.length} bytes)`);
      }
    } catch (error) {
      logger.debug(`[emitOrchestrationNodeLogUpdate] Error: ${error.message}`);
    }
  }

  function emitScheduleLogUpdate(jobName, logData) {
    try {
      var scheduleIndex = scheduler.getScheduleIndex(jobName);
      logger.debug(`[emitScheduleLogUpdate] jobName: ${jobName}, scheduleIndex: ${scheduleIndex}`);
      
      if (scheduleIndex !== undefined && scheduleIndex !== null && scheduleIndex >= 0) {
        // Use lazy loading to get the socket.io instance at runtime, avoiding initialization order issues
        var wsBrowserTransport = require('./communications/wsBrowserTransport.js');
        var io = wsBrowserTransport.getIO();
        
        if (io) {
          logger.debug(`[emitScheduleLogUpdate] Emitting scheduleLog:${scheduleIndex}`);
          io.emit(`scheduleLog:${scheduleIndex}`, { log: logData });
        } else {
          logger.warn(`[emitScheduleLogUpdate] Socket.io instance not available yet`);
        }
      } else {
        logger.warn(`[emitScheduleLogUpdate] Invalid scheduleIndex: ${scheduleIndex} for jobName: ${jobName}`);
      }
    } catch (error) {
      logger.debug(`[emitScheduleLogUpdate] Error emitting schedule log update: ${error.message}`);
    }
  }

  async function emitScheduleUpdate(jobName) {
    try {
      var scheduleIndex = scheduler.getScheduleIndex(jobName);
      logger.debug(`[emitScheduleUpdate] jobName: ${jobName}, scheduleIndex: ${scheduleIndex}`);
      
      if (scheduleIndex !== undefined && scheduleIndex !== null && scheduleIndex >= 0) {
        // Gather schedule data to emit
        var schedule = scheduler.getSchedules(scheduleIndex);
        var agentData = agents.getAgent(schedule.agent);
        
        // Get stats and log from database
        var key1 = schedule.agent + "_" + schedule.jobName + "_" + "stats";
        var key2 = schedule.agent + "_" + schedule.jobName + "_" + "log";
        
        var stats = null;
        var log = null;
        try {
          stats = await db.getData(key1);
        } catch(err) {
          logger.warn(`[emitScheduleUpdate] Unable to find stats data for ${key1}`);
        }
        
        try {
          log = await db.getData(key2);
        } catch(err) {
          logger.warn(`[emitScheduleUpdate] Unable to find log data for ${key2}`);
        }
        
        // Get history data
        var histLastRun = hist.getLastRun(schedule.jobName);
        var histAvgRuntime = hist.getAverageRuntime(schedule.jobName);
        
        // Build response data matching scheduleInfo.ejs expectations
        var data = {
          agent: agentData,
          schedule: schedule,
          index: scheduleIndex,
          stats: stats,
          log: log,
          hist: {
            histLastRun: histLastRun,
            histAvgRuntime: histAvgRuntime,
            histAvgRuntimeSecs: dateTimeUtils.displaySecs(histAvgRuntime)
          }
        };
        
        // Emit the update
        var wsBrowserTransport = require('./communications/wsBrowserTransport.js');
        var io = wsBrowserTransport.getIO();
        
        if (io) {
          logger.debug(`[emitScheduleUpdate] Emitting scheduleUpdate:${scheduleIndex}`);
          io.emit(`scheduleUpdate:${scheduleIndex}`, data);
        } else {
          logger.warn(`[emitScheduleUpdate] Socket.io instance not available yet`);
        }
      } else {
        logger.warn(`[emitScheduleUpdate] Invalid scheduleIndex: ${scheduleIndex} for jobName: ${jobName}`);
      }
    } catch (error) {
      logger.error(`[emitScheduleUpdate] Error emitting schedule update: ${error.message}`);
    }
  }

  async function updateStatusRecords(obj,startDate){
    logger.debug("Updating status records");
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
  
    
    //------------------

    var data;
    var resp;
    try{
      data = await db.simpleGetData(key);
    }
    catch (error){
      //If item doesn't exist add to DB
      if (error.message.includes('NotFoundError')){
        try {
            logger.debug(`No stats record found - creating with key [${key}]`);
            resp = await db.simplePutData(key,stats);
            logger.debug(`stats data created successfully for Key [${key}], Response [${resp}], Data \n${obj.data}`);
            addHistoryRecord(obj,startDate);
        }
        catch (insertErr){
          logger.error(`Unknown Issue creating new stats entry for key [${key}] to DB`);
          logger.error(insertErr);
          throw insertErr;
        }
      }
      else{
        logger.error(`Unknown Issue searching DB for key [${key}]`);
        logger.error(error);
        throw insertErr;
      }
    }

    //Reord already exsits
    if(data!==undefined){
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

      //Now updating
      try {
        logger.debug(`Updating stats record with key [${key}], data [${data}]`);
        resp = await db.simplePutData(key,stats);
        logger.debug(`stats data updated successfully for Key [${key}], Response [${resp}], Data \n${obj.data}`);
        addHistoryRecord(obj,startDate);
      }
      catch (insertErr){
        logger.error(`Unknown Issue creating new stats entry for key [${key}] to DB`);
        logger.error(insertErr);
        throw insertErr;
      }
    }
  }
  
  async function addHistoryRecord(obj,startDate)
  {
    logger.error("adding history record");
    logger.debug(obj);
    var key1 = getDbKey(obj,"stats");
    var key2 = getDbKey(obj,"log");
    var stats = null;
    var log = null;
    
    // Extract executionId for orchestration nodes
    let executionId = null;
    const orchestrationMatch = obj.jobName.match(/^Orchestration\s+\[(.+?)\]\s+Node/);
    if (orchestrationMatch) {
      try {
        const orchestrationEngine = require('./orchestrationEngine.js');
        const jobId = orchestrationMatch[1];
        executionId = orchestrationEngine.activeOrchestrationExecutions[jobId] || null;
      } catch (err) {
        logger.debug(`[ORCHESTRATION] Unable to get executionId: ${err.message}`);
      }
    }
    
    try {
        stats = await db.simpleGetData(key1);
        log = await db.simpleGetData(key2);
        var histObj = hist.createHistoryItem(obj.jobName,startDate,stats.current.returnCode,stats.current.eta,log,obj.manual,executionId);
        logger.debug("Adding History obj: " + JSON.stringify(histObj));
        hist.add(histObj);
    }
    catch(err){
        logger.debug("Unable to find stats/log data");
        logger.debug(JSON.stringify(err));
        logger.debug("Creating a blank history item");
        var histObj = hist.createHistoryItem(obj.jobName,new Date(),9999,0,"",false,executionId);
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