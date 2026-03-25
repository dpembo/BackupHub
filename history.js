
const dateTimeUtils = require('./utils/dateTimeUtils.js');

const MAX_HISTORY_ITEMS = 150;
const DBKEY = "JOB_HISTORY";
var historyItems = [];

// Note: logger, db, and serverConfig are injected as globals from server.js

/** Initialize  */
function init() {
    getData();

}

async function getData() {
    try {
        logger.debug("Getting history item: " + DBKEY);
        var obj = await db.getData(DBKEY);
        if (obj !== undefined && obj !== null) historyItems = obj;
        //logger.debug("HISTORY: \n " + JSON.stringify(obj));
    }
    catch (err) {
        // NotFoundError is expected on first startup - don't log as warning
        if (err.message && err.message.includes('NotFoundError')) {
            logger.debug("No history items found on startup (expected on first run)");
        } else {
            logger.warn("Unable to find history data:", err.message);
        }
        //logger.warn(JSON.stringify(err));
    }
}

/** Add a new item */
function add(item) {
    logger.info("Adding item to history [" + item.jobName + "] [" + item.lastRun +"] to history queue sized: " + historyItems.length);
    //logger.info(JSON.stringify(item));
    historyItems.push(item);
    if (historyItems.length > MAX_HISTORY_ITEMS) {
        historyItems.shift();
    }
    logger.info("Added history item - new list " + historyItems.length);
    updateDb();
}

async function updateDb() {
    logger.info("Updating History Records");
    try {
        await db.putData(DBKEY, historyItems);
        logger.debug(`History Data items updated successfully`);
    } catch (err) {
        logger.error(`unable to update history items [${DBKEY}] to DB`, err);
    }
}

function searchItemWithName(searchTerm)
{
    if (Array.isArray(searchTerm)) {
        searchTerm = searchTerm[0];
    }

    if (typeof searchTerm !== 'string') {
        logger.error('Invalid searchTerm parameter');
        return null;
    }
    logger.debug("Searching History item with Partial Job Name [" + searchTerm + "]");
    logger.debug("Number of History items:" + historyItems.length);
    for(var searchIndex=historyItems.length-1;searchIndex>=0;searchIndex--){

        logger.debug(`On SearchIndex [${searchIndex}]`);
        logger.debug(`Checking if ${historyItems[searchIndex].jobName} matches the searchTerm ${searchTerm}`);
        if(historyItems[searchIndex].jobName.indexOf(searchTerm)>=0)return historyItems[searchIndex];
    }
    return null;
}

function createHistoryItem(jobName, runDate, returnCode, runTime, log, isManual, executionId = null) {
    logger.debug("Creating history item [" + jobName + "]");
    if(isManual===undefined)isManual=false;
    var item = {};
    item.jobName = jobName;
    item.runDate = runDate;
    item.returnCode = returnCode;
    item.runTime = runTime;
    item.log = log;
    item.manual = isManual;
    if (executionId) {
      item.executionId = executionId;  // NEW: Orchestration execution ID for grouping
    }
    logger.debug("History Item:\n" + JSON.stringify(item));
    return item;
}

function getItemsUsingTZ() {
    var items = getItems();
    var itemsStr = JSON.stringify(items);

    var adjustedItems = JSON.parse(itemsStr);

    for(var i=0;i<adjustedItems.length;i++){
        adjustedItems[i].runDate = dateTimeUtils.displayFormatDate(new Date(adjustedItems[i].runDate),false,serverConfig.server.timezone,'YYYY-MM-DDTHH:mm:ss.SSS',false);
    }
    return adjustedItems;

}

function getItems() {
    //logger.info("Getting history items " + histmoryItems.length);
    //console.log(JSON.stringify(historyItems));
    //runDate
    return historyItems.slice();

}

function getItem(index) {
    //logger.info("Getting history item [" + index + "]");
    return historyItems[index];
}

function getChartDataSet(numberOfDays) {

    logger.debug("---- GETTING CHART DATA SET ----");
    // Calculate today's date and seven days ago
    var today = new Date();
    today = new Date(dateTimeUtils.applyTz(today,serverConfig.server.timezone));
    var sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - numberOfDays);

    // Initialize arrays to store results
    const lastSevenDays = [];
    const runTimeSumPerDay = {};
    const successPerDay = {};
    const failPerDay = {};

    // Generate date strings for the last seven days
    for (let i = 0; i < numberOfDays; i++) {
        const currentDate = new Date(today);
        currentDate.setDate(today.getDate() - i);
        lastSevenDays.unshift(currentDate.toISOString().slice(0, 10));
    }

    // Initialize runTimeSumPerDay with zeros for each day
    lastSevenDays.forEach(date => {
        runTimeSumPerDay[date] = 0;
        successPerDay[date] = 0;
        failPerDay[date] = 0;
    });

    // Iterate through the dataArray
    getItemsUsingTZ().forEach(item => {
        // Parse runDate and runTime
        var runDate = new Date(item.runDate);
        const runTime = parseInt(item.runTime);
        //logger.debug(`runDate: ${runDate}`);
        //logger.debug(`runTime: ${runTime}`);

        var success = 0;
        var fail = 0;
        if(item.returnCode==0){
            success=1
        }
        else {
            fail=1;
        }

        // Check if runDate is within the last 7 days
        //logger.debug(`7daysAgo: ${sevenDaysAgo}`);
        //logger.debug(`today   : ${today}`);
        if (runDate >= sevenDaysAgo && runDate <= today) {
            //const formattedDate = runDate.toISOString().slice(0, 10); // Convert to string format "YYYY-MM-DD"
            const formattedDate = moment.tz(runDate, serverConfig.server.timezone).format('YYYY-MM-DD');
            runTimeSumPerDay[formattedDate] += runTime;
            successPerDay[formattedDate] += success;
            failPerDay[formattedDate] += fail;
        }
    });

    // Convert runTimeSumPerDay object into an array of sums
    const runTimeSumArray = lastSevenDays.map(date => runTimeSumPerDay[date]);
    const successSumArray = lastSevenDays.map(date => successPerDay[date]);
    const failSumArray    = lastSevenDays.map(date => failPerDay[date]);

    var data = {};
    data.labels = lastSevenDays;
    data.runtime = runTimeSumArray;
    data.success = successSumArray;
    data.fail = failSumArray;
    return data;
}

function getAverageRuntime(inJobName)
{   
    var foundCount=0;
    var total = 0;
    for(var i=0;i<historyItems.length;i++)
    {
        //logger.debug(`Matching ${historyItems[i].jobName} with ${inJobName}`);
        if(historyItems[i].jobName==inJobName && historyItems[i].returnCode==0){
            total += historyItems[i].runTime;
            foundCount++;
            //logger.debug("Matched " + historyItems[i].runTime);
        }
    }
    //logger.debug("Found: " + foundCount);
    //logger.debug("total: " + total);
    var avg = 1800 //default to 30 mins if unknown;
    
    if (foundCount>0){
        avg = parseFloat(total) / parseFloat(foundCount);
        avg = Math.round(avg);
        //logger.debug("avg is:" + avg)
    }
    return avg;
}

function getLastRun(inJobName){
    logger.debug("Getting Last Run for Job: " + inJobName);
    var items = getItemsUsingTZ();
    for (var i = items.length - 1; i >= 0; i--) {
        if(items[i].jobName==inJobName){
            //logger.debug("Found item at [" + i+"]: [" + JSON.stringify(historyItems[i]) + "]")

            return items[i];
        }
    }
    return null;
}


function getSuccessPercentage(inJobName)
{
    var items=0;
    var successTotal = 0;
    for(var i=0;i<historyItems.length;i++)
    {
        if(historyItems[i].jobName==inJobName){
            items++
            if(historyItems[i].returnCode==0)successTotal++;
        }
    }
    var pct = (successTotal/items)*100;
    pct = Math.round(pct);
    return pct;
}

function getTodaysRun(){
    var today = new Date().toISOString();
    var todayStr = today.split("T")[0];

    var count=0;
    var schedCount=0;
    var manualCount=0;
    var fail=0;
    var schedFail=0;
    var manualFail=0;
    var items = getItemsUsingTZ();
    for (var i = items.length - 1; i >= 0; i--) {
        var runDate = items[i].runDate;
        var runDateStr = runDate.split("T")[0];

        if(runDateStr==todayStr){
            if(items[i].returnCode==0)
            {
                count++
                if(items[i].manual==true)manualCount++
                else schedCount++;
            }
            else{
                fail++;
                if(items[i].manual==true)manualFail++
                else schedFail++;
            }
        }
    }
    var result = {};
    result.success=count;
    result.manualCount=manualCount;
    result.scheduledCount=schedCount;
    result.fail=fail;
    result.scheduledFail=schedFail;
    result.manualFail=manualFail;
    return result;
}

/**
 * Group orchestration node executions under their parent orchestration job
 * Returns a mixed array of regular history items and grouped orchestration items
 * Fetches orchestration names from the database for display
 */
async function getItemsGroupedByOrchestration() {
    const items = getItemsUsingTZ();
    const grouped = [];
    const orchestrationMap = new Map(); // Map of "${jobId}#${executionId}" -> {parent, nodes}
    const regularItems = [];

    // Fetch all orchestrations to get their names and descriptions
    let orchestrationNames = {};
    let orchestrationDescriptions = {};
    try {
        const allOrchestrations = await db.getData('ORCHESTRATION_JOBS');
        if (allOrchestrations) {
            for (const [jobId, jobData] of Object.entries(allOrchestrations)) {
                orchestrationNames[jobId] = jobData.name || `Orchestration [${jobId}]`;
                orchestrationDescriptions[jobId] = jobData.description || '';
            }
        }
    } catch (err) {
        logger.debug('Unable to fetch orchestration names: ' + err.message);
        // Continue without names if database fetch fails
    }

    // Separate orchestration nodes from regular items
    for (const item of items) {
        // Pattern: "Orchestration [jobId] Node [nodeId]"
        const orchestrationMatch = item.jobName.match(/^Orchestration \[([^\]]+)\] Node \[([^\]]+)\]$/);
        
        if (orchestrationMatch) {
            const jobId = orchestrationMatch[1];
            const nodeId = orchestrationMatch[2];
            const executionId = item.executionId || 'unknown'; // Use executionId if available, fallback to 'unknown'
            
            // Use composite key to distinguish multiple executions of the same job
            const mapKey = `${jobId}#${executionId}`;
            
            if (!orchestrationMap.has(mapKey)) {
                // Get the orchestration display name and description
                const displayName = orchestrationNames[jobId] || `Orchestration [${jobId}]`;
                const displayDesc = orchestrationDescriptions[jobId] || '';
                
                orchestrationMap.set(mapKey, {
                    parent: {
                        jobName: displayName,
                        description: displayDesc,
                        jobId: jobId,
                        executionId: item.executionId,
                        runDate: item.runDate,
                        isOrchestration: true,
                        icon: 'hub',
                        color: '#2196F3',
                        children: []
                    },
                    nodeMap: new Map()
                });
            }
            
            const orchData = orchestrationMap.get(mapKey);
            orchData.nodeMap.set(nodeId, item);
        } else {
            regularItems.push(item);
        }
    }

    // Merge and sort: newest first
    // Orchestration items should group by latest execution date
    // Get orchestration executions to use finalStatus for parent status
    let orchestrationExecutions = {};
    try {
      orchestrationExecutions = await db.getData('ORCHESTRATION_EXECUTIONS');
    } catch (err) {
      logger.debug('Unable to fetch orchestration executions for grouping: ' + err.message);
    }

    const orchestrationItems = Array.from(orchestrationMap.values()).map(data => {
        const nodeItems = Array.from(data.nodeMap.values());
        data.parent.children = nodeItems;
        
        // Update parent runDate to be the latest among its children
        if (nodeItems.length > 0) {
            const latestNode = nodeItems.reduce((latest, current) => 
                new Date(current.runDate) > new Date(latest.runDate) ? current : latest
            );
            data.parent.runDate = latestNode.runDate;
            
            // Use finalStatus from ORCHESTRATION_EXECUTIONS if available
            const jobId = data.parent.jobId;
            const executionId = data.parent.executionId;
            let returnCode = 0; // default to success
            let manual = false; // default to scheduled
            
            if (orchestrationExecutions[jobId]) {
              // Find the execution with matching executionId
              const execution = orchestrationExecutions[jobId].find(exec => exec.executionId === executionId);
              if (execution && execution.finalStatus) {
                // Use finalStatus: 0 for success, 1 for failure/error
                returnCode = (execution.finalStatus === 'success') ? 0 : 1;
                // Use manual flag from execution
                manual = execution.manual || false;
              } else {
                // Fallback: calculate from children if execution not found
                returnCode = nodeItems.some(n => n.returnCode !== 0) ? 1 : 0;
              }
            } else {
              // Fallback: calculate from children if executions not available
              returnCode = nodeItems.some(n => n.returnCode !== 0) ? 1 : 0;
            }
            
            data.parent.returnCode = returnCode;
            data.parent.manual = manual;
        }
        
        return data.parent;
    });

    // Interleave orchestration and regular items, sorted by date (newest first)
    const allItems = [...regularItems, ...orchestrationItems];
    allItems.sort((a, b) => {
        const dateA = new Date(a.runDate);
        const dateB = new Date(b.runDate);
        return dateB - dateA; // Newest first
    });

    return allItems;
}

/**
 * Clear all history items from the database
 * @returns {Promise<void>}
 */
async function clearHistory() {
    try {
        logger.info("Clearing all history items");
        historyItems = [];
        await db.putData(DBKEY, historyItems);
        logger.info("History cleared successfully");
    } catch (err) {
        logger.error("Error clearing history: " + err.message);
        throw err;
    }
}

module.exports = { init, add, getItems, getItemsUsingTZ, getItem, searchItemWithName, createHistoryItem,getChartDataSet,getAverageRuntime, getLastRun,getSuccessPercentage, getTodaysRun, getItemsGroupedByOrchestration, clearHistory };
