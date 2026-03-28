var socketIO = require('socket.io');
var io;

//------------------------------------------------------------------

/****************************
 * Websocket functions      *
 ****************************/
function init(server) {
    io = socketIO(server);

    // Handle incoming WebSocket connections
    io.on('connection', (socket) => {
        logger.debug('[wsBrowserTransport] A websocket client connected.');

        // Handle client disconnection
        socket.on('disconnect', () => {
            logger.debug('[wsBrowserTransport] A websocket client disconnected.');
        });

        socket.on('delete', (data) => {
            logger.debug('[wsBrowserTransport] A delete request over websocket was requested for [' + data + ']');
            agents.deleteAgent(data);
            emitNotification('deleted', data);
        });

        socket.on('ping', (data) => {
            logger.debug('[wsBrowserTransport] A ping was requested for [' + data + ']');
            //mqttTransport.publishPing(data);
            agentComms.pingAgent("websocket",data);
        });

    });
}

// Emit a notification to all connected clients
function emitNotification(event, message) {
    logger.info(`Emmiting notification to browser [${event} - ${message}]`);
    io.emit(event, message);
}

// Emit a schedule-specific event to all connected clients
function emitScheduleEvent(scheduleIndex, eventType, data) {
    if (!io) {
        logger.warn(`Socket.io not initialized, cannot emit schedule event`);
        return;
    }
    const eventName = `${eventType}:${scheduleIndex}`;
    logger.debug(`Emitting schedule event [${eventName}] with data: ${JSON.stringify(data).substring(0, 100)}`);
    io.emit(eventName, data);
}

// Emit an orchestration-specific event to all connected clients
function emitOrchestrationEvent(jobId, executionId, eventType, data) {
    if (!io) {
        logger.warn(`Socket.io not initialized, cannot emit orchestration event`);
        return;
    }
    const eventName = `${eventType}:${jobId}:${executionId}`;
    logger.debug(`Emitting orchestration event [${eventName}] for node/data update`);
    io.emit(eventName, data);
}

function getIO() {
    return io;
}


module.exports = { init, emitNotification, emitScheduleEvent, emitOrchestrationEvent, getIO };