const HashMap = require("./HashMap.js");
var jobs = new HashMap();
var serverConfig;
var THRESHOLD_COOLDOWN = 60 * 60 * 1000; // 60 minutes in milliseconds

function init(config){
    serverConfig = config;
    THRESHOLD_COOLDOWN = serverConfig.threshold.cooldown_mins * 60 * 1000;
}
function empty() {
    jobs = undefined;
    jobs = new HashMap();
}

function addJob(jobname, thresholdType) {
    logger.info(`Adding Threshold Job [${jobname}] with type [${thresholdType}]`);
    var job = {};
    var scheduleItem = scheduler.getSchedule(jobname);
    logger.warn("SCHEDULE ITEM:" + JSON.stringify(scheduleItem));
    job.name = jobname;
    job.type = thresholdType;
    job.lastRun = null; // Initialize lastRun property
    var agent = scheduleItem.agent;
    jobs.add(agent + "_" + jobname, job);
}

function checkExecuteThresholdJob(agent, message) {
    logger.info(`Checking for Threshold Execution for [${agent}] with message [${message}]`);
    logger.debug(`Checking for Threshold Execution with message [${message}]`);
    var messObj = JSON.parse(message);
    var data = JSON.parse(messObj.data);
    
    for (var i = 0; i < jobs.keys().length; i++) {
        var key = jobs.keys()[i];
        if (key.indexOf(agent + "_") === 0) {
            let job = jobs.get(key);
            let jobName = job.name;
            let schedType = job.type;
            let currentTime = Date.now();

            logger.debug(`Found threshold job [${jobName}] for agent [${agent}] type [${schedType}]`);
            
            // Check if the job can run based on cooldown period
            if (job.lastRun && currentTime - job.lastRun < THRESHOLD_COOLDOWN) {
                logger.debug(`Threshold job [${jobName}] is on cooldown; cannot run yet. Remaining [${THRESHOLD_COOLDOWN - (currentTime - job.lastRun)}]`);
                continue;
            }

            if (schedType === "cputhreshold") {
                logger.debug(`Checking CPU Usage % - Threshold [${serverConfig.threshold.cpu_percent}%] / Actual: ${data.cpuPct}%`);
                if (data.cpuPct >= serverConfig.threshold.cpu_percent) {
                    logger.info(`Executing threshold job [${jobName}] for agent [${agent}] type [${schedType}]`);
                    scheduler.runJob(jobName, "threshold-cpu", data.cpuPct );
                    job.lastRun = currentTime; // Set the last run time
                } else {
                    logger.debug(`Threshold job [${jobName}] not out of bounds`);
                }
            } else if (schedType === "storagethreshold") {
                logger.debug(`Checking storage threshold [${serverConfig.threshold.filesystem_percent}%]`);
                
                //Check each mount, and react when a mount used storage is above threshold
                var storageIssues=[];
                for(var j=0;j<data.fileSystemUsagePct.length;j++){
                    if(data.fileSystemUsagePct[j].usage>=serverConfig.threshold.filesystem_percent){
                        logger.debug(`Found threshold issue [${data.fileSystemUsagePct[j].usage}]`)
                        storageIssues.push(data.fileSystemUsagePct[j]);
                    }
                }
                if(storageIssues.length>0){
                    logger.info(`Executing threshold job [${jobName}] for agent [${agent}] type [${schedType}]`);
                    scheduler.runJob(jobName, "threshold-disk", '"' + JSON.stringify(storageIssues).replaceAll('"','') + '" ' + serverConfig.threshold.filesystem_percent);
                    job.lastRun = currentTime; // Set the last run time    
                }
            } else {
                logger.warn("Unknown Threshold type");
            }
        }
    }
}

module.exports = { init, addJob, checkExecuteThresholdJob, empty };
