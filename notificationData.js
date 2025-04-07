const MAX_NOTIFICATION_ITEMS = 50;
const DBKEY = "NOTIFICATIONS_DATA";
var initialized = false;
var notificationItems = [];

/** Initialize  */
async function init(){

    logger.debug("Initializing Notification Data");
    try {
        // Call the asynchronous function and wait for it to complete
        await getData();
        //logger.warn('getData() completed successfully. Size:' + notificationItems.length);
        initialized=true;
        // Any further synchronous operations can be done here after getData() finishes
    } catch (error) {
        logger.error('Error in getData():', error);
        // Handle errors if needed
    }
    //getData();

}

function getCount(){
    return notificationItems.length;
}

async function getData() {
    try {
        //logger.debug("getData>>Getting notification item: " + DBKEY);
        var obj = await db.simpleGetData(DBKEY);
        if (obj !== undefined && obj !== null) notificationItems = obj;
        //logger.debug("getData>>** Notification Data **: \n " + JSON.stringify(obj));
        logger.debug("NotificationData Size:" + getCount());
        
    }
    catch (err) {
        logger.warn("Unable to find notification data");
        logger.warn(JSON.stringify(err));
    }
}

/** Add a new item */
function add(item) {
    if(initialized==false){
        logger.warn("Notificaions Data Not Initialized yet - retrying in one second");
        setTimeout(() => {
            add(item)
        },1000);
        return;
    }
    logger.debug("Adding item to notificationData [" + item.type + "] [" + item.title +"] to queue sized: " + notificationItems.length);
    notificationItems.push(item);
    if (notificationItems.length > MAX_NOTIFICATION_ITEMS) {
        notificationItems.shift();
    }
    logger.debug("Added notification item - new list size " + notificationItems.length);
    updateDb();
    webSocketBrowser.emitNotification('notification', `Count updated`);
}

function updateDb() {
    logger.info("Updating notification Records");
    //this.saveHistory();
    db.putData(DBKEY, notificationItems, (err, result) => {
        if (err) {
            logger.error(`unable to put notification items [${DBKEY}] to DB`, err);
        } else {
            logger.debug(`Notification Data items created successfully`);
        }
    });
}

function updateDbPromise() {
    logger.info("Updating notification Records");
    //this.saveHistory();
    db.putDataPromise(DBKEY, notificationItems, (err, result) => {
        if (err) {
            logger.error(`unable to put notification items [${DBKEY}] to DB`, err);
            return "ERROR";
        } else {
            logger.debug(`Notification Data items created successfully`);
            return "OK"
        }
    });
}

function createNotificationItem(runDate, type, title, description,url) {
    logger.debug(`Creating notification item: ${type}: ${title}`);
    var item = {};
    item.type = type;
    item.title = title;
    item.runDate = runDate;
    item.description = description;
    item.url=null;
    if(url!==undefined)item.url = url;
    logger.debug("notification Item:\n" + JSON.stringify(item));
    return item;
}

function getItems() {
    //logger.info("Getting history items " + historyItems.length);
    return notificationItems.slice();
}

function getItem(index) {
    //logger.info("Getting history item [" + index + "]");
    return notificationItems[index];
}

async function deleteItem(index){
    removeItem(notificationItems,null,index);
    //var res = updateDb()(;
    var res = updateDbPromise();
    //if(res.startsWith("error:")==true)throw error(res);
    //console.log("Repsonse is: " + res);
    return res;
}

function removeItem(array, itemToRemove, index, ) {
    if(itemToRemove!==null){
        const index = array.indexOf(itemToRemove);
    }
    if (index !== -1) {
      array.splice(index, 1);
    }
}

async function deleteAll(){
    notificationItems=[];
    var res = updateDbPromise();
    return res;
}

module.exports = { init, add, getItems, getItem, deleteItem, getCount, createNotificationItem, deleteAll};
