const versionInfo = require('./version.js');
const version = versionInfo.getVersion();
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const mqtt = require('mqtt');
const websocket = require('ws');
const ReconnectingWebSocket = require('reconnecting-websocket');
const { spawn } = require('child_process');
const { execSync } = require('child_process');
const express = require('express');
const jwt = require('jsonwebtoken');
const os = require('os');

const PORT = 49991;
const app = express();

// Define critical filesystem paths
let connId = "anonymous";
let mqttClient;
let wsClient;

let jobCount = 0;
let successJobCount = 0;
let failJobCount = 0;
let pubCount = 0;
let subCount = 0;

// Configuration
const DEFAULT_MQTT_SERVER = 'localhost';
const DEFAULT_MQTT_SERVER_PORT = '1883';
const DEFAULT_WS_SERVER = 'localhost';
const DEFAULT_WS_SERVER_PORT = '49981';
const TOPIC_COMMAND = 'backup/agent/command';
const TOPIC_STATUS = 'backup/agent/status';
const LOG_STATUS = 'backup/agent/log';

let RETRY_ATTEMPTS = 360;
let RETRY_DELAY = 30000;
let RETRY_TIMEOUT = 5000;
let FILE_SYSTEMS = "/,/home,/var,/tmp,/boot,/usr";
let FILE_SYSTEMS_THRESHOLD = 80;
let CPU_THRESHOLD = 75;
let DEBUG_MODE = false;
let returnCode;

const AGENT_STATUS = Object.freeze({
  OFFLINE: "offline",
  IDLE: "idle",
  RUNNING: "running",
  INITIALIZING: "initializing",
  ERROR: "error"
});
let status = AGENT_STATUS.OFFLINE;

// Generate agent ID using hostname
let INSTALL_DIR = "/opt/BackupHubAgent";
let STARTUP_TYPE = "INSTALL";
const HOSTNAME = os.hostname();
const agentNameIndex = process.argv.indexOf('--agent');
let agentName = agentNameIndex !== -1 ? process.argv[agentNameIndex + 1] : null;
let AGENT_ID = agentName ? agentName : `agent_${HOSTNAME}`;
const SERVER = `${HOSTNAME}`;

const workingDirIndex = process.argv.indexOf('--workingDir');
let workingDir = workingDirIndex !== -1 ? process.argv[workingDirIndex + 1] : '/tmp';

const mqttServerIndex = process.argv.indexOf('--mqttServer');
let MQTT_SERVER = mqttServerIndex !== -1 ? process.argv[mqttServerIndex + 1] : DEFAULT_MQTT_SERVER;

const mqttPortIndex = process.argv.indexOf('--mqttPort');
let MQTT_SERVER_PORT = mqttPortIndex !== -1 ? process.argv[mqttPortIndex + 1] : DEFAULT_MQTT_SERVER_PORT;

let MQTT_ENABLED = process.argv.includes('--mqttServer');

const wsServerIndex = process.argv.indexOf('--wsServer');
let WS_SERVER = wsServerIndex !== -1 ? process.argv[wsServerIndex + 1] : DEFAULT_WS_SERVER;

const wsPortIndex = process.argv.indexOf('--wsPort');
let WS_SERVER_PORT = wsPortIndex !== -1 ? process.argv[wsPortIndex + 1] : DEFAULT_WS_SERVER_PORT;

const retryCountIndex = process.argv.indexOf('--retryCount');
RETRY_ATTEMPTS = retryCountIndex !== -1 ? process.argv[retryCountIndex + 1] : RETRY_ATTEMPTS;

const retryDelayIndex = process.argv.indexOf('--retryDelay');
RETRY_DELAY = retryDelayIndex !== -1 ? process.argv[retryDelayIndex + 1] : RETRY_DELAY;

const retryTimeoutIndex = process.argv.indexOf('--retryTimeout');
RETRY_TIMEOUT = retryTimeoutIndex !== -1 ? process.argv[retryTimeoutIndex + 1] : RETRY_TIMEOUT;

const fileSystemIndex = process.argv.indexOf('--fileSystems');
FILE_SYSTEMS = fileSystemIndex !== -1 ? process.argv[fileSystemIndex + 1] : FILE_SYSTEMS;
let criticalPaths = FILE_SYSTEMS.split(",");

const fileSystemThresholdIndex = process.argv.indexOf('--fileSystemsThreshold');
FILE_SYSTEMS_THRESHOLD = fileSystemThresholdIndex !== -1 ? parseInt(process.argv[fileSystemThresholdIndex + 1]) : FILE_SYSTEMS_THRESHOLD;

const cpuThresholdIndex = process.argv.indexOf('--cpuThreshold');
CPU_THRESHOLD = cpuThresholdIndex !== -1 ? parseInt(process.argv[cpuThresholdIndex + 1]) : CPU_THRESHOLD;

let childProcess;
let useMQTT = false;
let commsType = "websocket";

let enckey = process.env.BACKUPHUB_ENCRYPTION_KEY || padStringTo256Bits("CHANGEIT");
let pushVerificationNotification = true;

const helpInfo = {
  '--agent': 'Specify the agent name.',
  '--workingDir': 'Specify the working directory for file operations. Default is /tmp.',
  '--debug': 'Enable debug mode for additional logging.',
  '--mqttServer': 'Specify the mqtt server address',
  '--mqttPort': 'Specify the mqtt server port',
  '--wsServer': 'Specify the WebSocket server address',
  '--wsPort': 'Specify the WebSocket server port',
  '--retryCount': 'Number of connection retries',
  '--retryDelay': 'Time in Milliseconds of wait between retries',
  '--retryTimeout': 'Time in Milliseconds for connection to timeout',
  '-? / --help': 'Display this help message.',
};

// Utility Functions

function parseSettingsFile(filePath) {
  try {
    console.log("Loading Settings file [" + filePath + "]");
    const data = fs.readFileSync(filePath, 'utf8');
    const lines = data.split('\n');
    lines.forEach(line => {
      const match = line.match(/^(\w+)="(.*)"$/);
      if (match) {
        const [, key, value] = match;
        switch (key) {
          case 'AGENT_NAME': agentName = AGENT_ID = value; break;
          case 'MQTT_SERVER': MQTT_SERVER = value; break;
          case 'MQTT_PORT': MQTT_SERVER_PORT = value; break;
          case 'MQTT_ENABLED': MQTT_ENABLED = value.toUpperCase() === 'TRUE'; break;
          case 'WS_SERVER': WS_SERVER = value; break;
          case 'WS_PORT': WS_SERVER_PORT = value; break;
          case 'WORKING_DIR': workingDir = value; break;
          case 'INSTALL_DIR': INSTALL_DIR = value; break;
          case 'STARTUP_TYPE': STARTUP_TYPE = value; break;
          case 'CONNECTION_RETRIES': RETRY_ATTEMPTS = parseInt(value); break;
          case 'CONNECTION_DELAY': RETRY_DELAY = parseInt(value); break;
          case 'CONNECTION_TIMEOUT': RETRY_TIMEOUT = parseInt(value); break;
        }
      }
    });
    useMQTT = process.argv.includes('--mqttServer') || MQTT_ENABLED;
    commsType = useMQTT ? "mqtt" : "websocket";
  } catch (err) {
    debug(0, 'Error reading settings file');
    debug(0, err);
  }
}

function debug(level, message) {
  switch (level) {
    case 0: if (!DEBUG_MODE) return; console.log("\x1b[37m\x1b[2m" + message + "\x1b[0m"); break;
    case 1: console.log("\x1b[37m\x1b[1m" + message + "\x1b[0m"); break;
    case 2: console.log("\x1b[33m" + message + "\x1b[0m"); break;
    case 3: console.log("\x1b[31m" + message + "\x1b[0m"); break;
    case 4: console.log("\x1b[37m\x1b[41m" + message + "\x1b[0m"); break;
  }
}

function validateJWTToken(inToken) {
  return new Promise((resolve, reject) => {
    jwt.verify(JSON.parse(inToken), enckey, { algorithm: 'HS256' }, (err, decoded) => {
      err ? reject(err) : resolve(decoded);
    });
  });
}

function checkExecutePermissionCapability(directoryPath, liveness) {
  try {
    fs.accessSync(directoryPath, fs.constants.W_OK);
    const tempFilePath = path.join(directoryPath, '.tmp_permission_test');
    fs.writeFileSync(tempFilePath, 'Temporary file content', 'utf8');
    fs.chmodSync(tempFilePath, '755');
    fs.unlinkSync(tempFilePath);
    debug(0, 'Confirmed execute permissions capability.');
    return "ok";
  } catch (err) {
    debug(3, 'Error:');
    console.error(err);
    debug(4, 'No execute permissions capability.');
    return liveness ? "No execute permissions capability." : process.exit(1);
  }
}

function addExecutePermission(filePath) {
  fs.chmod(filePath, '755', (err) => {
    err ? debug(4, `Error setting execute permission: ${err}`) : debug(0, 'Execute permission added.');
  });
}

function generateRandomFileName() {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function writeFileAndWait(filePath, dataToWrite) {
  try {
    fs.writeFileSync(filePath, dataToWrite, 'utf8');
    debug(0, 'File written successfully!');
  } catch (err) {
    debug(3, `Error writing file: ${err}`);
  }
}

function createEmptyFile(filePath) {
  fs.writeFile(filePath, '', (err) => {
    err ? debug(3, `Error creating file: ${filePath}`) : debug(1, `Empty file created: ${filePath}`);
  });
}

function deleteFile(filePathToDelete) {
  try {
    fs.unlinkSync(filePathToDelete);
    debug(1, `File removed: ${filePathToDelete}`);
  } catch (err) {
    debug(3, `Error deleting file: ${err}`);
  }
}

function publishStatusUpdate(status, description, data, jobName, callback, isManual) {
  const message = {
    name: AGENT_ID,
    topic: TOPIC_STATUS,
    server: SERVER,
    manual: isManual,
    commsType: commsType,
    description: description,
    data: data,
    status: status,
    jobName: jobName,
    lastStatusReport: new Date().toISOString(),
  };
  pubCount++;
  if (useMQTT) {
    mqttClient.connect().then(() => {
      mqttClient.publish(TOPIC_STATUS, JSON.stringify(message));
      debug(1, `Published status update over MQTT: ${status}`);
    }).catch((err) => debug(3, `MQTT publish failed: ${err.message}`));
  } else {
    if (wsClient.isConnected) {
      wsClient.sendMessage(JSON.stringify(message));
      debug(1, `Sent status update: ${status}`);
    } else {
      wsClient.connect().then(() => {
        wsClient.sendMessage(JSON.stringify(message));
        debug(1, `Connected and sent status update: ${status}`);
      }).catch((err) => debug(3, `Failed to send status update: ${err.message}`));
    }
  }
}

function getCurrentDateTimeFormatted() {
  const now = new Date();
  return `${now.getFullYear().toString().padStart(4, '0')}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
}

function executeBackupCommand(command, commandParams, jobName, callback, manual) {
  jobCount++;
  status = AGENT_STATUS.RUNNING;
  publishStatusUpdate('running', `Backup in progress for job [${jobName}]`, null, jobName, undefined, manual);

  const file = `${workingDir}/${generateRandomFileName()}.sh`;
  const logfile = `${workingDir}/${sanitizeUnixFilename(jobName)}_${getCurrentDateTimeFormatted()}.log`;
  createEmptyFile(logfile);
  writeFileAndWait(file, command);
  addExecutePermission(file);

  const runCommand = `. ${file} ${commandParams} >> ${logfile}`;
  const start = new Date().getTime();
  debug(1, `Executing backup command: ${runCommand}`);

  childProcess = spawn('bash', ['-c', runCommand], { detached: true, stdio: 'ignore' });
  childProcess.unref();

  let lastOffset = 0;
  let logStreamInterval;
  let childProcessExited = false;

  logStreamInterval = setInterval(() => {
    if (!fs.existsSync(logfile)) {
      debug(2, `Log file [${logfile}] not accessible`);
    } else {
      try {
        const stats = fs.statSync(logfile);
        const currentSize = stats.size;

        if (lastOffset > currentSize) {
          debug(2, `Size reset: ${currentSize} < ${lastOffset}`);
          lastOffset = currentSize;
        }

        if (lastOffset < currentSize) {
          const readStream = fs.createReadStream(logfile, { start: lastOffset, end: currentSize - 1 });
          readStream.on('data', (chunk) => {
            const logData = chunk.toString('utf8');
            lastOffset += chunk.length;
            publishLogData(logData, jobName, undefined, undefined, undefined, manual);
          });
          readStream.on('error', (err) => debug(2, `Read stream error: ${err.message}`));
        }

        if (childProcessExited && lastOffset >= currentSize) {
          clearInterval(logStreamInterval);
          const stop = new Date().getTime();
          debug(1, `Backup completed: ${runCommand} [${returnCode}]`);
          returnCode !== 0 ? failJobCount++ : successJobCount++;
          deleteFile(file);
          callback(jobName, (stop - start) / 1000, manual);
        }
      } catch (err) {
        debug(2, `Logfile read error: ${err.message}`);
      }
    }
  }, 1000);

  childProcess.on('exit', (code, signal) => {
    childProcessExited = true;
    returnCode = signal === "SIGKILL" ? 999 : signal === "SIGTERM" ? 998 : code === null ? 99999 : code;
  });

  publishStatusUpdate('online', 'Backup completed');
}

function publishLogData(logData, jobName, eta, returnCode, callback, manual) {
  const message = {
    name: AGENT_ID,
    server: SERVER,
    status: eta !== undefined ? "eta_submission" : "log_submission",
    jobName: jobName,
    manual: manual,
    eta: eta,
    returnCode: returnCode,
    data: logData,
    lastStatusReport: new Date().toISOString(),
  };
  pubCount++;
  if (useMQTT) {
    mqttClient.connect().then(() => {
      mqttClient.publish(TOPIC_STATUS, JSON.stringify(message));
      if (callback) callback();
    }).catch((err) => debug(3, `MQTT publish failed: ${err.message}`));
  } else {
    if (wsClient.isConnected) {
      wsClient.sendMessage(JSON.stringify(message));
      debug(1, `Sent log update: ${message.status}`);
    } else {
      wsClient.connect().then(() => {
        wsClient.sendMessage(JSON.stringify(message));
        debug(1, `Connected and sent log update: ${message.status}`);
      }).catch((err) => debug(3, `Failed to send log update: ${err.message}`));
    }
  }
}

function backupComplete(jobName, eta, manual) {
  status = AGENT_STATUS.IDLE;
  publishLogData("", jobName, eta, returnCode, undefined, manual);
  debug(2, `BACKUP COMPLETE IN ${eta} secs`);
}

function sanitizeUnixFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

async function handleCommand(message) {
  debug(0, "Received Command from BackupHub Server");
  subCount++;
  validateJWTToken(message).then(async decodedPayload => {
    const { name: agentId, command, manual = false, commandParams = "", jobName } = decodedPayload;
    debug(0, `Job: [${jobName}] for agent: [${agentId}]`);
    debug(0, `Command: ${command}, Manual: ${manual}, Params: ${commandParams}`);

    if (agentId !== AGENT_ID) return;

    if (command === 'ping') {
      const statusJsonStr = await livenessProbe();
      publishStatusUpdate('pong', 'ping response', statusJsonStr);
      return;
    }

    executeBackupCommand(command, commandParams, jobName, backupComplete, manual);
    pushVerificationNotification = true;
  }).catch(error => {
    console.error('Token validation failed:', error.message);
    if (pushVerificationNotification) {
      publishStatusUpdate("notification", "Message failed signature verification.", message.toString());
      pushVerificationNotification = false;
    }
  });
}

function getCPULoadPercentage() {
  try {
    const loadAvgData = fs.readFileSync('/proc/loadavg', 'utf-8');
    const [oneMinLoad] = loadAvgData.split(' ').map(parseFloat);
    const cpuCount = os.cpus().length;
    return (oneMinLoad / cpuCount) * 100;
  } catch (error) {
    debug(3, "Error reading load average:", error);
    return 0;
  }
}

function getFileSystemUsagePercentage() {
  try {
    const output = execSync(`df -h --output=pcent,target -x tmpfs -x devtmpfs`).toString();
    const lines = output.split('\n').slice(1).filter(line => line.trim() !== '');
    const result = lines.map(line => {
      const [usedPercentage, mountPoint] = line.trim().split(/\s+/);
      return { mount: mountPoint, usage: parseInt(usedPercentage.replace('%', ''), 10) };
    });
    return result;
  } catch (error) {
    console.error("Error checking disk usage:", error);
    return [];
  }
}

// Communication Handlers

class MqttHandler {
  constructor(server, port, options = {}) {
    this.server = server;
    this.port = port;
    this.client = null;
    this.isConnected = false;
    this.isReconnecting = false;
    this.isConnecting = false;
    this.reconnectAttempts = options.reconnectAttempts || 120;
    this.reconnectDelay = options.reconnectDelay || 5000;
    this.connectionTimeout = options.connectionTimeout || 5000;
    this.currentAttempts = 0;
    this.connectionTimeoutHandler = null;
  }

  checkConnected() {
    return this.isConnected;
  }

  connect() {
    debug(0, `Connecting to MQTT Server [mqtt://${this.server}:${this.port}]`);
    if (this.isConnected && this.client) {
      debug(0, "Connection exists and is connected");
      return Promise.resolve(this.client);
    }
    if (this.isConnecting) {
      debug(0, "Connection attempt in progress");
      return Promise.reject(new Error("Connection attempt in progress"));
    }
    this.isConnecting = true;
    return new Promise((resolve, reject) => {
      const connectUrl = `mqtt://${this.server}:${this.port}`;
      this.client = mqtt.connect(connectUrl);
      this.connectionTimeoutHandler = setTimeout(() => {
        if (!this.isConnected) {
          this.client.end();
          this.isConnecting = false;
          this.retryConnection();
          reject(new Error('Connection timeout'));
        }
      }, this.connectionTimeout);

      this.client.on('connect', () => {
        this.isConnected = true;
        this.currentAttempts = 0;
        clearTimeout(this.connectionTimeoutHandler);
        this.isReconnecting = false;
        debug(1, `Connected to MQTT server [mqtt://${this.server}:${this.port}]`);
        this.isConnecting = false;
        resolve(this.client);
      });

      this.client.on('error', (err) => {
        debug(3, `MQTT connection error: ${err.message}`);
        this.client.end();
        this.isConnected = false;
        clearTimeout(this.connectionTimeoutHandler);
        this.isConnecting = false;
        this.retryConnection();
        reject(err);
      });

      this.client.on('close', () => {
        this.isConnected = false;
        debug(0, 'MQTT connection closed');
        this.isConnecting = false;
        this.retryConnection();
      });
    });
  }

  retryConnection() {
    if (this.isReconnecting) return;
    this.isReconnecting = true;
    if (this.currentAttempts >= this.reconnectAttempts) {
      console.error('Max reconnection attempts reached - exiting');
      process.exit(2);
    }
    setTimeout(() => {
      this.currentAttempts++;
      debug(2, `Reconnection attempt ${this.currentAttempts} of ${this.reconnectAttempts}`);
      this.connect().then(() => {
        this.isReconnecting = false;
        publishStatusUpdate('register', 'Agent Online - Awaiting provision');
      }).catch(() => this.retryConnection());
    }, this.reconnectDelay);
  }

  disconnect() {
    if (this.client) {
      this.client.end();
      this.isConnected = false;
      debug(0, 'Disconnected from MQTT server');
    }
  }

  publish(topic, message) {
    if (!this.isConnected) return Promise.reject(new Error('Not connected to MQTT server'));
    return new Promise((resolve, reject) => {
      this.client.publish(topic, message, (err) => {
        err ? reject(err) : resolve();
      });
    });
  }

  subscribe(topic, callback) {
    if (this.isConnected && this.client) {
      this.client.subscribe(topic, (err) => {
        if (err) console.error(`Failed to subscribe to ${topic}: ${err.message}`);
        else {
          console.log(`Subscribed to ${topic}`);
          this.client.on('message', (receivedTopic, message) => {
            if (receivedTopic === topic) callback(message.toString());
          });
        }
      });
    } else {
      console.error('Cannot subscribe, MQTT client not connected');
    }
  }
}

class WebSocketHandler {
  constructor(server, port, agentId, processMessageCallback, options = {}) {
    this.server = server;
    this.port = port;
    this.agentId = agentId;
    this.client = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.connectionTimeout = options.connectionTimeout || 5000;
    this.processMessageCallback = processMessageCallback;
    this.reconnectAttempts = 0;
  }

  checkConnected() {
    return this.isConnected;
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (this.isConnected) {
        debug(1, `WebSocket [${this.agentId}] already connected`);
        return resolve(this.client);
      }
      if (this.isConnecting) {
        debug(1, `WebSocket [${this.agentId}] connection in progress`);
        return reject(new Error('Connection already in progress'));
      }
      if (this.client) {
        debug(1, `WebSocket [${this.agentId}] reusing existing client`);
        return resolve(this.client);
      }

      this.isConnecting = true;
      const connId = `${encodeURIComponent(this.agentId)}`;
      const connectUrl = `ws://${this.server}:${this.port}?name=${connId}`;

      const options = {
        WebSocket: websocket,
        connectionTimeout: this.connectionTimeout,
        maxRetries: 120,
        reconnectInterval: 1000 // Start with 1s delay
      };

      debug(0, `Initiating WebSocket connection for [${connId}]`);
      this.client = new ReconnectingWebSocket(connectUrl, [], options);

      this.client.addEventListener('open', () => {
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        debug(1, `WebSocket [${connId}] connected to [${connectUrl}]`);
        resolve(this.client);
      });

      this.client.addEventListener('close', () => {
        this.isConnected = false;
        this.isConnecting = false;
        debug(2, `WebSocket [${connId}] closed`);
      });

      this.client.addEventListener('error', (err) => {
        this.isConnected = false;
        this.isConnecting = false;
        debug(3, `WebSocket [${connId}] error: ${err.message}`);
        reject(err);
      });

      this.client.addEventListener('message', (event) => {
        const message = `"${event.data}"`;
        debug(0, `Received message on [${connId}]: ${message}`);
        this.processMessageCallback(message);
      });

      this.client.addEventListener('reconnecting', () => {
        this.reconnectAttempts++;
        debug(2, `Reconnection attempt ${this.reconnectAttempts} for [${connId}]`);
      });
    });
  }

  sendMessage(message) {
    if (this.isConnected && this.client) {
      this.client.send(message);
      debug(1, `Sent message on [${this.agentId}]`);
    } else {
      debug(3, `Cannot send on [${this.agentId}]: WebSocket not connected`);
    }
  }
}

// Main Execution

if (process.argv.includes('-?') || process.argv.includes('--help')) {
  console.log('Usage: node agent.js [options]\nOptions:');
  for (const [option, desc] of Object.entries(helpInfo)) console.log(`  ${option.padEnd(20)} ${desc}`);
  process.exit(0);
}

status = AGENT_STATUS.INITIALIZING;
console.log('\x1b[32m                                888                                                  888      ');
console.log('                                888                                                  888      ');
console.log('                                888                                                  888      ');
console.log('88888b.   .d88b.  88888b.d88b.  88888b.   .d88b.       .d8888b  .d88b.      888  888 888  888 ');
console.log('888 "88b d8P  Y8b 888 "888 "88b 888 "88b d88""88b     d88P"    d88""88b     888  888 888 .88P ');
console.log('888  888 88888888 888  888  888 888  888 888  888     888      888  888     888  888 888888K  ');
console.log('888 d88P Y8b.     888  888  888 888 d88P Y88..88P d8b Y88b.    Y88..88P d8b Y88b 888 888 "88b ');
console.log('88888P"   "Y8888  888  888  888 88888P"   "Y88P"  Y8P  "Y8888P  "Y88P"  Y8P  "Y88888 888  888 ');
console.log('888                                                                                           ');
console.log('888                                                                                           ');
console.log('888                                                                                           ');
console.log('\x1b[36m _________________');
console.log('|# \x1b[30m\x1b[47m:           :\x1b[0m\x1b[36m #|');
console.log('|  \x1b[30m\x1b[47m:  BACK-UP  :\x1b[0m\x1b[36m  |');
console.log('|  \x1b[30m\x1b[47m:   AGENT   :\x1b[0m\x1b[36m  |');
console.log('|  \x1b[30m\x1b[47m:           :\x1b[0m\x1b[36m  |       \x1b[32mVersion: ' + version + '\x1b[36m');
console.log('|  \x1b[30m\x1b[47m:___________:\x1b[0m\x1b[36m  |');
console.log('|    \x1b[90m _________\x1b[36m   |');
console.log('|    \x1b[90m| __      |\x1b[36m  |');
console.log('|    \x1b[90m||  |     |\x1b[36m  |');
console.log('\\____\x1b[90m||__|_____|\x1b[36m__|\x1b[0m');
console.log("");
console.log("\x1b[32mBackup Agent\x1b[33m");
console.log("\x1b[32m----------------------------------------------------------------------------------------------\x1b[0m\n");

parseSettingsFile("settings.sh");

if (process.argv.includes('--debug')) {
  DEBUG_MODE = true;
  debug(2, "DEBUG ENABLED");
}

if (enckey === padStringTo256Bits("CHANGEIT")) {
  debug(3, "WARNING: Default encryption key in use. Please change this before use.");
}

if (useMQTT) {
  mqttClient = new MqttHandler(MQTT_SERVER, MQTT_SERVER_PORT, {
    reconnectAttempts: RETRY_ATTEMPTS,
    reconnectDelay: RETRY_DELAY,
    connectionTimeout: RETRY_TIMEOUT,
  });
  mqttClient.connect().then(() => {
    mqttClient.subscribe(TOPIC_COMMAND, handleCommand);
    publishStatusUpdate('register', 'Agent Online - Awaiting provision');
  }).catch((err) => console.error(`MQTT connection failed: ${err.message}`));
} else {
  wsClient = new WebSocketHandler(WS_SERVER, WS_SERVER_PORT, AGENT_ID, handleCommand, {
    reconnectAttempts: RETRY_ATTEMPTS,
    reconnectDelay: RETRY_DELAY,
    connectionTimeout: RETRY_TIMEOUT,
  });
  debug(1, `Establishing WebSocket Connection`);
  wsClient.connect().then(() => {
    console.log('WebSocket connected');
    publishStatusUpdate('register', 'Agent Online - Awaiting provision');
  }).catch((err) => console.error(`WebSocket connection failed: ${err.message}`));
}

app.get('/', async (req, res) => {
  try {
    res.set('Content-Type', 'application/json');
    res.send(await livenessProbe());
  } catch (error) {
    res.status(500).json({ status: "error", message: "Internal Server Error" });
  }
});

app.get('/debug', async (req, res) => res.json({ DEBUG_MODE }));
app.get('/debug/on', async (req, res) => res.json({ DEBUG_MODE: (DEBUG_MODE = true) }));
app.get('/debug/off', async (req, res) => res.json({ DEBUG_MODE: (DEBUG_MODE = false) }));

const server = app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
  status = AGENT_STATUS.IDLE;
});

debug(2, `\n+-----------------------------------------------------\n|Agent Name        : ${AGENT_ID}\n+-----------------------------------------------------`);
debug(2, useMQTT ? `|Connecting via MQTT\n|MQTT Server       : ${MQTT_SERVER}\n|MQTT Server Port  : ${MQTT_SERVER_PORT}` : `|Connecting via WebSocket\n|Websocket Server  : ${WS_SERVER}\n|Websocket Port    : ${WS_SERVER_PORT}`);
debug(2, `+-----------------------------------------------------\n|Retry Count       : ${RETRY_ATTEMPTS}\n|Retry Backoff     : ${RETRY_DELAY / 1000} secs\n|Connection Timeout: ${RETRY_TIMEOUT / 1000} secs\n+-----------------------------------------------------\n|Working Dir       : ${workingDir}\n+-----------------------------------------------------\n`);

checkExecutePermissionCapability(workingDir);

process.on('beforeExit', (code) => {
  publishStatusUpdate('offline', 'Script exited', null, () => {
    if (childProcess) childProcess.kill('SIGTERM');
    process.exit(code);
  });
});

process.on('SIGINT', () => {
  if (childProcess) childProcess.kill('SIGTERM');
  useMQTT ? mqttClient.disconnect().then(() => process.exit(0)) : process.exit(0);
});

function padStringTo256Bits(inputString) {
  const blockSize = 32;
  const inputLength = Buffer.from(inputString, 'utf8').length;
  const paddingLength = blockSize - (inputLength % blockSize);
  return Buffer.concat([Buffer.from(inputString, 'utf8'), Buffer.alloc(paddingLength, paddingLength)]).toString('utf8');
}

function getUptime() {
  let uptime = process.uptime();
  const days = Math.floor(uptime / (24 * 60 * 60)); uptime %= (24 * 60 * 60);
  const hours = Math.floor(uptime / (60 * 60)); uptime %= (60 * 60);
  const minutes = Math.floor(uptime / 60);
  const seconds = Math.floor(uptime % 60);
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

async function checkMqttLiveness() {
  return new Promise((resolve) => {
    if (useMQTT) {
      mqttClient.connect().then(() => {
        mqttClient.publish('test/liveness', 'test');
        resolve("MQTT test message published successfully");
      }).catch(() => resolve("ERROR: MQTT Connection issues"));
    } else {
      resolve(wsClient.checkConnected() ? "WebSocket connection is active" : "ERROR: WebSocket connection issues");
    }
  });
}

async function livenessProbe() {
  const jsonObj = {};
  const mqttLivenessResult = await checkMqttLiveness();
  const filePermLivenessResult = checkExecutePermissionCapability(workingDir, true);
  const overallStatus = (mqttLivenessResult.startsWith("ERROR:") || filePermLivenessResult !== "ok") ? "unhealthy" : "ok";

  Object.assign(jsonObj, {
    status: overallStatus,
    identifier: AGENT_ID,
    uptime: getUptime(),
    version,
    installDir: INSTALL_DIR,
    workingDir,
    agentStatus: status,
    mqttServer: MQTT_SERVER,
    mqttPort: MQTT_SERVER_PORT,
    wsServer: WS_SERVER,
    wsServerPort: WS_SERVER_PORT,
    connectionMode: commsType,
    startupType: STARTUP_TYPE,
    jobCount,
    failJobCount,
    successJobCount,
    pubCount,
    subCount,
    commsStatus: mqttLivenessResult,
    filePermissionStatus: filePermLivenessResult,
    fileSystemUsagePct: getFileSystemUsagePercentage(),
    cpuPct: getCPULoadPercentage()
  });

  return JSON.stringify(jsonObj);
}