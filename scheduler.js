const scheduleFile = "./data/schedules.json";
var schedules = [];

var mqttClient;
var mqttCommand_topic;

const fs = require('fs');
const path = require('path');

function displaySecs(secs) {
    var ret;
    //Secs
    if (secs < 300) ret = secs + " secs";
  
    if (secs >= 300 && secs < 7200) {
      //Mins
      var mins = Math.floor(secs / 60);
      secs = secs % 60;
  
      ret = mins + " mins ";
  
    }
    if (secs >= 7200 && secs < 86400) {
      //hours
      var mins = Math.floor(secs / 60);
      var secs = secs % 60;
      var hours = Math.floor(mins / 60);
      mins = mins % 60;
      ret = hours + "h " + mins + " mins";
    }
  
    if (secs >= 86400) {
      var mins = Math.floor(secs / 60);
      var secs = secs % 60;
      var hours = Math.floor(mins / 60);
      var days = Math.floor(hours / 24);
      hours = hours - (days * 24);
      //hours = days %24;
      mins = mins % 60;
      ret = days + " days " + hours + "h ";
  
    }
  
    return ret;
  }

function checkExecutePermissionCapability(directoryPath) {
  try {
    // Check if you have write permissions on the directory
    fs.accessSync(directoryPath, fs.constants.W_OK);

    // Create a temporary file in the directory
    const tempFileName = '.tmp_permission_test';
    const tempFilePath = path.join(directoryPath, tempFileName);
    fs.writeFileSync(tempFilePath, 'Temporary file content', 'utf8');

    // Try to set execute permission on the temporary file
    fs.chmodSync(tempFilePath, '755');

    // Clean up by removing the temporary file
    fs.unlinkSync(tempFilePath);

    logger.info('Confirmed capabilities to set execute permissions on files in execute directory.');
  } 
  catch (err) {
    logger.error('Error:',err);
    logger.error('You do not have capabilities to set execute permissions on files in the directory.');
    process.exit(1);
  }
}

function readFile(filePath, callback) {
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
        callback(err, null);
        } else {
        callback(null, data);
        }
    });
}



function init() {
  
  //var inCommand_topic = mqttTransport.getCommandTopic();
  checkExecutePermissionCapability("/tmp");

  readSchedules();
  scheduleJobs();
  
}

function publishExecute(agent_id,command,commandParams,jobName,isManual){
    logger.info(`Executing Scheduled command on Agent [${agent_id}]`);
    //logger.debug(token);
    //mqttTransport.publishMessage(mqttTransport.getCommandTopic(),token);
    agentComms.sendCommand(agent_id,mqttTransport.getCommandTopic(),command,commandParams,jobName,undefined,isManual);
}


function deleteSchedule(jobName)
{
  logger.info(`Deleting Schedule with job name [${jobName}]`);
  //find the index
  var index =-1;
  for(var i=0;i<schedules.length;i++){
    if(schedules[i].jobName == jobName){
      index=i;
      break;
    }
  }
  logger.debug(`Found job at index [${index}]`);
  if(i!=-1)deleteScheduleAtIndex(i);
}

function deleteScheduleAtIndex(index)
{
  logger.info(`Deleting Schedule with at index [${index}]`);
  if(index>-1){ 

    var newArr = [];
    for(var i=0;i<schedules.length;i++){
      if(i!=index)newArr.push(schedules[i]);
    }
    //console.log(newArr);
    schedules=[];
    for(var i=0;i<newArr.length;i++){
      schedules.push(newArr[i]);
    }
    //console.log(schedules);
    writeSchedules();
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

function getScheduleObject(jobName, colour,  description, scheduleType, scheduleTime,dayOfWeek, dayInMonth,agentselect, agentcommand,commandparams,icon){
    var schedule = {};
    schedule.jobName = jobName;
    schedule.description = description;
    schedule.scheduleType = scheduleType;
    schedule.dayOfWeek = dayOfWeek;
    schedule.dayInMonth = dayInMonth;
    schedule.scheduleTime = scheduleTime;
    schedule.command = agentcommand;
    schedule.commandParams = commandparams;
    schedule.agent = agentselect;
    schedule.eta = 1;
    schedule.color = colour;
    schedule.icon = icon;
    return schedule;
}

function upsertSchedule(index, jobName, colour,  description, scheduleType, scheduleTime,dayOfWeek, dayInMonth,agentselect, agentcommand,commandparams,icon){
    
    logger.debug("Upserting Schedule");  

    var schedule = getScheduleObject(jobName, colour,  description, scheduleType, scheduleTime,dayOfWeek, dayInMonth,agentselect, agentcommand,commandparams,icon);
    logger.info(JSON.stringify(schedule));
    schedule.lastUpdated = new Date().toISOString();
    if(index===undefined||index===null||index.length<=0||index==-1){
        logger.info("Index is null");
        if(schedules===undefined||schedules===null)schedules=[];
        schedules.push(schedule);

        logger.info("Number of schedules: " + schedules.length);
    }
    else
    {
        logger.info("index defined: " + index);
        schedules[index]=schedule;
    }
    writeSchedules();
}


/*function addSchedule(schedule) {
    //Add the new schedule to the array and save
    schedules.push(schedule);
    writeSchedules();
}*/


// Read schedules from the JSON file
function readSchedules() {
    try {
        logger.info("Loading Scheduler Data");
        const data = fs.readFileSync(scheduleFile);
        schedules = JSON.parse(data);
    } catch (err) {
        logger.error('Error reading schedules', err)
    }
}

// Write schedules to the JSON file
function writeSchedules() {
    try {
        logger.info("Writing Schedules");
        fs.writeFileSync(scheduleFile, JSON.stringify(schedules, null, 2));
        logger.debug('Schedules saved successfully, reloading schedules');
        scheduleJobs();
    } catch (err) {
        logger.error('Error writing schedules:', err);
    }
}

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
    const formattedDelta = displaySecs(delta);

    if(addDelta!==undefined && addDelta == false ) return `${formattedDate}`;
    else return `${formattedDate} (${formattedDelta})`;
}

function getSchedules(index){
    if(index===undefined||index===null)
    {
        for(var i=0;i<schedules.length;i++){
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
  db.deleteData(agentId + "_" + jobName + "_log",db.callback);

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
function runJob(jobName,isManual,inData) {
    if(isManual===undefined){isManual=false;}
    // Your job function implementation
    logger.info(`Running job : ${jobName}`);
    var schedItem = getSchedule(jobName);
    logger.info(`Description : ${schedItem.description}`);
    logger.info(`Agent       : ${schedItem.agent}`);
    logger.info(`Mode        : ${isManual}`);
    var agent = agents.getAgent(schedItem.agent);
    if(agent===undefined || agent ===null){
      var message=`Unable to execute job [${jobName}] agent[${schedItem.agent}] does not exist - please correct this job`;
      logger.error(message);
      if(serverConfig.server.jobFailEnabled=="true")notifier.sendNotification(`Unable to execute job [${jobName}]`,message,"WARNING",`/scheduler.html?jobname=${jobName}`);
      return "error";
    }
    db.deleteData(schedItem.agent + "_" + jobName + "_log",db.callback);
    
    if(agent.status!="online")
    {
        var message=`Unable to execute job [${jobName}] agent[${schedItem.agent}] is not in the correct state [${agent.status}]`;
        var fullMessage=message + "\n\nData:\n" + JSON.stringify(agent);
        logger.error(message);
        if(serverConfig.server.jobFailEnabled=="true")notifier.sendNotification(`Unable to execute job [${jobName}]`,message,"WARNING",`/scheduler.html?jobname=${jobName}`);
        var obj = hist.createHistoryItem(jobName,new Date().toISOString(),9998,0,fullMessage,isManual);
        hist.add(obj);
        return "error";
    }

    var command = schedItem.command;
    var commandParams = schedItem.commandParams;
    logger.info(`Command [${command}]`)
    
    var content;
    if(command!==undefined && command!==null && command.length>0)
    {
        readFile("./scripts/" + command, (err, data) => {
            if (err) {
              logger.error('Error reading file:',err);
              if(serverConfig.server.jobFailEnabled=="true")notifier.sendNotification(`Error reading backup script for job [${jobName}]`,`${err}`,"ERROR",`/scheduler.html?jobname=${jobName}`);
            } else {
              logger.debug('File content:');
              logger.debug(data);
    
              if(inData!==undefined &&inData!==null){commandParams+=inData}; 
              publishExecute(schedItem.agent,data,commandParams,jobName,isManual);

            }
          });
    }
    else{
      publishExecute(schedItem.agent,commandParams,"",jobName,isManual);
    }
  return "ok";
}

// Manual execution of job
function manualJobRun(index,jobName){
    logger.debug('Initiating Manual Run of Job With name [' + jobName + "] and Index [" + index +"]");
    
    if (Array.isArray(jobName)) {   	      
      logger.error("Error: jobName was an array");
      return("error");
    } 
  
    logger.debug("passed array check");
    
    if (jobName!==undefined && jobName !== null && typeof jobName !== 'string') {
      logger.error("Error in jobname santization");
      return("error");
    }

    logger.debug("passed string check");

    //jobName = getSchedules(index).jobName;	    
    
    logger.debug('Requesting Manual Run of:' + jobName);
    
    if(index!==undefined && index!==null && index.length>0 )
    {
      jobName = getSchedules(index).jobName;
    }
    return runJob(jobName,"manual");
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
function createScheduleCron(second,minute,hour,dayOfMonth,month,dayOfweek){    
    return second.toString() + " " + minute.toString() + " " + hour.toString() + " " + dayOfMonth.toString() + " " + month.toString() + " " + dayOfweek.toString();
}

function scheduleJobs(){

  //First clear any jobs so they can be reset
  // Loop through and cancel all schedules

  thresholdJobs.empty();
  if(nodeschedule.scheduledJobs!==undefined && nodeschedule.scheduledJobs!==null){
      
      var jobList = nodeschedule.scheduledJobs;
      for(jobName in jobList){
          // Here inside **jobName** you are getting name of each Schedule.
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
        runJob(jobName, "schdeule");
      });
    }
    else {
      logger.debug(`Discovered Threshold Job [${jobName}] with schedule [${scheduleType}]`);
      thresholdJobs.addJob(jobName,scheduleType);
    }
  });
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