const scheduleFile = "./data/schedules.json";
const db = require('./db.js');
const DB_KEY = 'SCHEDULES_CONFIG';
var schedules = [];

var mqttClient;
var mqttCommand_topic;

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const dateTimeUtils = require('./utils/dateTimeUtils.js');
const asyncUtils = require('./utils/asyncUtils.js');
const { handleError, AppError } = require('./utils/errorHandler.js');

function checkExecutePermissionCapability(directoryPath) {
  try {
    // Check if you have write permissions on the directory
    fsSync.accessSync(directoryPath, fsSync.constants.W_OK);

    // Create a temporary file in the directory
    const tempFileName = '.tmp_permission_test';
    const tempFilePath = path.join(directoryPath, tempFileName);
    fsSync.writeFileSync(tempFilePath, 'Temporary file content', 'utf8');

    // Try to set execute permission on the temporary file
    fsSync.chmodSync(tempFilePath, '755');

    // Clean up by removing the temporary file
    fsSync.unlinkSync(tempFilePath);

    logger.info('Confirmed capabilities to set execute permissions on files in execute directory.');
  } catch (err) {
    logger.error('Error:', err);
    logger.error('You do not have capabilities to set execute permissions on files in the directory.');
    process.exit(1);
  }
}
// Initialize scheduler
async function init() {
  try {
    checkExecutePermissionCapability("/tmp");
    await readSchedules();
    await scheduleJobs();
    logger.info("Scheduler initialized successfully");
  } catch (err) {
    logger.error("Error initializing scheduler:", err.message);
  }
}

function publishExecute(agent_id, command, commandParams, jobName, isManual) {
  logger.info(`Executing Scheduled command on Agent [${agent_id}]`);
  agentComms.sendCommand(agent_id, mqttTransport.getCommandTopic(), command, commandParams, jobName, undefined, isManual);
}

/**
 * Migrate schedules from JSON file to database
 * Checks if the JSON file exists, and if so, migrates all schedules to the database
 * and deletes the file after successful migration
 */
async function migrateSchedulesToDatabase() {
  try {
    // Check if the JSON file exists
    if (!fsSync.existsSync(scheduleFile)) {
      logger.info("Schedules JSON file not found - no migration needed");
      return false;
    }

    logger.info("Found schedules JSON file, starting migration to database...");
    
    // Read the JSON file
    const data = await fs.readFile(scheduleFile, 'utf8');
    const jsonData = JSON.parse(data);
    const scheduleCount = Array.isArray(jsonData) ? jsonData.length : 0;

    if (scheduleCount === 0) {
      logger.info("Schedules file is empty, deleting file");
      await fs.unlink(scheduleFile);
      return false;
    }

    // Migrate all schedules to database
    await db.putData(DB_KEY, jsonData);
    logger.info(`Successfully migrated ${scheduleCount} schedules to database`);

    // Delete the JSON file after successful migration
    await fs.unlink(scheduleFile);
    logger.info("Schedules JSON file deleted after successful migration");
    
    return true;
  } catch (err) {
    logger.error(`Error during schedules migration: ${err.message}`);
    throw new AppError(`Failed to migrate schedules: ${err.message}`, 500);
  }
}

// Read schedules from the database
async function readSchedules() {
  try {
    logger.info("Loading Scheduler Data from database");
    
    // Attempt automatic migration from JSON file to database
    const migrated = await migrateSchedulesToDatabase();

    // Load schedules from database
    try {
      const data = await db.getData(DB_KEY);
      schedules = Array.isArray(data) ? data : [];
      logger.info(`Loaded ${schedules.length} schedules from database${migrated ? ' (after migration)' : ''}`);
    } catch (err) {
      if (err.message && err.message.includes('NotFoundError')) {
        logger.info("No schedules found in database, starting with empty config");
        schedules = [];
      } else {
        throw err;
      }
    }
  } catch (err) {
    logger.error('Error reading schedules:', err.message);
    schedules = [];
  }
}

// Write schedules to the database
async function writeSchedules() {
  try {
    logger.debug("Writing Schedules to database");
    
    // Store the schedules array to the database
    await db.putData(DB_KEY, schedules);
    logger.debug('Schedules stored to database successfully');
    await scheduleJobs();
  } catch (err) {
    logger.error('Error writing schedules:', err.message);
    throw new AppError(`Failed to save schedules: ${err.message}`, 500);
  }
}


function deleteSchedule(jobName) {
  logger.info(`Deleting Schedule with job name [${jobName}]`);
  var index = -1;
  for (var i = 0; i < schedules.length; i++) {
    if (schedules[i].jobName == jobName) {
      index = i;
      break;
    }
  }
  logger.debug(`Found job at index [${index}]`);
  if (index != -1) {
    return deleteScheduleAtIndex(index);
  }
  return Promise.resolve();
}

async function deleteScheduleAtIndex(index) {
  try {
    logger.info(`Deleting Schedule at index [${index}]`);
    if (index > -1) {
      var newArr = [];
      for (var i = 0; i < schedules.length; i++) {
        if (i != index) newArr.push(schedules[i]);
      }
      schedules = [];
      for (var i = 0; i < newArr.length; i++) {
        schedules.push(newArr[i]);
      }
      await writeSchedules();
      logger.info(`Schedule at index [${index}] deleted successfully`);
    }
  } catch (err) {
    logger.error(`Error deleting schedule at index [${index}]:`, err.message);
    throw err;
  }
}

function getScheduleIndex(jobName){
  for(var i=0;i<schedules.length;i++)
  {
      if(schedules[i].jobName==jobName)return i;
  }
  return -1;
}

function getSchedule(jobName){
    for(var i=0;i<schedules.length;i++)
    {
        if(schedules[i].jobName==jobName)
        {
            var schedule = schedules[i];
            schedule.nextRunDate = getNextRunDate(schedules[i]);
            return schedule;
        }
    }
    return null;
}

function getScheduleObject(jobName, colour, description, scheduleType, scheduleTime, dayOfWeek, dayInMonth, agentselect, agentcommand, commandparams, icon, scheduleMode, orchestrationId) {
    var schedule = {};
    schedule.jobName = jobName;
    schedule.description = description;
    schedule.scheduleType = scheduleType;
    schedule.dayOfWeek = dayOfWeek;
    schedule.dayInMonth = dayInMonth;
    schedule.scheduleTime = scheduleTime;
    schedule.eta = 1;
    schedule.color = colour;
    schedule.icon = icon;
    schedule.scheduleMode = scheduleMode || 'classic';  // Default to classic for backwards compatibility
    
    if (schedule.scheduleMode === 'classic') {
      schedule.command = agentcommand;
      schedule.commandParams = commandparams;
      schedule.agent = agentselect;
    } else if (schedule.scheduleMode === 'orchestration') {
      schedule.orchestrationId = orchestrationId;
      // Clear classic mode fields
      schedule.command = null;
      schedule.commandParams = null;
      schedule.agent = null;
    }
    
    return schedule;
}

function upsertSchedule(index, jobName, colour, description, scheduleType, scheduleTime, dayOfWeek, dayInMonth, agentselect, agentcommand, commandparams, icon, scheduleMode, orchestrationId) {
  return _upsertScheduleAsync(index, jobName, colour, description, scheduleType, scheduleTime, dayOfWeek, dayInMonth, agentselect, agentcommand, commandparams, icon, scheduleMode, orchestrationId);
}

async function _upsertScheduleAsync(index, jobName, colour, description, scheduleType, scheduleTime, dayOfWeek, dayInMonth, agentselect, agentcommand, commandparams, icon, scheduleMode, orchestrationId) {
  try {
    logger.debug("Upserting Schedule");

    var schedule = getScheduleObject(jobName, colour, description, scheduleType, scheduleTime, dayOfWeek, dayInMonth, agentselect, agentcommand, commandparams, icon, scheduleMode, orchestrationId);
    logger.info(JSON.stringify(schedule));
    schedule.lastUpdated = new Date().toISOString();

    if (index === undefined || index === null || index.length <= 0 || index == -1) {
      logger.info("Index is null - adding new schedule");
      if (schedules === undefined || schedules === null) schedules = [];
      schedules.push(schedule);
      logger.info("Number of schedules: " + schedules.length);
    } else {
      logger.info("Index defined: " + index);
      schedules[index] = schedule;
    }

    await writeSchedules();
    logger.info(`Schedule [${jobName}] upserted successfully`);
  } catch (err) {
    logger.error(`Error upserting schedule [${jobName}]:`, err.message);
    throw err;
  }
}


/*function addSchedule(schedule) {
    //Add the new schedule to the array and save
    schedules.push(schedule);
    writeSchedules();
}*/

function getNextRunDate(schedule) {
    //logger.debug(schedule);
    const now = new Date();     
    let nextRunDate;
    if (schedule.scheduleType === 'daily') {
      const [hours, minutes] = schedule.scheduleTime.split(':');
      nextRunDate = new Date(now);
      nextRunDate.setHours(hours, minutes, 0, 0);
  
      if (nextRunDate <= now) {
        nextRunDate.setDate(nextRunDate.getDate() + 1);
      }
    } else if (schedule.scheduleType === 'weekly') {
      const [hours, minutes] = schedule.scheduleTime.split(':');
      nextRunDate = new Date(now);
      const dayOfWeek = parseInt(schedule.dayOfWeek);
  
      if (dayOfWeek === nextRunDate.getDay()) {
        nextRunDate.setHours(hours, minutes, 0, 0);
  
        if (nextRunDate <= now) {
          nextRunDate.setDate(nextRunDate.getDate() + 7);
        }
      } else {
        nextRunDate.setDate(now.getDate() + ((dayOfWeek + 7 - now.getDay()) % 7));
        nextRunDate.setHours(hours, minutes, 0, 0);
      }
    } else if (schedule.scheduleType === 'monthly') {
      const [hours, minutes] = schedule.scheduleTime.split(':');
      nextRunDate = new Date(now);
      const dayInMonth = parseInt(schedule.dayInMonth);
  
      if (dayInMonth >= 1 && dayInMonth <= 31) {
        nextRunDate.setDate(dayInMonth);
        nextRunDate.setHours(hours, minutes, 0, 0);
  
        if (nextRunDate <= now) {
          nextRunDate.setMonth(nextRunDate.getMonth() + 1);
        }
      } else {
        throw new Error('Invalid dayInMonth value. It should be between 1 and 31.');
      }
    } else {
      logger.debug('Invalid scheduleType. Supported values are "daily", "weekly", or "monthly".');
      return "n/a";
    }
    return nextRunDate;
  }

  
  function displayFormatDate(inDate, future, targetTimeZone, format,addDelta) {
    var formattedDate;
    if (targetTimeZone !== undefined) {
        // Convert to target timezone and apply the provided format or default to ISO format
        formattedDate = moment.tz(inDate, targetTimeZone).format(format || 'YYYY-MM-DDTHH:mm:ss');
    } else {
        // Use the provided format or default to ISO without timezone adjustment
        formattedDate = format ? moment(inDate).format(format) : inDate.toISOString().split('.')[0];
    }
    
    var time = inDate.getTime();
    var nowDate = new Date().getTime();
    var delta;
    if (future === true) delta = time - nowDate;
    else delta = nowDate - time;
    delta = delta / 1000;
    const formattedDelta = dateTimeUtils.displaySecs(delta);

    if(addDelta!==undefined && addDelta == false ) return `${formattedDate}`;
    else return `${formattedDate} (${formattedDelta})`;
}

function getSchedules(index){
    if(index===undefined||index===null)
    {
        for(var i=0;i<schedules.length;i++){
            // Ensure scheduleMode defaults to 'classic' for backwards compatibility
            if (!schedules[i].scheduleMode) {
              schedules[i].scheduleMode = 'classic';
            }
            schedules[i].nextRunDate = displayFormatDate(new Date(getNextRunDate(schedules[i])),true,serverConfig.server.timezone,"YYYY-MM-DDTHH:mm:ss",true); 
             schedules[i].eta=hist.getAverageRuntime(schedules[i].jobName)/60;
            schedules[i].lastUpdated = displayFormatDate(new Date(schedules[i].lastUpdated),false,serverConfig.server.timezone,"YYYY-MM-DDTHH:mm:ss",false);

            //schedules[i].lastRun = displayFormatDate(new Date(schedules[i].lastRun),false); 


        }
        return schedules;
    }
    else
    {
        if(schedules[index]!==undefined && schedules[index]!==null){
          // Ensure scheduleMode defaults to 'classic' for backwards compatibility
          if (!schedules[index].scheduleMode) {
            schedules[index].scheduleMode = 'classic';
          }
          if(schedules[index].scheduleType=="daily"||schedules[index].scheduleType=="weekly"||schedules[index].scheduleType=="monthly"){
            schedules[index].nextRunDate = displayFormatDate(new Date(getNextRunDate(schedules[index])),true); 
          }
          else{
            schedules[index].nextRunDate = "n/a";
          }
        //schedules[index].lastRun = displayFormatDate(new Date(schedules[index].lastRun),false); 
        return schedules[index];
        }
        else return {};
    } 
}

function runUpdateJob(agentId,inCommandParams) {
  logger.info(`Running Update job`);
  var jobName = "||INTERNAL||Update " + agentId;
  var description = "Update Agent"
  var agent = agents.getAgent(agentId);
  db.deleteData(agentId + "_" + jobName + "_log").catch(err => 
    logger.debug(`No log entry to delete for job [${jobName}]`)
  );

  if(agent.status!="online")
  {
      var message=`Upgrade failed for agent[${agentId}] - not in the correct state [${agent.status}]`;
      var fullMessage=message + "\n\nData:\n" + JSON.stringify(agent);
      logger.error(message);
      if(serverConfig.server.jobFailEnabled=="true")notifier.sendNotification(`Upgrade Failed [${jobName}]`,message,"ERROR",`/scheduler.html?jobname=${jobName}`);
      var obj = hist.createHistoryItem(jobName,new Date().toISOString(),-1,0,fullMessage,true);
      hist.add(obj);
      return "error";
  }

  logger.info(`Command [${inCommandParams}]`)
  publishExecute(agentId,inCommandParams,"",jobName,"update");
  return "ok";    
}


// Run the job function
async function runJob(jobName, isManual, inData) {
  try {
    if (isManual === undefined) { isManual = false; }
    logger.info(`Running job: ${jobName}`);
    var schedItem = getSchedule(jobName);
    if (!schedItem) {
      throw new AppError(`Schedule item not found for job: ${jobName}`, 404);
    }

    logger.info(`Description: ${schedItem.description}`);
    logger.info(`Mode: ${isManual}`);

    // Handle orchestration schedules
    if (schedItem.scheduleMode === 'orchestration') {
      logger.info(`Running orchestration job [${jobName}] with orchestration ID [${schedItem.orchestrationId}]`);
      
      try {
        const orchestration = require('./orchestrationEngine.js');
        const executionLog = await orchestration.executeJob(schedItem.orchestrationId, isManual);
        await orchestration.saveExecutionResult(executionLog);
        
        logger.info(`Orchestration [${schedItem.orchestrationId}] execution completed with status [${executionLog.finalStatus}]`);
        return executionLog.finalStatus === 'success' ? 'ok' : 'error';
      } catch (err) {
        logger.error(`Error executing orchestration [${schedItem.orchestrationId}]:`, err.message);
        if (serverConfig.server.jobFailEnabled == "true") {
          notifier.sendNotification(
            `Orchestration execution failed [${jobName}]`,
            `Failed to execute orchestration: ${err.message}`,
            "ERROR",
            `/orchestrationList.html`
          );
        }
        return "error";
      }
    }

    // Handle classic schedules (script + agent)
    logger.info(`Agent: ${schedItem.agent}`);
    
    var agent = agents.getAgent(schedItem.agent);
    if (agent === undefined || agent === null) {
      var message = `Unable to execute job [${jobName}] agent[${schedItem.agent}] does not exist - please correct this job`;
      logger.error(message);
      if (serverConfig.server.jobFailEnabled == "true") {
        notifier.sendNotification(`Unable to execute job [${jobName}]`, message, "WARNING", `/scheduler.html?jobname=${jobName}`);
      }
      return "error";
    }

    // Delete old log entry
    try {
      await db.deleteData(schedItem.agent + "_" + jobName + "_log");
    } catch (err) {
      logger.debug(`No log entry to delete for job [${jobName}]`);
    }

    if (agent.status != "online") {
      var message = `Unable to execute job [${jobName}] agent[${schedItem.agent}] is not in the correct state [${agent.status}]`;
      var fullMessage = message + "\n\nData:\n" + JSON.stringify(agent);
      logger.error(message);
      if (serverConfig.server.jobFailEnabled == "true") {
        notifier.sendNotification(`Unable to execute job [${jobName}]`, message, "WARNING", `/scheduler.html?jobname=${jobName}`);
      }
      var obj = hist.createHistoryItem(jobName, new Date().toISOString(), 9998, 0, fullMessage, isManual);
      hist.add(obj);
      return "error";
    }

    var command = schedItem.command;
    var commandParams = schedItem.commandParams;
    logger.info(`Command [${command}]`);

    if (command !== undefined && command !== null && command.length > 0) {
      try {
        const scriptPath = "./scripts/" + command;
        const data = await fs.readFile(scriptPath, 'utf8');
        logger.debug('Script file content loaded successfully');

        if (inData !== undefined && inData !== null) {
          commandParams += inData;
        }
        publishExecute(schedItem.agent, data, commandParams, jobName, isManual);
      } catch (err) {
        logger.error(`Error reading script file for job [${jobName}]:`, err.message);
        if (serverConfig.server.jobFailEnabled == "true") {
          notifier.sendNotification(`Error reading backup script for job [${jobName}]`, `${err.message}`, "ERROR", `/scheduler.html?jobname=${jobName}`);
        }
        return "error";
      }
    } else {
      publishExecute(schedItem.agent, commandParams, "", jobName, isManual);
    }

    return "ok";
  } catch (err) {
    logger.error(`Error in runJob [${jobName}]:`, err.message);
    throw err;
  }
}

// Manual execution of job
async function manualJobRun(index, jobName) {
  try {
    logger.debug('Initiating Manual Run of Job With name [' + jobName + "] and Index [" + index + "]");

    if (Array.isArray(jobName)) {
      logger.error("Error: jobName was an array");
      return "error";
    }

    logger.debug("passed array check");

    if (jobName !== undefined && jobName !== null && typeof jobName !== 'string') {
      logger.error("Error in jobname sanitization");
      return "error";
    }

    logger.debug("passed string check");

    if (index !== undefined && index !== null && index.length > 0) {
      jobName = getSchedules(index).jobName;
    }

    logger.debug('Requesting Manual Run of:' + jobName);
    return await runJob(jobName, "manual");
  } catch (err) {
    logger.error(`Error in manualJobRun:`, err.message);
    throw err;
  }
}


// Schedule jobs based on the configurations in schedules.json
/*

*    *    *    *    *    *
┬    ┬    ┬    ┬    ┬    ┬
│    │    │    │    │    │
│    │    │    │    │    └ day of week (0 - 7) (0 or 7 is Sun)
│    │    │    │    └───── month (1 - 12)
│    │    │    └────────── day of month (1 - 31)
│    │    └─────────────── hour (0 - 23)
│    └──────────────────── minute (0 - 59)
└───────────────────────── second (0 - 59, OPTIONAL)
*/
function createScheduleCron(second, minute, hour, dayOfMonth, month, dayOfweek) {
  return second.toString() + " " + minute.toString() + " " + hour.toString() + " " + dayOfMonth.toString() + " " + month.toString() + " " + dayOfweek.toString();
}

async function scheduleJobs() {
  try {
    logger.debug("Scheduling jobs - clearing existing schedules");
    
    // First clear any jobs so they can be reset
    thresholdJobs.empty();
    if (nodeschedule.scheduledJobs !== undefined && nodeschedule.scheduledJobs !== null) {
      var jobList = nodeschedule.scheduledJobs;
      for (jobName in jobList) {
        var EachJobObject = nodeschedule.scheduledJobs[jobName];
        logger.debug(`Cancelling Schedule Item [${jobName}]`);
          EachJobObject.cancel();
      }
  }

  //Now for each schedule, create the cron format, then set
  schedules.forEach(({ jobName, scheduleType, scheduleTime, dayOfWeek, dayInMonth }) => {
    var job;
    var scheduleCron = "";

    var sHour = parseInt(scheduleTime.split(':')[0]);
    var sMin = parseInt(scheduleTime.split(':')[1]);
    var startType = "clock";
    switch (scheduleType) {
      case "daily":
        scheduleCron = createScheduleCron(0, sMin, sHour, "*", "*", "*");
        break;

      case "weekly":
        scheduleCron = createScheduleCron(0, sMin, sHour, "*", "*", dayOfWeek);
        break;

      case "monthly":
        scheduleCron = createScheduleCron(0, sMin, sHour, dayInMonth, "*", "*");
        break;

      default:
        startType = "threshold";
        break;
    }

    if (startType == "clock") {
      logger.debug(`Scheduling Job [${jobName}] with schedule [${scheduleCron}]`);
      job = nodeschedule.scheduleJob(scheduleCron, function () {
        runJob(jobName, "schedule").catch(err => 
          logger.error(`Error in scheduled job [${jobName}]:`, err.message)
        );
      });
    } else {
      logger.debug(`Discovered Threshold Job [${jobName}] with schedule [${scheduleType}]`);
      thresholdJobs.addJob(jobName, scheduleType);
    }
  });
  
  logger.info(`Scheduled ${schedules.length} jobs successfully`);
} catch (err) {
  logger.error("Error scheduling jobs:", err.message);
  throw new AppError(`Failed to schedule jobs: ${err.message}`, 500);
}
} 

function isSameDate(date1, date2) {
  return date1.getUTCFullYear() === date2.getUTCFullYear() &&
  date1.getUTCMonth() === date2.getUTCMonth() &&
  date1.getUTCDate() === date2.getUTCDate();
}

function filterJobsForToday(jobs) {
  var today = new Date();
  return filterJobsWithDate(jobs,today);
}

function filterJobsWithDate(jobs,inDate) {
  filterDate = new Date(moment.tz(inDate, serverConfig.server.timezone));
  const currentDayOfWeek = filterDate.getDay(); // Sunday is 0, Saturday is 6
  const currentDayOfMonth = filterDate.getDate(); // Gets today's date in the month
  
  return jobs.filter(job => {
    const { scheduleType, dayOfWeek, dayInMonth } = job;

    // Daily jobs always run
    if (scheduleType === 'daily') {
      return true;
    }
    
    // Weekly jobs should run if today is the scheduled day
    if (scheduleType === 'weekly' && parseInt(dayOfWeek) === currentDayOfWeek) {
      return true;
    }
    
    // Monthly jobs should run if today is the scheduled day of the month
    if (scheduleType === 'monthly' && parseInt(dayInMonth) === currentDayOfMonth) {
      return true;
    }

    // Otherwise, the job does not run today
    return false;
  });
}


function getTodaysScheduleCount(){
  var filtered = filterJobsForToday(schedules);
  return filtered.length;
}

function getLast7DaysScheduleCount(){
  var filtered = filterJobsForToday(schedules);
  

  var today = new Date();
  var tminus1 = new Date().setDate(today.getDate()-1);
  var tminus2 = new Date().setDate(today.getDate()-2);
  var tminus3 = new Date().setDate(today.getDate()-3);
  var tminus4 = new Date().setDate(today.getDate()-4);
  var tminus5 = new Date().setDate(today.getDate()-5);
  var tminus6 = new Date().setDate(today.getDate()-6);

  var todayCount = filterJobsWithDate(schedules,today).length;
  var tminus1Count = filterJobsWithDate(schedules,tminus1).length;
  var tminus2Count = filterJobsWithDate(schedules,tminus2).length;
  var tminus3Count = filterJobsWithDate(schedules,tminus3).length;
  var tminus4Count = filterJobsWithDate(schedules,tminus4).length;
  var tminus5Count = filterJobsWithDate(schedules,tminus5).length;
  var tminus6Count = filterJobsWithDate(schedules,tminus6).length;

  var array=[tminus6Count,tminus5Count,tminus4Count,tminus3Count,tminus2Count,tminus1Count,todayCount];
  return array;
}

module.exports = { init, getSchedule, getSchedules, getScheduleIndex, upsertSchedule, deleteSchedule,deleteScheduleAtIndex, manualJobRun, runJob, getNextRunDate, runUpdateJob, getTodaysScheduleCount,getLast7DaysScheduleCount };