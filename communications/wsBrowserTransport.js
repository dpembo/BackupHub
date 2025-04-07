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



module.exports = { init, emitNotification };