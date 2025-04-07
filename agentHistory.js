const { mdiDebugStepInto } = require('@mdi/js');
const { Level } = require('level')
var db;
// Initialize the LevelDB database
function initializeDB(dbPath) {
    db = new Level(dbPath, { valueEncoding: 'json' })
}

// Add a new status change for a given id
async function addStatus(id, date, message,job) {
    // Check if the id, date, and message are valid
    if (!id || !date || !message) {
        throw new Error('Invalid parameters')
    }

    if(job === undefined || job === null ){
        job="";
    }
    // Convert the date to an ISO string
    const dateString = date.toISOString()
    // Create a key from the id and the date string separated by a colon
    const key = `${id}:${dateString}`
    // Create a value object with the date and the message
    const value = { date, message, job }
    // Get the previous status change for the same id
    var prev;
    try {
        prev = await getLastStatus(id);
    }
    catch (error) {
        console.log(error);
    }
    //console.log("Previous State",prev);
    //console.log(` adding state: ${id} / ${date} / ${message}`);

    //if no state change, don't update
    if (prev && prev.message === message) {
        //console.log("!!!SKIPPING UPDATE - NO STATE CHANGE")
        return;
    }
    //console.log("Updating AgentHistory");   
    await db.put(`status:${key}`, value)
    // Delete any old status changes that are older than 7 days
    await deleteOldStatus(id, date)
}

// Get the status changes for a given id
async function getStatus(id) {
    // Check if the id is valid
    if (!id) {
        throw new Error('Invalid parameter')
    }
    // Create an array to store the status changes
    const status = []
    // Create a variable to store the previous date
    let prevDate = null
    // Create an iterator for the db with status prefix and the given id as prefix
    //const iterator = db.values({ gt: `status:${id}:`, lt: `status:${id}:\xff` })

    try {
        for await (const value of db.values({ gt: `status:${id}:`, lt: `status:${id}:\xff` })) {
            //console.log(value)
            const { date, message, job } = value;
            var duration = 0;
            status.push({ date, message, duration, job });
        }

        for (var i = 0; i < status.length; i++) {
            if (i > 0) {
                var prev = status[i - 1];
                var date = status[i].date;
                prevDate = prev.date;

                //console.log(`Calculating duration between ${prevDate} and ${date}`);
                duration = (new Date(date).getTime() - new Date(prevDate).getTime()) / 1000;
                //console.log(`Duration is ${duration}secs`);
                prev.duration = duration;
                //console.log(prev)
                status[i - 1] = prev;
            }
            if (i == status.length - 1) {
                var date = status[i].date;
                prevDate = new Date().toISOString;
                duration = (new Date().getTime() - new Date(date).getTime()) / 1000;
                status[i].duration = duration;
            }
            status[i].date = dateTimeUtils.displayFormatDate(new Date(status[i].date),false,serverConfig.server.timezone,"YYYY-MM-DDTHH:mm:ss",false);
        }
        return status
    } finally {
        //if needed
    }
}

function combineMessages(history) {
    const combinedHistory = [];
    
    if (history.length === 0) {
        return combinedHistory;
    }

    let currentCombined = { ...history[0] };

    for (let i = 1; i < history.length; i++) {
        const currentItem = history[i];

        if (currentItem.message === currentCombined.message) {
            currentCombined.duration += currentItem.duration;
        } else {
            combinedHistory.push(currentCombined);
            currentCombined = { ...currentItem };
        }

        if (i === history.length - 1) {
            combinedHistory.push(currentCombined);
        }
    }

    return combinedHistory;
}

/**
 * Get a list of agent status history and then apply a date-time range filter
 * @param {String} id 
 * @param {String} startDate 
 * @param {String} endDate 
 */
async function getDateFilteredStatus(id, startDateStr, endDateStr) {
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    logger.info("Getting filtered items");
    var history = await getStatus(id);
    history = combineMessages(history);
    //logger.debug("History: " + history);
    const filteredHistory = [];

    for (let i = 0; i < history.length; i++) {
        const currentItem = history[i];
        const currentDate = new Date(currentItem.date);

        
        if (currentDate <= endDate) {
            const adjustedItem = { ...currentItem };

            if (currentDate < startDate) {
                const adjustedDate = new Date(startDate);
                const diffInMilliseconds = adjustedDate - currentDate;
                adjustedItem.date = adjustedDate.toISOString();
                adjustedItem.duration -= diffInMilliseconds / 1000; // Convert milliseconds to seconds
            }

            if (currentDate > endDate) {
                const adjustedDate = new Date(endDate);
                const diffInMilliseconds = currentDate - adjustedDate;
                adjustedItem.date = adjustedDate.toISOString();
                adjustedItem.duration -= diffInMilliseconds / 1000; // Convert milliseconds to seconds
            }
            
            var endDateTime = currentDate.getTime()  + adjustedItem.duration*1000;
            var calculatedEndDate = new Date(endDateTime);
            //console.log("CurrDate [" + currentDate + "] Calculated End Date [" + calculatedEndDate  + "] provided end date [" + endDate + "]");
            if(calculatedEndDate > endDate){
                //work out the diff between the start date and the endDate
                currMs = currentDate.getTime();
                endMs = endDate.getTime();
                var newDuration = endMs - currMs;
                //console.log("Last one... need to adjust duration: " + adjustedItem.duration + " to [" + newDuration + "]");
                adjustedItem.duration=newDuration/1000;
            }

            //if(currentDate.getMilliseconds() + adjustedItem.duration  )
            //if (i == history.length - 1 ) {
            //    var calcEndDate = currentItem.date + currentItem.duration;
            //    console.log("CALC END DATE: " + calcEndDate);
                //const diffInMilliseconds = endDate - currentDate;
                //adjustedItem.duration += diffInMilliseconds / 1000; // Update duration for the last item
            //}

            if(adjustedItem.duration>0)filteredHistory.push(adjustedItem);
        }
    }
    return filteredHistory;
}

// Get the last status change for a given id
async function getLastStatus(id) {
    // Check if the id is valid
    if (!id) {
        throw new Error('Invalid parameter')
    }

    var statuses = await getStatus(id);
    var last = statuses[statuses.length - 1];
    return last;
}

// Delete old status changes that are older than 7 days for a given id and date
async function deleteOldStatus(id, date) {
    // Check if the id and date are valid
    if (!id || !date) {
        throw new Error('Invalid parameters')
    }
    // Calculate the date that is 7 days before the given date
    const cutoffDate = new Date(date - 7 * 24 * 60 * 60 * 1000)
    // Create an iterator for the db with status prefix and the given id as prefix and the cutoff date as upper bound
    //const iterator = db.iterator({ gt: `status:${id}:`, lt: `status:${id}:${cutoffDate.toISOString()}` })


    for await (const key of db.keys({ gt: `status:${id}:`, lt: `status:${id}:${cutoffDate.toISOString()}` })) {
        try {
            if (key === null) {
                break
            }
            else {
                await db.del(key);
            }
        }
        catch (err) {
            console.err("Error occurred removing old data", err);
        }
    }

}


// Export the functions
module.exports = { initializeDB, addStatus, getStatus, getDateFilteredStatus }
