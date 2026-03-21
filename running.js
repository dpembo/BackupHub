const dateTimeUtils = require('./utils/dateTimeUtils.js');

const MAX_HISTORY_ITEMS = 50;
const DBKEY = "JOB_RUNNING";
var historyItems = [];

// Note: logger and serverConfig are injected as globals from server.js

/** Initialize  */
async function init() {
    await getData();
}

async function getData() {
    try {
        logger.debug("Getting running items: " + DBKEY);
        var obj = await db.getData(DBKEY);
        if (obj !== undefined && obj !== null) historyItems = obj;
        logger.debug(`Loaded ${historyItems.length} running items from database`);
    }
    catch (err) {
        // NotFoundError is expected on first startup - don't log as warning
        if (err.message && err.message.includes('NotFoundError')) {
            logger.debug("No running items found on startup (expected on first run)");
        } else {
            logger.warn("Unable to find running data on startup:", err.message);
        }
        historyItems = [];
    }
}

async function updateDb() {
    logger.debug("Updating Running Records");
    try {
        await db.putData(DBKEY, historyItems);
        logger.debug(`Running data items updated successfully (${historyItems.length} items)`);
    } catch (err) {
        logger.error(`unable to update running items [${DBKEY}] to DB`, err);
    }
}

/** Add a new item */
function add(item) {
    logger.info("Adding item to running [" + item.jobName + "] to queue sized: " + historyItems.length);
    historyItems.push(item);
    if (historyItems.length > MAX_HISTORY_ITEMS) {
        historyItems.shift();
    }
    logger.info("Added running item - new list " + historyItems.length);
    updateDb();
}

function createItem(jobName,startTime,mode){
    if(mode===undefined)mode=false;
    logger.debug("Creating running item [" + jobName + "]");
    var item = {};
    item.jobName=jobName;
    item.startTime=startTime;
    item.manual=mode;
    logger.debug("running Item:\n" + JSON.stringify(item));
    return item;
}

function getItems() {
    //logger.info("Getting running items " + historyItems.length);
    return structuredClone(historyItems.slice());
}

function getItemsUsingTZ() {
    var items = getItems().slice();
    for(var i=0;i<items.length;i++){
        items[i].startTime = dateTimeUtils.displayFormatDate(new Date(items[i].startTime),false,serverConfig.server.timezone,'YYYY-MM-DDTHH:mm:ss.SSS',false);
    }
    return items;

}

function getItem(index) {
    //logger.info("Getting running item [" + index + "]");
    return historyItems[index];
}

function searchItemWithName(searchTerm)
{
    logger.debug("Getting Running item with Partial Job Name [" + searchTerm + "]");
    logger.debug("Number of running items:" + historyItems.length);
    //Find index from job name
    var index = -1;
    for(var i=0;i<historyItems.length;i++){
        logger.debug(`Checking is ${historyItems[i].jobName} matches the searchTerm ${searchTerm}`);
        if(historyItems[i].jobName.indexOf(searchTerm)>=0){
            logger.debug("matched and returning");
            return(historyItems[i]);
        }
    }

    return null;
}

function getItemByName(jobName)
{
    logger.debug("Getting Running item with Job Name [" + jobName + "]");
    //Find index from job name
    var index = -1;
    for(var i=0;i<historyItems.length;i++){
        if(historyItems[i].jobName == jobName){
            return(historyItems[i]);
        }
    }
    return null;
}

function removeItemByIndex(index)
{
    logger.debug("Removing Running item [" + index + "]");
    if (index < 0 || index >= historyItems.length) {
        logger.warn("Running item not found for removal");
        return;
    }
    historyItems.splice(index, 1);
    updateDb();
}

function removeItem(jobName)
{
    logger.debug("Removing Running item with Job Name [" + jobName + "]");
    //Find index from job name
    var index = -1;
    for(var i=0;i<historyItems.length;i++){
        if(historyItems[i].jobName == jobName){
            index = i;
            break;
        }
    }
    if (index !== -1) {
        removeItemByIndex(index);
    }
}

module.exports = { init, add, getItems,getItemsUsingTZ, getItemByName, searchItemWithName, getItem , createItem, removeItem};
