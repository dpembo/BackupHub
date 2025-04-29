
const MAX_HISTORY_ITEMS = 150;
const DBKEY = "JOB_HISTORY";
var historyItems = [];

/** Initialize  */
function init() {
    getData();

}

async function getData() {
    try {
        logger.debug("Getting history item: " + DBKEY);
        var obj = await db.simpleGetData(DBKEY);
        if (obj !== undefined && obj !== null) historyItems = obj;
        //logger.debug("HISTORY: \n " + JSON.stringify(obj));
    }
    catch (err) {
        logger.warn("Unable to find history data");
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

function updateDb() {
    logger.info("Updating History Records");
    //this.saveHistory();
    db.putData(DBKEY, historyItems, (err, result) => {
        if (err) {
            logger.error(`unable to add history items [${DBKEY}] to DB`, err);
        } else {
            logger.debug(`History Data items created successfully`);
        }
    });
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

function createHistoryItem(jobName, runDate, returnCode, runTime, log, isManual) {
    logger.debug("Creating history item [" + jobName + "]");
    if(isManual===undefined)isManual=false;
    var item = {};
    item.jobName = jobName;
    item.runDate = runDate;
    item.returnCode = returnCode;
    item.runTime = runTime;
    item.log = log;
    item.manual = isManual;
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

module.exports = { init, add, getItems, getItemsUsingTZ, getItem, searchItemWithName, createHistoryItem,getChartDataSet,getAverageRuntime, getLastRun,getSuccessPercentage, getTodaysRun };
