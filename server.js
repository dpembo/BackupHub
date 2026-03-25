debug = require("./debug.js");
log4js = require("log4js");
moment = require('moment-timezone');
sanitizeHtml = require('sanitize-html');

var loglines=[];

// Manually format log messages
function formatLog(loggingEvent) {
  const timestamp = new Date(loggingEvent.startTime).toISOString(); // ISO timestamp
  const level = loggingEvent.level.levelStr; // Log level (DEBUG, INFO, etc.)
  const loggerName = loggingEvent.categoryName; // Logger name
  const message = loggingEvent.data.join(' '); // Log message

  return `[${timestamp}] [${level}] ${loggerName} - ${message}`;
}

// Configure log4js
log4js.configure({
  appenders: {
    // Custom appender to store logs in memory
    memory: {
      layout: { type: 'pattern', pattern: '[%d{yyyy-MM-ddThh:mm:ss.SSS}] [%p] %c - %m' }, // Apply pattern to memory output
      type: {
        configure: () => (loggingEvent) => {
          //const formattedMessage = formatLog(loggingEvent); // Manually format log event
          loglines.push(loggingEvent); // Store formatted message
          if (loglines.length > 250) loglines.shift(); // Limit to last 100 logs
        }
        
      }
    },
    console: {
      type: 'console',
      layout: { type: 'pattern', pattern: '[%[%d{yyyy-MM-ddThh:mm:ss.SSS}] [%f{1} %l] %m%]' } // Apply pattern to console output
    }
  },
  categories: {
    default: { appenders: ['memory', 'console'], level: 'debug',enableCallStack: true }
  }
});

logger = log4js.getLogger("BackupHubServer");
logger.level="info";

//debug.setLogLevel(3);
confighandler = require("./configuration.js");

var express = require('express');
var session = require('express-session');
var cookieParser = require('cookie-parser');
var lusca = require('lusca');
var querystring = require('querystring');
var https = require('https');
var bodyParser = require('body-parser');
const multer = require('multer');

const User = require('./models/user');
const { asyncHandler, errorHandlerMiddleware, AppError } = require('./utils/errorHandler.js');
const asyncUtils = require('./utils/asyncUtils.js');
dateTimeUtils = require('./utils/dateTimeUtils.js');
mathUtils = require('./mathUtils.js');
passman = require('./passman.js');
smtpPass = "";
const versionInfo = require('./version.js');
const version = versionInfo.getVersion();
const minSupportedVersion = versionInfo.getMinimumAgentSupportedVersion();
const bcrypt = require('bcrypt');
//User.initializeDB('./data/user.db');

const TemplateRepository = require('./TemplateRepository');
var templates;
let REPOSITORY_URL = 'https://www.pembo.co.uk/BackupHub/template-repository/';

var path = require('path');
fs = require('fs');

nodemailer = require('nodemailer');
notifier = require ("./notify.js");
const backupManager = require('./backupManager.js');

serverConfig = confighandler.initServerConfig({});
serverConfig = confighandler.loadConfigJson("./data/server-config.json");
serverConfig = confighandler.processServerConfig(serverConfig);

thresholdJobs = require('./thresholdJobs.js');
thresholdJobs.init(serverConfig);

hist = require("./history.js");
notificationData = require("./notificationData.js");

running=require("./running.js");
agentHistory = require ("./agentHistory.js");
db = require("./db.js");
nodeschedule = require('node-schedule');
scheduler = require ("./scheduler.js");
orchestration = require("./orchestration.js");
orchestrationEngine = require("./orchestrationEngine.js");
//const moment = require('moment-timezone');

agentComms = require ("./communications/agentCommunication.js");
mqttTransport = require ("./communications/mqttTransport.js");
mqttTransport.init();

webSocketBrowser = require('./communications/wsBrowserTransport.js');
webSocketServer = require("./communications/wsServerTransport.js");
webSocketServer.init();


agentStats = new Map();
wsClients = new Map();

// Helper function to find a WebSocket client by key prefix (startsWith search)
function findClientByPrefix(prefix) {
  for (const [connId, client] of wsClients.entries()) {
    if (connId.startsWith(prefix)) {
      logger.debug(`Found client connection ID starting with [${prefix}]: [${connId}]`);
      return client;
    }
  }
  logger.debug(`No client connection ID found starting with [${prefix}]`);
  return undefined;
}

const pingInterval = 60;
const connTimeoutInterval = 180;
const failedPingOffline = 3;

recordHolder = {};
const DEFAULT_MQTT_SERVER = 'localhost';
const DEFAULT_MQTT_SERVER_PORT = '1883';
const DEFAULT_WEBSOCKER_SERVER_PORT='49981"'





//------------------------------------------------------------------
// Initialize Debug
//------------------------------------------------------------------
//if(serverConfig.server.debug=="true"){debug.on();}
if(serverConfig.server.debug=="true"){
  if(serverConfig.server.loglevel){
    switch(serverConfig.server.loglevel){
      case 0:
        logger.level="off";
        break;
      case 1:
        logger.level="error";
        break;        
      case 2:
        logger.level="warn";
        break;
      case 3:
        logger.level="info";
        break;        
      case 4:
        logger.level="debug";
        break;        
      case 5:
        logger.level="trace";
        break;        
    }
    //debug.setLogLevel(serverConfig.server.loglevel);
  }
}
else{
  logger.level="warn";
}
// Initialize database and agents asynchronously
(async () => {
  try {
    if(serverConfig.server.clearData=="true"){
      logger.warn("!!!!!!!!!!!!!!!!!!!!!!!!!");
      logger.warn("!! CLEARING DATA STORE !!");
      logger.warn("!!!!!!!!!!!!!!!!!!!!!!!!!");
      await db.clearData();
      logger.warn("Data store cleared successfully.");
    }

    //------------------------------------------------------------------

    db.initializeDB('./data/data.db');
    User.init('./data/user.db',logger,notifier);
    agentHistory.initializeDB("./data/agentHistory.db");

    //------------------------------------------------------------------

    mqttDisconnectNotificiationSent=false;

    const execSync = require('child_process').execSync;
    const { config } = require("process");

    agents = require("./agents.js");
    await agents.init();
    logger.info('Agents initialized successfully');
  } catch (error) {
    logger.error('Error during initialization:', error.message);
    process.exit(1);
  }
})();

const logpath = "/media/net/BackupHOMENAS/backups/";
const port = serverConfig.server.port;


//------------------------------------------------------------------
var scripts=[];
var scriptsDesc = [];

function maskPasswords(jsonStr) {
  try {
      let jsonObj = JSON.parse(jsonStr);

      function maskObject(obj) {
          for (let key in obj) {
              if (typeof obj[key] === 'object' && obj[key] !== null) {
                  // Recursively mask nested objects
                  maskObject(obj[key]);
              } else if (typeof obj[key] === 'string' && key.toLowerCase().includes("password")) {
                  // Mask the password field
                  obj[key] = "********";
              }
          }
      }

      if (Array.isArray(jsonObj)) {
          // Handle case when the root is an array of objects
          jsonObj.forEach(item => maskObject(item));
      } else {
          // Handle case when the root is a single object
          maskObject(jsonObj);
      }

      return JSON.stringify(jsonObj, null, 2); // Return the modified JSON string
  } catch (error) {
      console.error("Invalid JSON input:", error);
      return null;
  }
}

function extractFirstLineFromFile(fileName) {
  try {
    //console.log("Extracting desc from: " + fileName);
    const scriptContent = fs.readFileSync("./scripts/" + fileName, 'utf8');
    const lines = scriptContent.split('\n');
    let capture = false;

    for (const line of lines) {
      if (line.trim() === '#start-params') {
        capture = true;
      } else if (line.trim() === '#end-params') {
        capture = false;
      } else if (capture && line.trim().startsWith('#')) {
        // Remove the leading '#' and return the first line after the start marker
        //console.log("Found: " + line);
        return " - " + line.trim().substring(1).replace(/<[^>]*>/g, '');
      }
    }

    // Return an empty string if the start marker is not found
    return '';
  } catch (error) {
    console.error('Error reading file:', error);
    return '';
  }
}

function refreshScripts()
{
  scripts=[];
  scriptsDesc=[];
  fs.readdirSync("./scripts/").forEach(file => {
    scripts.push(file);
    scriptsDesc.push(extractFirstLineFromFile(file));
  });
}

//------------------------------------------------------------------


function getDbKey(logEvent,type)
{
  return logEvent.name + "_" + logEvent.jobName + "_" + type;
}

 
//------------------------------------------------------------------
/**
 * Executes a shell command
 * @param {} cmd 
 * @returns 
 */
function execShellCommand(cmd) {
  logger.info("Executing Command");
  try {
    code = execSync(cmd).toString();
  }
  catch (error) {
    code = 1;
    logger.error("Errored executing command",error);
  }
  return code;
}

//------------------------------------------------------------------
/**
 * Calculates a time differente beween start time and now
 * @param {} startTime 
 * @returns 
 */
function getRuntime(startTime) {
  var now = new Date();
  var stYYYY = startTime.substr(0, 4);
  var stMM = startTime.substr(5, 2) - 1;
  var stDD = startTime.substr(8, 2);
  var stHour = startTime.substr(11, 2);
  var stMin = startTime.substr(14, 2);
  var stSec = startTime.substr(17, 2);

  var startDate = new Date(stYYYY, stMM, stDD, stHour, stMin, stSec);
  secs = Math.round((now.getTime() - startDate.getTime()) / 1000);
  return secs;
}

function calcRunPercent(runtime, etaRuntime) {
  runtime = parseInt(runtime);
  etaRuntime = parseInt(etaRuntime);
  var pct = (runtime / parseInt(etaRuntime)) * 100;
  pct = Math.round(pct);
  return pct;
}

/**
 * Function to sort alphabetically an array of objects by some specific key.
 * 
 * @param {String} property Key of the object to sort.
 */
function dynamicSort(property) {
  var sortOrder = 1;

  if (property[0] === "-") {
    sortOrder = -1;
    property = property.substr(1);
  }

  return function (a, b) {
    if (sortOrder == -1) {
      return b[property].localeCompare(a[property]);
    } else {
      return a[property].localeCompare(b[property]);
    }
  }
}

async function getSchedulerData(index)
{
  logger.info("Getting Schedule Info with index: " + index);
  //var redir=req.query.redir;
  //var refresh = req.query["refresh"];
  //if (refresh === undefined) refresh = 0;
  var schedule = scheduler.getSchedules(index);

  //return logEvent.name + "_" + logEvent.jobName + "_" + type;
  var key1 = schedule.agent + "_" + schedule.jobName + "_" + "stats";
  var key2 = schedule.agent + "_" + schedule.jobName + "_" + "log";

  var stats = null;
  var log = null;
  try {
    stats = await db.simpleGetData(key1);
  }
  catch(err){
    logger.warn("Unable to find stats data");
    logger.warn(JSON.stringify(err));
  }

  try {
    log = await db.simpleGetData(key2);
  }
  catch(err){
    logger.warn("Unable to find log data");
    logger.warn(JSON.stringify(err));
  }  
  
  logger.debug("Stats:\n" + stats);
  logger.debug("Log  :\n" + log);
  if(stats!=null){
    stats.current.etaDisplay = dateTimeUtils.displaySecs(stats.current.eta);
    stats.etaRollingAvgDisplay = dateTimeUtils.displaySecs(stats.etaRollingAvg);
  }
  else{
    if(stats !== undefined && stats!==null && (stats.etaRollingAvg == undefined || stats.etaRollingAvg ==null)) stats.etaRollingAvg=0;
  }

  var data={};
  data.scripts = scripts;
  data.agent=agents.getAgent(schedule.agent);
  data.schedule = schedule;
  data.index = index;
  data.stats = stats;
  data.log = log;
  data.hist = {};
  data.hist.histAvgRuntime = hist.getAverageRuntime(schedule.jobName);
  data.hist.histAvgRuntimeSecs = dateTimeUtils.displaySecs(hist.getAverageRuntime(schedule.jobName));
  data.hist.histLastRun = hist.getLastRun(schedule.jobName);
  return data;
}
//______________________________________________________________________________________________________

/**
 * Initialise Express
 */
var app = express();
//app.use(express.static('public'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/monaco-editor', express.static('node_modules/monaco-editor'));
app.use('/material-icons', express.static('node_modules/material-icons'));
app.use('/material-design-icons', express.static('node_modules/material-design-icons-iconfont/dist'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(cookieParser());
//app.use(session({ secret: "dave's session secret", resave:false, saveUninitialized: false }));
app.use(session({
  secret: "dave's session secret", 
  resave: false, 
  saveUninitialized: false, 
  /*cookie: { secure: true, httpOnly: true } */
}));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Generate CSRF tokens for all requests but don't validate
app.use((req, res, next) => {
  // Generate a CSRF token if not already present
  if (!req.csrfToken) {
    const crypto = require('crypto');
    req.csrfToken = () => {
      if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
      }
      return req.session.csrfToken;
    };
  }
  next();
});

// CSRF validation middleware for form-based authenticated routes
const validateCsrf = (req, res, next) => {
  // Skip validation for public routes
  const publicRoutes = ['/login.html', '/register.html', '/forgot.html', '/saveScript'];
  if (publicRoutes.includes(req.path) || req.path.startsWith('/reset')) {
    logger.debug(`[CSRF] Skipping validation for public route: ${req.path}`);
    return next();
  }
  
  // Skip validation for REST APIs
  if (req.path.startsWith('/rest')) {
    logger.debug(`[CSRF] Skipping validation for REST API: ${req.method} ${req.path}`);
    return next();
  }

  // Get token from request body or headers
  const tokenFromRequest = req.body._csrf || req.headers['x-csrf-token'];
  const tokenFromSession = req.session.csrfToken;

  logger.debug(`[CSRF] Validating token for ${req.method} ${req.path}`);
  logger.debug(`[CSRF] Token from request: ${tokenFromRequest ? 'present' : 'missing'}`);
  logger.debug(`[CSRF] Token from session: ${tokenFromSession ? 'present' : 'missing'}`);

  if (!tokenFromSession || !tokenFromRequest || tokenFromSession !== tokenFromRequest) {
    logger.warn(`[CSRF] CSRF token validation FAILED for ${req.method} ${req.path}`);
    return res.status(403).json({ error: 'CSRF token validation failed' });
  }

  logger.debug(`[CSRF] CSRF token validation PASSED for ${req.method} ${req.path}`);
  next();
};

// Routes
// Login route: Redirect to registration if no user is registered
app.get('/login.html', asyncHandler(async (req, res) => {
  const redirect = req.query.redirect;
  logger.debug("Getting login page");
  if (serverConfig.server.hostname == "UNDEFINED") {
    serverConfig.server.hostname = req.hostname;
  }

  const userCount = await User.getUserCount();
  if (userCount > 0) {
    logger.debug("A user is registered");
    res.render('login', {
      version: version,
      redirect: redirect,
      csrf: req.csrfToken(),
    });
  } else {
    logger.warn("no user exists - switching to first time register");
    res.redirect('/register.html');
  }
}));

// Logout route
app.get('/logout.html', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login.html');
  });
});


app.post('/saveScript', express.json(), asyncHandler(async (req, res) => {
  const scriptName = req.body.scriptName.replace(/[^a-zA-Z0-9_.]/g, '');
  const scriptContent = req.body.script;
  const filePath = `./scripts/${scriptName}`;

  try {
    await asyncUtils.writeFileAsync(filePath, scriptContent);
    logger.info(`File ${scriptName} saved successfully`);
    res.json({ status: 'success', message: 'File saved successfully.' });
  } catch (error) {
    logger.error(`Error saving script ${scriptName}:`, error.message);
    throw new AppError(`Failed to save script: ${error.message}`, 500);
  }
}));

// Register route: displays registration form if allowed and not already registered
app.get('/register.html', asyncHandler(async (req, res) => {
  const userCount = await User.getUserCount();
  logger.debug("User Count:" + userCount);
  if (userCount <= 0) {
    res.render('register', { csrf: req.csrfToken() });
  } else {
    logger.warn("Register accessed when user already exists");
    res.redirect('/?message=Register+is+disabled');
  }
}));

app.post('/register.html', validateCsrf, asyncHandler(async (req, res) => {
  if (await User.getUserCount() <= 0) {
    const user = await User.createUser(req.body.username, req.body.email, req.body.password);
    res.redirect('/login.html?message=User+Created.+Please+authenticate+with+your+credentials');
  } else {
    throw new AppError('User registration is disabled', 400);
  }
}));

// Forgot password route: displays forgot password form
app.get('/forgot.html', (req, res) => {
  if(serverConfig.server.hostname=="UNDEFINED")serverConfig.server.hostname = req.hostname;
  res.render('forgot', { csrf: req.csrfToken() });
});

app.post('/forgot.html', validateCsrf, asyncHandler(async (req, res) => {
  const token = await User.generateResetToken(req.body.username);
  logger.info(`Reset token generated for user: ${req.body.username}`);
  const message = "Please+check+your+email+for+a+one+time+password+reset+link+to+continue";
  res.redirect('/login.html?message=' + message);
}));

// Reset password route: displays reset password form
app.get('/reset/:token/:user', asyncHandler(async (req, res) => {
  const tokenValid = await User.isResetTokenValid(req.params.user, req.params.token);
  if (tokenValid !== null) {
    res.render('reset', { token: req.params.token, user: req.params.user, csrf: req.csrfToken() });
  } else {
    res.redirect('/forgot.html?message=Your+one+time+reset+token+has+already+been+used+or+timed+out.+Please+reset+your+passsword+again');
  }
}));

app.post('/reset/:token/:user', validateCsrf, asyncHandler(async (req, res) => {
  const tokenValid = await User.isResetTokenValid(req.params.user, req.params.token);
  if (tokenValid !== null) {
    const resetSuccessful = await User.resetPassword(req.params.user, req.params.token, req.body.password);
    if (resetSuccessful) {
      logger.info(`Password reset successful for user: ${req.params.user}`);
      res.redirect('/login.html?message=Your+password+has+been+reset.+Please+login+with+your+new+credentials');
    } else {
      res.redirect(`/reset/${req.params.token}/${req.params.user}?message=Unable+to+reset+the+password`);
    }
  } else {
    res.redirect('/forgot.html?message=Your+one+time+reset+token+has+already+been+used+or+timed+out.+Please+reset+your+passsword+again');
  }
}));


app.post('/login.html', validateCsrf, asyncHandler(async (req, res) => {
  const { username, password, redirect } = req.body;
  const ipAddress = req.headers['x-forwarded-for'] || req.ip;
  logger.info(`Logging in user ${username} from IP: ${ipAddress}`);

  const user = await User.getUserByUsername(username.toLowerCase());
  if (!user) {
    logger.warn(`Login attempt for non-existent user: ${username}`);
    const loginUrl = new URL('/login.html', `${req.protocol}://${req.get('host')}`);
    loginUrl.searchParams.append('message', 'Invalid username or password');
    if (redirect) loginUrl.searchParams.append('redirect', redirect);
    return res.redirect(loginUrl.toString());
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    logger.warn(`Failed login attempt for user: ${username} from IP: ${ipAddress}`);
    if (serverConfig.server.loginFailEnabled == "true") {
      notifier.sendNotification("Authentication Failure",
        `User Login for account ${username} from IP: ${ipAddress} failed. If this was unexpected, please change the password immediately`,
        "WARNING");
    }
    const loginUrl = new URL('/login.html', `${req.protocol}://${req.get('host')}`);
    loginUrl.searchParams.append('message', 'Invalid username or password');
    if (redirect) loginUrl.searchParams.append('redirect', redirect);
    return res.redirect(loginUrl.toString());
  }

  logger.debug("passwords match - authentication successful");
  req.session.user = user;

  if (serverConfig.server.loginSuccessEnabled == "true") {
    notifier.sendNotification("UserAuthentication",
      `User Logged in for account ${username} from IP: ${ipAddress}`,
      "INFORMATION");
  }

  // Determine redirect location
  if (serverConfig.websocket_server.port && serverConfig.websocket_server.port !== null && serverConfig.websocket_server.port.length > 0) {
    if (redirect && redirect !== null) {
      logger.debug(`Found redirect in url: ${redirect}`);
      res.redirect(redirect);
    } else {
      res.redirect('/');
    }
  } else {
    // MQTT Not connected - go to initial setup
    res.redirect('/initial-setup-welcome.html');
  }
}));

//Initial setup
app.get('/initial-setup.html', User.isAuthenticated, asyncHandler(async (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html?not+authenticated');
  }

  res.render('initialsetup1', {
    version: version,
    serverConfig: serverConfig,
    csrf: req.csrfToken(),
  });
}));



//Initial setup MQTT
app.get('/initial-setup-mqtt.html',User.isAuthenticated, async (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html?not+authenticated');
  }

  const fullHost = req.get('host'); // or req.headers.host
  const hostName = fullHost.split(':')[0]; // This strips the port if it exists

  res.render('initialsetupMQTT',{
    version: version,
    serverConfig: serverConfig,
    hostName: hostName,
    csrf: req.csrfToken(),
  }); 
});


//Initial setup Welcome
app.get('/initial-setup-welcome.html',User.isAuthenticated, async (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html?not+authenticated');
  }

  const fullHost = req.get('host'); // or req.headers.host
  const hostName = fullHost.split(':')[0]; // This strips the port if it exists

  res.render('initialsetupWelcome',{
    version: version,
    serverConfig: serverConfig,
    hostName: hostName,
    csrf: req.csrfToken(),
  }); 
});

//Initial setup Complete
app.get('/initial-setup-complete.html',User.isAuthenticated, async (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html?not+authenticated');
  }

  res.render('initialsetupComplete',{
    version: version,
    serverConfig: serverConfig,
    csrf: req.csrfToken(),
  }); 
});

//Initial setup
app.get('/initial-setup-server.html',User.isAuthenticated, async (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html?not+authenticated');
  }

  const fullHost = req.get('host'); // or req.headers.host
  const hostName = fullHost.split(':')[0]; // This strips the port if it exists

  res.render('initialsetupServer',{
    version: version,
    serverConfig: serverConfig,
    hostName: hostName,
    csrf: req.csrfToken(),
  }); 
});

app.post('/initial-setup-server.html', validateCsrf, User.isAuthenticated, async (req, res) => {
  logger.debug("POST for initial-setup-server.html");
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html?not+authenticated');
  }

  var { wsServer,webserverPort, wsPort} = req.body;
  //var mqttEnabled = serverConfig.mqtt.enabled;
  serverConfig.websocket_server.server = wsServer;
  serverConfig.server.hostname = wsServer;
  serverConfig.server.port = webserverPort;
  serverConfig.websocket_server.port = wsPort;

  serverConfig.server.timezone = process.env.TZ || "UTC";

  confighandler.saveServerConfig();
  
  //if(mqttEnabled=="true")return res.redirect('/initial-setup-mqtt.html');
  return res.redirect('/initial-setup-complete.html');
  //if(mqttEnabled=="false")res.redirect('/initial-setup.html?message=One+of+WebSocket+or+MQTT+must+be+checked');
});



app.post('/initial-setup1.html', validateCsrf, User.isAuthenticated, async (req, res) => {
  logger.debug("POST for initial-setup1.html");
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html?not+authenticated');
  }

  var { websocket,mqtt} = req.body;
  var mqttEnabled = "false";

  if(mqtt && mqtt=="on")mqttEnabled="true";

  serverConfig.websocket_server.enabled = "true";
  serverConfig.mqtt.enabled = mqttEnabled;

  serverConfig.job_icons=[
    "work","cloud","save","storage","dns","layers","schema","delete","hub","insert_drive_file",
    "folder","folder_shared","folder_delete","folder_special","folder_zip","drive_folder_upload",
    "topic","rule_folder","sd_card","archive","library_music","video_library","video_camera_back",
    "photo_library","audio_file","password","account_box","build","restart_alt","start","stop_circle",
    "settings","security","safety_check","sports_esports","dangerous","error","favorite","send",
    "search","feed","shopping_cart","room_service","email","desktop_windows","camera_alt","laptop",
    "power_settings_new","router","schedule","flag","grade","image","key","receipt","money"
  ]

  logger.debug(`websocket ${websocket}, MQTT ${mqtt}`)
  confighandler.saveServerConfig();
  
  // if(mqttEnabled=="true")return res.redirect('/initial-setup-mqtt.html');
  // else return res.redirect('/initial-setup-complete.html');
  return res.redirect('/initial-setup-complete.html');
});


app.post('/initial-setupMQTT.html', validateCsrf, User.isAuthenticated, async (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html?not+authenticated');
  }

    var { mqttServer,mqttPort,mqttUsername,mqttPassword} = req.body;
    serverConfig.mqtt.server=mqttServer;
    serverConfig.mqtt.port=mqttPort;
    serverConfig.mqtt.username=mqttUsername;
    serverConfig.mqtt.password=mqttPassword;
    logger.debug(`MQTT Server ${mqttServer}, Port ${mqttPort}`)
    confighandler.saveServerConfig();
    
    try {
      logger.debug("Conneting to MQTT Server");
      await mqttTransport.connectToMQTTServer();
      logger.debug("Returned ok");
      // Connection successful, perform actions here
      return res.redirect('/initial-setup-complete.html');
    } 
    catch (error) {
      // Handle connection error here
      logger.warn("Unable to connect to MQTT server");
      logger.warn(error);
      return res.redirect('/initial-setupMQTT.html?message=Please+Check+Your+MQTT+Server+and+Settings');  
    }
});

app.post('/settings.html', validateCsrf, User.isAuthenticated, async (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html?not+authenticated');
  }

  var { protocol, serverHostname, serverPort, timezone, notificationType,loglevel,
    websocketEnabled,websocketServer,websocketPort,
    mqttEnabled,mqttServer,mqttPort,mqttUsername,mqttPassword,
    smtpEnabled, smtpServer, smtpPort, smtpSecure, smtpUsername, smtpPassword,smtpEmailFrom,smtpEmailTo,
    webHookUrl,iconslist,
    cpuThreshold, storageThreshold, cooldown,
    minDisconnectDurationForNotification,
    templateEnabled,templateServer,
    connectionEnabled,loginSuccessEnabled,loginFailEnabled,jobFailEnabled
    
  } = req.body;

  //Template
  if(templateEnabled=="on")templateEnabled="true";
  else templateEnabled="false";
  serverConfig.templates.enabled = templateEnabled;
  serverConfig.templates.repositoryUrl = templateServer;

  //Threshold values
  serverConfig.threshold.cpu_percent = cpuThreshold;
  serverConfig.threshold.filesystem_percent = storageThreshold;
  serverConfig.threshold.cooldown_mins = cooldown;

  //websocket Settings
  if(websocketEnabled=="on")websocketEnabled="true";
  else websocketEnabled="false";
  serverConfig.websocket_server.enabled = websocketEnabled;
  serverConfig.websocket_server.port = websocketPort;
  serverConfig.websocket_server.server = websocketServer;

  //MQTT Settings
  if(mqttEnabled=="on")mqttEnabled="true";
  else mqttEnabled="false";
  serverConfig.mqtt.enabled = mqttEnabled;
  serverConfig.mqtt.server = mqttServer;
  serverConfig.mqtt.port = mqttPort;
  if(mqttUsername!=null && mqttUsername.length>0){
    serverConfig.mqtt.username = mqttUsername;
    serverConfig.mqtt.password = mqttPassword;
  }

  //STMP Settings
  if(smtpEnabled=="on")smtpEnabled="true";
  else smtpEnabled="false";
  serverConfig.smtp.enabled = smtpEnabled;
  serverConfig.smtp.host = smtpServer;
  serverConfig.smtp.port = smtpPort;
  if(smtpSecure=="on")smtpSecure="true";
  else smtpSecure="false";
  serverConfig.smtp.secure = smtpSecure;
  serverConfig.smtp.username = smtpUsername;
  serverConfig.smtp.password = smtpPassword;
  serverConfig.smtp.emailFrom = smtpEmailFrom;
  serverConfig.smtp.emailTo = smtpEmailTo;

  //Webhook settings
  serverConfig.webhook.url = webHookUrl;

  //Server Settings
  serverConfig.server.loglevel = parseInt(loglevel);
  if(serverConfig.server.loglevel == 0)serverConfig.server.debug="false";
  else serverConfig.server.debug="true";
  serverConfig.server.clearData = "false";
  serverConfig.server.protocol = protocol;
  serverConfig.server.hostname = serverHostname;
  serverConfig.server.timezone = timezone;
  serverConfig.server.notificationType = notificationType;
  serverConfig.server.port = parseInt(serverPort);
  serverConfig.server.minDisconnectDurationForNotification = parseInt(minDisconnectDurationForNotification);

  serverConfig.server.connectionEnabled = connectionEnabled === "on" ? "true" : "false";
  serverConfig.server.loginSuccessEnabled = loginSuccessEnabled === "on" ? "true" : "false";
  serverConfig.server.loginFailEnabled = loginFailEnabled === "on" ? "true" : "false";
  serverConfig.server.jobFailEnabled = jobFailEnabled === "on" ? "true" : "false";
  

  //icons list
  const iconsList = iconslist.split(',');
  logger.debug("New iconsList:" + iconsList);
  serverConfig.job_icons = iconsList;

  confighandler.saveServerConfig();

  return res.redirect('/settings.html?message="Saved+Settings.+Please+restart+the+container+for+the+values+to+take+effect');
  //res.render('settings.ejs', { serverConfig, user });
});

app.get('/settings.html',User.isAuthenticated, async (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html');
  }
  res.render('settings.ejs', { serverConfig, user, csrf: req.csrfToken() });
});

// Backup Management Routes
// Configure multer for in-memory file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB max
});

app.get('/api/backup/items', User.isAuthenticated, (req, res) => {
  try {
    const items = backupManager.getBackupItems();
    res.json(items);
  } catch (err) {
    logger.error('Error getting backup items:', err);
    res.status(500).json({ error: 'Failed to get backup items' });
  }
});

app.post('/api/backup/create', User.isAuthenticated, asyncHandler(async (req, res) => {
  try {
    const options = req.body;
    logger.info('Creating backup with options:', options);

    // Create backup
    const backupBuffer = await backupManager.createBackup(options);

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const filename = `backuphub-backup-${timestamp}.zip`;

    // Send file to client
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', backupBuffer.length);
    res.send(backupBuffer);

    logger.info(`Backup downloaded: ${filename}`);
  } catch (err) {
    logger.error('Backup creation error:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Backup failed' });
  }
}));

app.post('/api/backup/restore', User.isAuthenticated, upload.single('backupFile'), asyncHandler(async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No backup file provided' });
    }

    logger.info('Starting backup restore from uploaded file');

    // Restore backup from upload
    const results = await backupManager.restoreBackup(req.file.buffer);

    logger.info('Backup restore completed:', results);
    res.json({
      success: true,
      itemsRestored: results.itemsRestored,
      warnings: results.warnings,
      recommendations: results.recommendations,
    });
  } catch (err) {
    logger.error('Backup restore error:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Restore failed' });
  }
}));

app.delete('/rest/notifications', User.isAuthenticated, (req, res) => {
  logger.info("Delete all notifications");
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html');
  }
  logger.info("Deleting all Notifications");
  var resp ="";
  try{
    resp = notificationData.deleteAll();  
  }
  catch(err){
    res.sendStatus(503);
  }
  logger.debug("all notifications deleted");
  res.sendStatus(200);
});

app.delete('/rest/notifications/:index', User.isAuthenticated, (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html');
  }
  const index = req.params.index;
  logger.info("Deleting Notification at index: " + index);
  var resp ="";
  try{
    resp = notificationData.deleteItem(index);  
  }
  catch(err){
    res.sendStatus(503);
  }
  logger.debug("notification at index [" + index + "] deleted");
  res.sendStatus(200);
});

app.get('/rest/agent/:id', User.isAuthenticated, (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html');
  }
  const id = req.params.id;
  logger.info("Getting Agent with ID: [" + id + "]");
  var agent = agents.getAgent(id);
  //var agent = agents.searchAgent(id);
  //console.log("Agent is: " + agent);
  res.setHeader("Content-Type","Application/JSON");
  res.send(agent);  
});

app.get('/rest/agent/:id/ping', User.isAuthenticated, (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html');
  }
  const id = req.params.id;
  logger.info("Pinging Agent with ID: " + id);
  //notificationData.deleteItem(index);
  pingIndividualRuntime(id);
  res.setHeader("Content-Type","Application/JSON");
  res.send('{"status":"ok"}');  
});

app.get('/rest/notifications', User.isAuthenticated, (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html');
  }
  var notifyObj = notificationData.getItems();
  res.setHeader("Content-Type","Application/JSON");
  res.send(notifyObj);
  //res.sendStatus(200);
});

app.get('/rest/notifications/count', User.isAuthenticated, (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html');
  }
  var notifyCount = notificationData.getCount();
  res.setHeader("Content-Type","Application/JSON");
  res.send(`{"count":${notifyCount}}`);
  //res.sendStatus(200);
});

app.get('/rest/notifty/test', User.isAuthenticated, (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html');
  }
  notifier.sendNotification("Test Notification","This is a test notification from BackupHub.","INFORMATION","/settings.html");
  res.sendStatus(200);
});

app.get('/rest/mqtt/reconnect', User.isAuthenticated, async (req, res) => {
  logger.info("Resetting MQTT connection")
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html');
  }

  var resp = null;
  try{
    logger.debug("Initiating new MQTT Connection");
    resp = await mqttTransport.startMqttConnectionProcess(true);
    logger.warn("Response is: " + resp);
    logger.debug("Initialized");
    if(resp!==null &&resp=="ok") res.sendStatus(200);
    else res.sendStatus(500);
  }
  catch (error){
    logger.error("Error occurred connecting to MQTT",error);
    res.sendStatus(500); 
  }
});

app.get('/profile.html',User.isAuthenticated, async (req, res) => {
  const user = req.session.user;
  if (!user) return res.redirect('/register.html');
  res.render('profile.ejs', { user, csrf: req.csrfToken() });
});

app.get('/about.html',User.isAuthenticated, async (req, res) => {

  const user = req.session.user;
  if (!user) return res.redirect('/register.html');

  res.render('about.ejs', { 
    user: User,
    version: version,
    csrf: req.csrfToken(),
   });
  
});

app.get('/runList/data',User.isAuthenticated, (req, res) => {
  var format = "json"
  if(req.query.format !==undefined && req.query.format!=null)format = req.query.format;

  var runningList = running.getItemsUsingTZ();
  var schedules = scheduler.getSchedules();

  for(var x=0;x<runningList.length;x++)
  {
    var workJob = runningList[x].jobName;
    for(var y=0;y<schedules.length;y++){
      if(workJob == schedules[y].jobName){
        runningList[x].icon=schedules[y].icon;
        runningList[x].color=schedules[y].color;
        break;
      }
    }
  }

  if(format.toUpperCase()=="HTML"){
    res.render('runningListData',{
      runningList: runningList,
      schedules: schedules,
      csrf: req.csrfToken(),
    });
  }
  else
  {
    var data={}
    data.running=runningList;
    data.schedules=schedules;
    res.send(data)
  }
});


app.get('/historyList/data',User.isAuthenticated, async (req, res) => {

  var format = "json"
  if(req.query.format !==undefined && req.query.format!=null)format = req.query.format;

  logger.info(`Format is ${format}`);
  var historyList = await hist.getItemsGroupedByOrchestration();
  var runningList = running.getItems();
  var schedules = scheduler.getSchedules();

  /*logger.debug(historyList);
  logger.debug("----");
  logger.debug(runningList);
  logger.debug("----");
  logger.debug(schedules);
  logger.debug("----");*/
  
  // Apply icons and colors from schedules
  function applyScheduleStyle(item) {
    var workJob = item.jobName;
    for(var y=0;y<schedules.length;y++){
      if(workJob == schedules[y].jobName){
        item.icon=schedules[y].icon;
        item.color=schedules[y].color;
        break;
      }
    }
    if(!item.icon ||  item.icon.trim()===''){
      item.icon = item.isOrchestration ? "hub" : "remove_circle";
      item.color = item.isOrchestration ? "#2196F3" : "#AAAAAA";
    }
  }
  
  for(var x=0;x<historyList.length;x++)
  {
    applyScheduleStyle(historyList[x]);
    
    // Also apply styles to child nodes if this is an orchestration item
    if (historyList[x].children) {
      for (var c = 0; c < historyList[x].children.length; c++) {
        applyScheduleStyle(historyList[x].children[c]);
      }
    }
  }

  var refresh = req.query["refresh"];
  if (refresh === undefined) refresh = 0;
  const sort = req.query.sort || 'jobName'; // Default sorting by jobName
  const order = req.query.order || 'asc'; // Default sorting order is ascending

  logger.info("GetHistoryListData: " + sort + " " + order);
  let sortedData;

  // Note: getItemsGroupedByOrchestration already returns data sorted by date (newest first)
  // Adjusting sort logic for grouped data
  if (sort === 'jobName') {
    sortedData = [...historyList].sort((a, b) => {
      if (order === 'asc') {
        return a.jobName.localeCompare(b.jobName);
      } else {
        return b.jobName.localeCompare(a.jobName);
      }
    });
  } else if (sort === 'runDate') {
    sortedData = [...historyList].sort((a, b) => {
      const dateA = new Date(a.runDate);
      const dateB = new Date(b.runDate);
      return order === 'asc' ? dateA - dateB : dateB - dateA;
    });
  } else if (sort === 'runTime') {
    sortedData = [...historyList].sort((a, b) => {
      return order === 'asc' ? a.runTime - b.runTime : b.runTime - a.runTime;
    });
  } else if (sort === 'status') {
    sortedData = [...historyList].sort((a, b) => {
      return order === 'asc' ? a.returnCode - b.returnCode : b.returnCode - a.returnCode;
    });
  } else {
    // Default sort already by newest first
    sortedData = [...historyList];
  }
 
  //var index=req.query.index;
  //var redir=req.query.redir;

  if(format.toUpperCase()=="HTML"){
    res.render('historyListData',{
      historyList: sortedData,
      schedules: schedules,
      sort: sort,
      order: order,  
      refresh: refresh,
      csrf: req.csrfToken(),
    });
  }
  else
  {
    var data={}
    data.history=sortedData;
    data.running=runningList;
    data.schedules=schedules;
    res.send(data)
  }
});

app.delete('/rest/history/clear', validateCsrf, User.isAuthenticated, asyncHandler(async (req, res) => {
  logger.info('Clearing all history items');
  try {
    await hist.clearHistory();
    res.json({ 
      success: true, 
      message: 'History cleared successfully' 
    });
  } catch (err) {
    logger.error('Error clearing history: ' + err.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to clear history: ' + err.message 
    });
  }
}));

app.get('/history.html',User.isAuthenticated, (req, res) => {

  var refresh = req.query["refresh"];
  if (refresh === undefined) refresh = 0;
  const sort = req.query.sort || 'jobName'; // Default sorting by jobName
  const order = req.query.order || 'asc'; // Default sorting order is ascending
  
  res.render('history',{
    refresh: refresh,
    sort:sort,
    order:order,
    csrf: req.csrfToken(),
  });
});

app.get('/rest/script/:script', User.isAuthenticated, (req, res) => {
  const scriptFilename = req.params.script;
  const mode = req.query.mode;
  const scriptPath = `./scripts/${scriptFilename}`;

  const baseDir = path.join(__dirname, 'scripts'); // Absolute base directory
  const testPath = path.join(baseDir, scriptFilename);

  // Check if the resolved path is within the base directory
  if (!testPath.startsWith(baseDir)) {
    return res.status(400).send('Invalid script filename');
  }

  // Validate filename format (e.g., only alphanumeric, hyphen, underscore, and .sh)
  if (!scriptFilename.match(/^[a-zA-Z0-9-_]+\.sh$/)) {
    return res.status(400).send('Invalid script filename');
  }

  // Read the content of the script file
  fs.readFile(scriptPath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).send('Error reading script file');
    }

    let beforeParams = '';
    let htmlContent = '';
    let afterParams = '';
    let capturingBefore = true;
    let capturingHtml = false;
    let capturingAfter = false;

    const lines = data.split('\n');
    for (const line of lines) {
      if (line.trim() === '#start-params') {
        capturingBefore = false;
        capturingHtml = true;
        beforeParams += line + '\n'; // Add the marker to beforeParams
        continue;
      } else if (line.trim() === '#end-params') {
        capturingHtml = false;
        capturingAfter = true;
        htmlContent += line + '\n'; // Add the marker to htmlContent
        continue;
      }

      if (capturingBefore) {
        beforeParams += line + '\n';
      } else if (capturingHtml) {
        htmlContent += line + '\n';
      } else if (capturingAfter) {
        afterParams += line + '\n';
      }
    }

    console.log("Before #start-params:", beforeParams);
    console.log("Between #start-params and #end-params (before sanitization):", htmlContent);
    console.log("After #end-params:", afterParams);

    // Sanitize only the HTML content between markers
    let sanitizedHtml = sanitizeHtml(htmlContent, {
      allowedTags: ['b', 'i', 'p', 'br'], // Only allow safe tags
      disallowedTagsMode: 'discard', // Remove disallowed tags completely
      allowedAttributes: {}, // No attributes allowed
      selfClosing: ['br'], // Ensure self-closing tags like <br> are handled correctly
      textFilter: function(text) {
        return text; // No additional text filtering needed
      },
      // Explicitly disallow dangerous tags
      disallowedTags: ['script', 'style', 'iframe', 'link', 'meta', 'object', 'embed', 'base', 'form', 'input'],
    });

    console.log("Sanitized HTML output:", sanitizedHtml);

    // Combine sanitized HTML with the rest of the script, including the markers
    let finalContent = beforeParams + sanitizedHtml + afterParams;

    // Send the combined content
    res.send(finalContent);
  });
});

app.get('/delete-schedule.html',User.isAuthenticated, (req, res) => {
  logger.warn("Deleting Schedule*******************");
  var jobName=req.query.jobName;
  logger.info("Deleting Schedule with jobName: " + jobName);
  scheduler.deleteSchedule(jobName);
  logger.debug("schedule deleted");
  res.redirect("/scheduleList.html?message=Deleted+schedule: " + jobName);
});


app.get('/scriptEditor.html',User.isAuthenticated, (req, res) => {
  //refresh the scripts list
  refreshScripts();

  var templateData = undefined;
  if(serverConfig.templates.enabled=="true")templateData=templates;
  res.render('scripteditor',{
    scripts: scripts,
    scriptsDesc: scriptsDesc,
    templates: templateData,
    csrf: req.csrfToken(),
  });
});

app.get('/scheduler.html',User.isAuthenticated, (req, res) => {
  logger.info("Scheduler.html");
  var index=req.query.index;
  var copyIndex=req.query.copyIndex;
  var internal=req.query.internal;
  var jobname=req.query.jobname;
  var redir=req.query.redir;
  var time=req.query.time;
  var day=req.query.day;
  var type=req.query.type;
  var copy = false;
  if(copyIndex!==undefined && copyIndex!==null){
    index = copyIndex;
    copy = true;    
  }
 
  if(index===undefined || index === null )index = scheduler.getScheduleIndex(jobname);
  var scheduleItem = scheduler.getSchedules(index);
 
  if(copy){
    scheduleItem = JSON.parse(JSON.stringify(scheduleItem));
    scheduleItem.index=undefined;
    index = undefined;
    scheduleItem.jobName = "Copy of " + scheduleItem.jobName;
  };
  //refresh the scripts list
  refreshScripts();

  //Get the schedule
  

  res.render('scheduler',{
    scripts: scripts,
    scriptsDesc: scriptsDesc,
    agents: agents.getDict(),
    schedule: scheduleItem,
    copy:copy,
    index:index,
    csrf: req.csrfToken(),  
    redir:redir,
    type:type,
    day:day,
    time:time,
    icons:serverConfig.job_icons,
    internal: internal
  });
});


app.get('/scheduleInfo/data/name',User.isAuthenticated, async(req, res) => {
  const user = req.session.user;
  
  if (!user) {
   
    return res.redirect('/register.html?not+authenticated');
  }
  
  const jobname=req.query.jobname;
  var index = scheduler.getScheduleIndex(jobname);
  var data = await getSchedulerData(index);
  res.setHeader("Content-Type","Application/JSON");
  res.send(data);
});

app.get('/scheduleInfo/data/:index',User.isAuthenticated, async(req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html?not+authenticated');
  }

  const index = req.params.index;
  var data = await  getSchedulerData(index);
  
  res.setHeader("Content-Type","Application/JSON");
  res.send(data);
});


app.get('/scheduleInfo.html',User.isAuthenticated, async(req, res) => {
  var index=req.query.index;
  var redir=req.query.redir;
  var jobname=req.query.jobname;

  if(jobname!==undefined && jobname !==null && jobname.length>0){
    //Find the index from the name
    logger.debug("Getting Sechedule for: " + jobname);
    index = scheduler.getScheduleIndex(jobname);
    logger.debug("Found job at index: " + index);
  }

  var refresh = req.query["refresh"];
  if (refresh === undefined) refresh = 0;
  var schedule = scheduler.getSchedules(index);

  //return logEvent.name + "_" + logEvent.jobName + "_" + type;
  var key1 = schedule.agent + "_" + schedule.jobName + "_" + "stats";
  var key2 = schedule.agent + "_" + schedule.jobName + "_" + "log";

  var stats = null;
  var log = null;
  try {
    stats = await db.simpleGetData(key1);
    log = await db.simpleGetData(key2);
  }
  catch(err){
     logger.warn("Unable to find stats/log data");
     logger.warn(JSON.stringify(err));
  }

  if(stats!=null){
    stats.current.etaDisplay = dateTimeUtils.displaySecs(stats.current.eta);
    stats.etaRollingAvgDisplay = dateTimeUtils.displaySecs(stats.etaRollingAvg);
  }
  else{
    if(stats !== undefined && stats!==null && (stats.etaRollingAvg == undefined || stats.etaRollingAvg ==null)) stats.etaRollingAvg=0;
  }

  res.render('scheduleInfo',{
    scripts: scripts,
    agent: agents.getAgent(schedule.agent),
    schedule: schedule,
    index:index,
    redir:redir,
    stats:stats,
    csrf: req.csrfToken(),
    log:log,
    refresh,refresh,
    hist:hist,
  });  
});



app.post('/scheduler.html', validateCsrf, User.isAuthenticated, (req, res) => {
  
  let { jobName, colour,  description, scheduleType, scheduleTime,dayOfWeek,
    dayInMonth,agentselect, agentcommand,commandparams,index,redir,icon } = req.body;
    jobName = sanitizeHtml(jobName);
    colour = sanitizeHtml(colour);
    scheduler.upsertSchedule(index, jobName, colour,  description, scheduleType, scheduleTime,dayOfWeek,
      dayInMonth,agentselect, agentcommand,commandparams,icon); 

  if(redir===undefined || redir === null || redir.length<=0)redir="/scheduleList.htm";
  res.redirect(redir);
});

app.get('/scheduleList.html',User.isAuthenticated, (req, res) => {
  //console.time('getSchedules');
  const schedules = scheduler.getSchedules();
  //console.timeEnd('getSchedules');
  //console.time('getHitstItems');
  const items = hist.getItemsUsingTZ();
  //console.timeEnd('getHitstItems');

  const lastRuns = {};
  for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (!lastRuns[item.jobName]) { // Only set if not already found (first from end = last run)
          lastRuns[item.jobName] = item;
      }
  }

  // Enhance schedules with precomputed lastRun
  const processedSchedules = schedules.map(schedule => ({
      ...schedule,
      returnCode: lastRuns[schedule.jobName] ? lastRuns[schedule.jobName].returnCode : '0',
      successPercentage: hist.getSuccessPercentage(schedule.jobName)
  }));

  console.time('render');
  res.render('scheduleList', {
    schedules: processedSchedules,
    hist:hist,
    csrf: req.csrfToken(), 
  });
  console.timeEnd('render');
});

app.get('/scheduleListCalendar.html',User.isAuthenticated, (req, res) => {
  const schedules = scheduler.getSchedules();
  viewType = req.query.viewType;
  inDate = req.query.inDate;
  if(viewType === undefined || viewType === null)viewType="weekly";
  res.render('scheduleListCalendar', {
    schedules: schedules,
    inViewType: viewType,
    inDate: inDate,
    csrf: req.csrfToken(),
  });
});

app.get('/runSchedule.html',User.isAuthenticated, asyncHandler(async (req, res) => {
  var index=req.query.index;
  var jobname=req.query.jobname;
  var redir=req.query.redir;
  logger.info(`Running Schedule - Index: ${index ?? 'undefined'}, Jobname: ${jobname ?? 'undefined'}`);
  
  if(redir===undefined || redir === null || redir.length<=0)redir="/scheduleInfo.html?index=" + index + "&refresh=3";
  
  let errorMessage = null;
  
  // Get the schedule - either by index or by jobname
  const schedules = scheduler.getSchedules();
  let schedule = null;
  
  if (index !== undefined && index !== null) {
    schedule = schedules[index];
  }
  
  // If not found by index, look up by jobname
  if (!schedule && jobname) {
    schedule = scheduler.getSchedule(jobname);
  }
  
  // Check if agent is online before attempting to run
  if (schedule) {
    const agent = agents.getAgent(schedule.agent);
    
    if (agent) {
      if (agent.status !== "online") {
        errorMessage = `Agent '${schedule.agent}' is ${agent.status} - cannot execute job`;
      }
    } else {
      errorMessage = `Agent '${schedule.agent}' does not exist`;
    }
  }
  
  // Only attempt to run if no pre-check errors
  if (!errorMessage) {
    var status = await scheduler.manualJobRun(index,jobname);
    logger.info(`Job execution status: ${status}`)
    if(status!="ok") {
      errorMessage = "Job execution failed";
    }
  }
  
  if(errorMessage) {
    logger.info(`Job failed: ${errorMessage}`);
    const separator = redir.includes('?') ? '&' : '?';
    const encodedMsg = encodeURIComponent(errorMessage);
    redir += separator + "message=" + encodedMsg;
  }
  res.redirect(redir);
}));

app.get('/edit/:index',User.isAuthenticated, (req, res) => {
  const index = req.params.index;
  const schedules = scheduler.getSchedules();
  const schedule = schedules[index];

  res.render('scheduler', { 
    schedules, 
    index,
    scripts: scripts,
    agents: agents.getDict(), 
    csrf: req.csrfToken(),
  });
});

app.post('/edit/:index', validateCsrf, User.isAuthenticated, (req, res) => {
  const index = req.params.index;
  const schedules = scheduler.getSchedules();
  const schedule = schedules[index];

  schedule.jobName = req.body.jobName;
  schedule.scheduleType = req.body.scheduleType;
  schedule.scheduleTime = req.body.scheduleTime;

  //writeSchedules(schedules);

  res.redirect('/schedules');
});

app.get('/rest/jobs',User.isAuthenticated, (req, res) => {
  //populateBackupConfig();
  res.header('Content-type', 'application/json');
  res.send(JSON.stringify(config, null, "  "));
});

app.get('/',User.isAuthenticated, (request, response) => {

  var historyList = hist.getItemsUsingTZ();
  var runningList = running.getItemsUsingTZ();
  var agentsDict = agents.getDict();
  var chartData = hist.getChartDataSet(7);

  var username = request.session.user.username;
  if(username===undefined || username===null)username="User";

  var runningCount = runningList.length;
  var successCount = 0;
  var failCount = 0;

  for(var i=0;i<historyList.length;i++)
  {
    if(parseInt(historyList[i].returnCode)==0){
      successCount++
    }
    else{
      failCount++;
    }
  }

  //scheduler.getTodaysScheduleCount();
  

  response.render('index', {

    subject: 'BackupHub',
    name: 'Control',
    runningCount: runningCount,
    successCount, successCount,
    failCount, failCount,
    chartData: chartData,
    agents,agentsDict,
    username:username,
    mqttConnected: mqttTransport.isMQTTConnected(),
    todayJobs: scheduler.getTodaysScheduleCount(),
    scheduleHistory: scheduler.getLast7DaysScheduleCount(),
    todayJobsRun: hist.getTodaysRun()
  });
});

app.get('/index.html',User.isAuthenticated, (request, response) => {
  // response.render('index', {
  //   subject: 'EJS template engine',
  //   name: 'Control',
  // });
  response.redirect("/");
});




app.get('/agentHistory.html',User.isAuthenticated, async (request, response) => {
  var agentname = request.query.name;
  var startDate = request.query.startDate;
  var dateNow = new Date();
  var agent = agents.getAgent(agentname);
  if(agent===undefined)agent={};

  var agentData;
  agentData=agentStats.get(agentname);
  if(agentData===undefined)agentData={};
  else agentData=JSON.parse(agentData);
  

  response.render('agentHistory', {
    agentname: agentname,
    timezone: serverConfig.server.timezone,
    serverTime: dateNow,
    agent: agent,
    agentData: agentData  
  });
});


app.get('/rest/servertime',User.isAuthenticated, async (request, response) => {
  var dateTime = new Date();
  var serverTime={};
  serverTime.dateTime = dateTime;
  response.json(serverTime);
});


app.get('/rest/agentdetail',User.isAuthenticated, async (request, response) => {
  
  var agentname = request.query.agentname;
  logger.info("Getting agent detail for Agent [" + agentname + "]")
  var startDate = request.query.startDate;
  var endDate = request.query.endDate;
  logger.info("Start Date [" + startDate + "]")
  logger.info("End Date   [" + endDate + "]")

  var agent = agents.getAgent(agentname);
  if(agent===undefined)agent={};
  var history = {};
  //var item = await agentHistory.getStatus(agentname);
  var item = await agentHistory.getDateFilteredStatus(agentname,startDate,endDate);
  //debug.info("Items are: " + item);
  
  var totalDuration = 0;
  for (let i = 0; i < item.length; i++) {
    //debug.debug("adding: " + item[i].duration);
    totalDuration+=item[i].duration;
  }

  for (let i = 0; i < item.length; i++) {
    //debug.debug("adding: " + item[i].duration);
    var pct = (item[i].duration / totalDuration) * 100.00;
    //pct = Math.round(pct);
    pct=mathUtils.roundToDecimalPlaces(pct,5);
    item[i].percent=pct;
  }
  var totalPct=0;
  for (let i = 0; i < item.length; i++) {
    totalPct += item[i].percent;
  }

  var data={};
  data.filter={};
  data.filter.startDate=startDate;
  data.filter.endDate=endDate;
  data.totalDuration=totalDuration;
  data.totalPct=totalPct;
  data.history=item;
  response.json(data);
});


app.get('/rest/agentquery',User.isAuthenticated, (request, response) => {
  var agentname = request.query.name;
  var agent = agents.getAgent(agentname);
  response.header('Content-type', 'application/json');
  if(agent===undefined)agent={};
  agent.found="false";
  response.send(JSON.stringify(agent,null,2));
});

app.get('/agentEdit.html',User.isAuthenticated, (request, response) => {
  var msg = request.query.agentId;
  var agentObj=agents.getAgent(msg);
  response.render('agentEdit', {
    subject: 'Agent Edit',
    name: 'Control/AgentEdit',
    agent: agentObj,
    scripts: scripts,
    csrf: request.csrfToken(),
  });
});

app.get('/agentregister.html',User.isAuthenticated, (request, response) => {
  var msg = request.query.message;
  var agentObj=JSON.parse(msg);
  response.render('agentregister', {
    subject: 'EJS template engine',
    name: 'Control/AgentRegister',
    agent: agentObj,
    scripts: scripts,
    csrf: request.csrfToken(),
  });
});

app.get('/agentstatus.html',User.isAuthenticated,async (request, response) => {

    var agentdict = agents.getDict();
    var history = {};
    
    for (const [key, value] of Object.entries(agentdict)) {
      var item = await agentHistory.getStatus(key);
      //console.log(">>>>>>>>>>>>>>>>>>>>>>");
      //console.log(JSON.stringify(key));
      //console.log(JSON.stringify(value));
      //console.log(">>>> AGENT DATE: " + item.date);
      value.lastStatusReport = dateTimeUtils.displayFormatDate(new Date(value.lastStatusReport),false,serverConfig.server.timezone,"YYYY-MM-DDTHH:mm:ss",false);
            

      history[key]={};
      history[key].list=item;
    }

    //console.log(history);

    
    
    response.render('agentstatus', {
    subject: 'EJS template engine',
    name: 'Control/AgentStatus',
    logs: logsStr,
    agents: agentdict,
    history: history,
    MQTT_ENABLED: serverConfig.mqtt.enabled,
    MQTT_SERVER_PORT: serverConfig.mqtt.port,
    MQTT_SERVER: serverConfig.mqtt.server,
    WS_ENABLED: serverConfig.websocket_server.enabled,
    WS_SERVER: serverConfig.websocket_server.server,
    WS_PORT: serverConfig.websocket_server.port,
    serverVers: minSupportedVersion
    //agentHistory:agentHistory,
  });
});


app.get('/rest/eta',User.isAuthenticated, (request, response) => {
  //populateBackupConfig();
  response.header('Content-type', 'application/json');
  response.send(JSON.stringify(config,null,2));
});

var logsStr = "";


app.post('/agent-submit.html', validateCsrf, User.isAuthenticated, (req, res) => {
  //Get the form data
  
  var name = req.body.agentname;
  var command = req.body.agentcommand;
  var description = req.body.agentdescription;
  var imageurl = req.body.imageurl;

  agents.registerAgent(name,description,command,imageurl,undefined,description);
  res.redirect("/agentstatus.html");

});

app.post('/agentEdit.html', validateCsrf, User.isAuthenticated, async (req, res) => {
  try {
    //Get the form data
    var name = req.body.agentname;
    var description = req.body.agentdescription;
    var imageurl = req.body.imageurl;
    var agentObj = agents.getAgent(name);
    agentObj.display = description;
    await agents.addObjToAgentStatusDict(agentObj);

    //agents.registerAgent(name,description,command,imageurl,undefined,description);
    res.redirect("/agentstatus.html");
  } catch (err) {
    logger.error(`Failed to update agent [${req.body.agentname}]:`, err.message);
    res.status(500).send('Error updating agent');
  }
});

app.get('/socket.io/socket.io.js', (req, res) => {
  res.sendFile(__dirname + '/node_modules/socket.io/client-dist/socket.io.js');
});


app.get('/rest/debug/logs', User.isAuthenticated, async (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html');
  }
  const logMessages = loglines.map(log => log.data.join(' ')); // Extract log messages
  res.json(logMessages); // Send log messages as JSON
});


app.get('/rest/debug/on', User.isAuthenticated, async (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html');
  }

  try {
    logger.level="trace";
    const statusJsonStr = JSON.stringify({"logger_level":logger.level}); 
    res.set('Content-Type', 'application/json'); // Set the content-type header
    res.send(statusJsonStr); // Send the JSON response
  } catch (error) {
    console.error("Error in API:", error);
    res.status(500).json({ status: "error", message: "Internal Server Error" });
  }
});


app.get('/rest/debug/off', User.isAuthenticated, async (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html');
  }

  try {
    logger.level="warn";
    const statusJsonStr = JSON.stringify({"logger_level":logger.level}); 
    res.set('Content-Type', 'application/json'); // Set the content-type header
    res.send(statusJsonStr); // Send the JSON response
  } catch (error) {
    console.error("Error in API:", error);
    res.status(500).json({ status: "error", message: "Internal Server Error" });
  }
});

app.get('/rest/updateAgent/:agentId/isRunning', express.json(), User.isAuthenticated, (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html');
  }
  const agentId = req.params.agentId;
  logger.debug(`Getting Job Status update for agent [${agentId}]`);

  var runningList = running.searchItemWithName("||INTERNAL||Update " + agentId);
  logger.debug(JSON.stringify(runningList));
  var response={};

  if(runningList!=null){
    response.status=true;
    response.item=runningList;
  }
  else {
    response.status=false;
    response.item=runningList
  }

  res.set('Content-Type', 'application/json'); // Set the content-type header
  res.send(response);
});

app.get('/rest/updateAgent/:agentId/status', express.json(), User.isAuthenticated, (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html');
  }
  const agentId = req.params.agentId;
  var agent = agents.getAgent(agentId);

  var searchTerm = "||INTERNAL||Update " + agentId;
  var runningList = running.searchItemWithName(searchTerm);
  var response = {};
  response.status = "ERROR";
  response.message = "";
  response.agent = agent;
  if(runningList!=null){
    //Job Is running
    response.status="RUNNING";
    response.item = runningList;
  }
  else {
    //Job is not running - Whats status of last completed item  
    response.status="COMPLETED";
    logger.debug(`Getting Job Status update for agent [${agentId}]`);
    var historyItem = hist.searchItemWithName("||INTERNAL||Update " + agentId);
    response.item=historyItem;
    if(historyItem!=null){
      if(response.item.returnCode!=0){
        response.status="ERROR"
        message=response.item.log;  
      }
    }
    else{
      response.status="UNKOWN";
      response.item = undefined;
      response.message = "No running, or historical log of uprade";
    }

    if(response.status=="COMPLETED"){
      //Now see if the agent is actually connected because once the job is finished, the agent goes into a restart

      var agentStatus = agent.status;
      var agentReportDate = agent.lastStatusReport;
      
      const ONLINE  = "online";
      const OFFLINE = "offline";
      const RUNNING = "running";
      
      if(agent.status == OFFLINE){
        response.status="WAITING_AGENT_CONNECTION";
        response.message=`Agent in status [${agent.status}]. Waiting for connection`;
      }

    }
  }
  

  res.set('Content-Type', 'application/json'); // Set the content-type header
  res.send(response);
});


app.post('/rest/updateAgent/:agentId', express.json(), User.isAuthenticated, (req, res) => {
  
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html');
  }
  const agentId = req.params.agentId;
  const jsonData = req.body;
  
  try{

    //Issue a job execution to run the update script
    logger.debug(`Recevied [${JSON.stringify(jsonData)}]`);
    logger.debug(`starting update for agent [${agentId}] with command [${jsonData.command}]`);
    //scheduler.runUpdateJob(agentId,jsonData);
    res.set('Content-Type', 'application/json'); // Set the content-type header
    scheduler.runUpdateJob(agentId,jsonData.command); 
    res.send({"status":"ok"}); // Send the JSON response
  }
  catch(err){
    logger.error(err);
    res.status(500).json({ status: "error", message: "Internal Server Error [" + err.name +"]" + err.message});
  }
});

app.get('/rest/templates', User.isAuthenticated, async (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html');
  }
  var templateRepository = {};
  templateRepository.status="unknown";
  templateRepository.date=new Date();
  templateRepository.templates = templates;
  templateRepository.status="Retrieved Templates from cache";
  templateRepository.date=new Date();
  res.set('Content-Type', 'application/json'); // Set the content-type header
  res.send(templateRepository);
});

app.get('/rest/templates/refresh', User.isAuthenticated, async (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html');
  }
  var templateRepository = {};
  templateRepository.status="unknown";

  if(serverConfig.templates && serverConfig.templates.enabled=="true"){
    (async () => {
      templates = new TemplateRepository(serverConfig.templates.repositoryUrl);
      await templates.init();
    })();
    templateRepository.status="refreshed" 
    templateRepository.date=new Date();
  }
  else{
    templateRepository.status="Template Scripts Disabled";
    templateRepository.templates = null;
    logger.info("Template Scripts Disabled");
  }
  res.set('Content-Type', 'application/json'); // Set the content-type header
  res.send(templateRepository);

});

app.get('/rest/debug', User.isAuthenticated, async (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html');
  }
  
  //build debug Object
  var debug={};
  debug.settings={};
  debug.settings.REPOSITORY_URL= REPOSITORY_URL;
  debug.settings.serverConfig = serverConfig;
  debug.connections={};
  debug.connections.mqtt={};
  debug.connections.mqtt.transport = mqttTransport;
  debug.connections.ws={};
  debug.connections.ws.transport= webSocketServer;
  debug.connections.ws.wsClients=wsClients;
  debug.logger={};
  debug.logger.level = logger.level;

  debug.history={};

//  debug.user={}
//  debug.user.info={};
//  debug.user.userCount=await User.getUserCount();
//  debug.user.info.username = user

  try{
    var debugStr = maskPasswords(JSON.stringify(debug));
    res.set('Content-Type', 'application/json'); // Set the content-type header
    res.send(debugStr); // Send the JSON response
  }
  catch(err){
    res.status(500).json({ status: "error", message: "Internal Server Error [" + err.name +"]" + err.message});
  }
});


app.use((req, res, next) => {
  res.on('finish', () => {
    if (!res.headersSent) {
      clearInterval(pingRuntimeCheck);
      clearInterval(offlineCheck)
      clearInterval(reestablishConn);
    }
  });
  next();
});

//______________________________________________________________________________________________________

const pingRuntimeCheck = setInterval(pingRuntimes, pingInterval * 1000); // 60 seconds * 1000 milliseconds
const offlineCheck     = setInterval(markOffline, (pingInterval * failedPingOffline+1) * 1000);
//const reestablishConn  = setInterval(mqttTransport.startMqttConnectionProcess,30*1000);


function pingIndividualRuntime(inAgentName){
  //var agent = agents.getAgent(inAgentName)
  logger.info("[pingIndividualRuntime] Pinging runtime [" + inAgentName + "]");  
  agentComms.pingAgent(undefined,inAgentName);
}

function pingRuntimes()
{

  agentComms.pingAllAgents(agents.getDict());
}

function markOffline()
{
  var agentStatusDict = agents.getDict();
  logger.info("Running offline check for runtimes");
  for (const [key, value] of Object.entries(agentStatusDict)) {
   //if(value.status!="register" && value.status !="offline")
   //{
      logger.debug("Offline check for runtime [" + key + "]");    
      var now = new Date();
      var lastUpd = value.lastStatusReport;
      
      //debug.debug(`NOW   [${now.toISOString()}]`);
      //debug.debug(`LAST  [${lastUpd}]`);
      var lastDte = new Date(lastUpd);
      var diff = Math.floor((now.getTime() - lastDte.getTime()) /1000 /60);
      logger.debug(`DIFF  [${diff}mins]`);
      if(diff >= 1)
      {
        logger.warn(`Marking Agent [${key} as Offline`);
        agents.updateAgentStatus(key,"offline","",null,null,null,"");
        client = findClientByPrefix(key);
        var connId;
        if(client!==undefined){
          try{ 
            connId = client.connectionId;
            client.close();
          } catch (err) {
            logger.debug("Unable to close client",err);
          }
          logger.info(`Evicting dead client connection [${connId}]`);
          try{ 
            wsClients.delete(connId); 
          } catch (err) {
            logger.debug("Unable to remove: " + connId,err)
          }

        }
        //webSocketServer.forceCloseRemove(key);
      }
    //}
  }
}

// ============================================================================
// ORCHESTRATION JOBS - REST API ENDPOINTS
// ============================================================================

/**
 * Get list of all orchestration jobs
 */
app.get('/rest/orchestration/jobs', User.isAuthenticated, asyncHandler(async (req, res) => {
  const jobs = await orchestration.getAllJobs();
  res.json(jobs);
}));

/**
 * Get a specific orchestration job
 */
app.get('/rest/orchestration/jobs/:jobId', User.isAuthenticated, asyncHandler(async (req, res) => {
  const job = await orchestration.getJob(req.params.jobId);
  res.json(job);
}));

/**
 * Create or update an orchestration job
 */
app.post('/rest/orchestration/jobs', validateCsrf, User.isAuthenticated, asyncHandler(async (req, res) => {
  const { jobId, name, description, nodes, edges } = req.body;
  
  if (!jobId || !name) {
    return res.status(400).json({ error: 'Job ID and name are required' });
  }
  
  const job = await orchestration.saveJob(jobId, {
    name,
    description,
    nodes,
    edges
  });
  
  res.json({ success: true, job });
}));

/**
 * Update an existing orchestration job
 */
app.put('/rest/orchestration/jobs/:jobId', validateCsrf, User.isAuthenticated, asyncHandler(async (req, res) => {
  const { name, description, nodes, edges } = req.body;
  const { jobId } = req.params;
  
  const job = await orchestration.saveJob(jobId, {
    name,
    description,
    nodes,
    edges
  });
  
  res.json({ success: true, job });
}));

/**
 * Delete an orchestration job
 */
app.delete('/rest/orchestration/jobs/:jobId', validateCsrf, User.isAuthenticated, asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  
  await orchestration.deleteJob(jobId);
  res.json({ success: true, message: `Orchestration job [${jobId}] deleted` });
}));

/**
 * Execute an orchestration job
 */
app.post('/rest/orchestration/jobs/:jobId/execute', validateCsrf, User.isAuthenticated, asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  
  logger.info(`Executing orchestration job [${jobId}]`);
  
  const executionLog = await orchestration.executeJob(jobId);
  await orchestration.saveExecutionResult(executionLog);
  
  res.json({ 
    success: true, 
    execution: executionLog 
  });
}));

/**
 * Get execution history for a job
 */
app.get('/rest/orchestration/jobs/:jobId/executions', User.isAuthenticated, asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  
  const executions = await orchestration.getExecutionHistory(jobId);
  res.json(executions);
}));

/**
 * Get list of available scripts for the palette
 */
app.get('/rest/orchestration/scripts', User.isAuthenticated, asyncHandler(async (req, res) => {
  const scripts = await orchestration.getAvailableScripts();
  res.json(scripts);
}));

/**
 * Get list of available agents for orchestration execution
 */
app.get('/rest/orchestration/agents', User.isAuthenticated, asyncHandler(async (req, res) => {
  const agentDict = agents.getDict();
  const agentList = Object.entries(agentDict).map(([name, agent]) => ({
    id: name,
    name: name,
    description: agent.description || '',
    status: agent.status || 'offline',
    address: agent.address || '',
    version: agent.version || ''
  }));
  res.json(agentList);
}));

/**
 * Orchestration UI pages
 */
app.get('/orchestrationList.html', User.isAuthenticated, asyncHandler(async (req, res) => {
  res.render('orchestrationList', { csrfToken: req.csrfToken() });
}));

app.get('/orchestrationBuilder.html', User.isAuthenticated, asyncHandler(async (req, res) => {
  const jobId = req.query.id; // undefined for new jobs, or specific ID for editing
  res.render('orchestrationBuilder', { 
    csrfToken: req.csrfToken(),
    jobId: jobId || ''
  });
}));

/**
 * Orchestration Monitor/Detail Routes
 */
app.get('/orchestration/monitor.html', User.isAuthenticated, asyncHandler(async (req, res) => {
  const jobId = req.query.jobId;
  const executionIndex = req.query.executionIndex || 'latest';
  
  if (!jobId) {
    return res.status(400).send('Job ID is required');
  }
  
  res.render('orchestrationMonitor', { 
    csrfToken: req.csrfToken(),
    jobId: jobId,
    executionIndex: executionIndex
  });
}));

app.get('/orchestration/execution/details', User.isAuthenticated, asyncHandler(async (req, res) => {
  const orchestrationMonitor = require('./orchestrationMonitor.js');
  const jobId = req.query.jobId;
  let executionIndex = req.query.executionIndex || 'latest';
  const executionId = req.query.executionId;
  
  if (!jobId) {
    return res.status(400).json({ error: 'Job ID is required' });
  }
  
  // If executionId is provided, resolve it to an index
  if (executionId && executionIndex === 'latest') {
    const index = await orchestrationEngine.getExecutionIndexById(jobId, executionId);
    if (index >= 0) {
      executionIndex = index;
    }
  }
  
  const details = await orchestrationMonitor.getExecutionDetails(jobId, executionIndex);
  res.json(details);
}));

app.get('/orchestration/node/output', User.isAuthenticated, asyncHandler(async (req, res) => {
  const orchestrationMonitor = require('./orchestrationMonitor.js');
  const jobId = req.query.jobId;
  const nodeId = req.query.nodeId;
  let executionIndex = req.query.executionIndex || 'latest';
  const executionId = req.query.executionId;
  
  if (!jobId || !nodeId) {
    return res.status(400).json({ error: 'Job ID and Node ID are required' });
  }
  
  // If executionId is provided, resolve it to an index
  if (executionId && executionIndex === 'latest') {
    const index = await orchestrationEngine.getExecutionIndexById(jobId, executionId);
    if (index >= 0) {
      executionIndex = index;
    }
  }
  
  const output = await orchestrationMonitor.getNodeOutput(jobId, nodeId, executionIndex);
  res.json(output);
}));

// ============================================================================
// ERROR HANDLING MIDDLEWARE (must be registered last)
// ============================================================================
app.use(errorHandlerMiddleware);

// ============================================================================
// SERVER RESTART NOTIFICATION
// ============================================================================
/**
 * Notify all agents that the server has restarted
 * This allows agents to reset their connection backoff and reconnect immediately
 */
async function notifyAgentsOfRestart() {
  try {
    const agentDict = agents.getDict();
    const http = require('http');
    
    if (!agentDict || Object.keys(agentDict).length === 0) {
      logger.info('No agents registered, skipping restart notifications');
      return;
    }
    
    const notificationPromises = [];
    const AGENT_HTTP_PORT = 49991;
    const REQUEST_TIMEOUT = 3000; // 3 seconds timeout per request
    
    for (const [agentName, agent] of Object.entries(agentDict)) {
      // Skip if agent doesn't have an address
      if (!agent.address) {
        logger.debug(`Agent [${agentName}] has no address, skipping restart notification`);
        continue;
      }
      
      const promise = new Promise((resolve) => {
        const postData = JSON.stringify({
          timestamp: new Date().toISOString()
        });
        
        const options = {
          hostname: agent.address,
          port: AGENT_HTTP_PORT,
          path: '/api/server-restart',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          },
          timeout: REQUEST_TIMEOUT
        };
        
        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            if (res.statusCode === 200) {
              logger.info(`Server restart notification sent to agent [${agentName}] at [${agent.address}:${AGENT_HTTP_PORT}]`);
            } else {
              logger.warn(`Server restart notification to agent [${agentName}] returned status code ${res.statusCode}`);
            }
            resolve();
          });
        });
        
        req.on('timeout', () => {
          req.destroy();
          logger.warn(`Server restart notification to agent [${agentName}] at [${agent.address}:${AGENT_HTTP_PORT}] timed out`);
          resolve();
        });
        
        req.on('error', (error) => {
          logger.warn(`Failed to notify agent [${agentName}] at [${agent.address}:${AGENT_HTTP_PORT}] of server restart: ${error.message}`);
          resolve();
        });
        
        req.write(postData);
        req.end();
      });
      
      notificationPromises.push(promise);
    }
    
    // Wait for all notifications to complete (or timeout)
    if (notificationPromises.length > 0) {
      await Promise.all(notificationPromises);
      logger.info(`Sent restart notifications to ${notificationPromises.length} agent(s)`);
    }
  } catch (error) {
    logger.error(`Error notifying agents of server restart: ${error.message}`);
  }
}

//______________________________________________________________________________________________________

var server = app.listen(port, async function () {
  var host = server.address().address
  var port = server.address().port
  debug.startBanner(version);
  logger.info("\x1b[32mListening on port: " + port);
  //if(debug.enabled())debug.warn("DEBUG ENABLED");
  logger.info("\x1b[32m----------------------------------------------------------------------------------------------\x1b[0m\n");
  
  try {
    passman.checkKey();

    await scheduler.init();
    logger.info('Scheduler initialized successfully');
    
    await orchestration.init();
    logger.info('Orchestration module initialized successfully');
    
    // Migrate to versioned format if needed
    try {
      const migratedCount = await orchestration.migrateToVersionedFormat();
      if (migratedCount > 0) {
        logger.info(`Migrated ${migratedCount} orchestrations to versioned format`);
      }
    } catch (err) {
      logger.error('Error during orchestration versioning migration:', err.message);
    }
    
    hist.init();
    //debug.Info("initiatilizing notification data");
    await notificationData.init();
    logger.debug('Initiatilizing notification data completed.');
    
    await running.init();
    
    // Notify all agents that the server has restarted
    await notifyAgentsOfRestart();
  } catch (error) {
    logger.error('Error during server startup initialization:', error.message);
  }
})
  

//Initialize the Browser Comms websocket
webSocketBrowser.init(server);

//Init the templates
if(serverConfig.templates && serverConfig.templates.enabled=="true"){
  (async () => {
    templates = new TemplateRepository(serverConfig.templates.repositoryUrl);
    await templates.init();
  })();
}
else{
  logger.info("Template Scripts Disabled");
}