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
var querystring = require('querystring');
var https = require('https');
var bodyParser = require('body-parser');

const User = require('./models/user');
dateTimeUtils = require('./dateTimeUtils.js');
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
//const moment = require('moment-timezone');

agentComms = require ("./communications/agentCommunication.js");
mqttTransport = require ("./communications/mqttTransport.js");
mqttTransport.init();

webSocketBrowser = require('./communications/wsBrowserTransport.js');
webSocketServer = require("./communications/wsServerTransport.js");
webSocketServer.init();


const HashMap = require("./HashMap.js");
agentStats = new HashMap();
wsClients = new HashMap();

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
if(serverConfig.server.clearData=="true"){
  logger.warn("!!!!!!!!!!!!!!!!!!!!!!!!!");
  logger.warn("!! CLEARING DATA STORE !!");
  logger.warn("!!!!!!!!!!!!!!!!!!!!!!!!!");
  db.clear(db.callback);
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
agents.init();

//var agentConfig = require("./NOT_USED_agentConfig.js");
//agentConfig.initialize("./data/agent-config.db",logger);
//agentConfig.migrate(agents.getDict());


const logpath = "/media/net/BackupHOMENAS/backups/";
//const schedulePath = "/media/net/homenasdave/backup-controller/schedule.cfg";
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

function displaySecs(secs) {
  var ret;
  //Secs
  if (secs < 300) ret = secs + " secs";

  if (secs >= 300 && secs < 7200) {
    //Mins
    var mins = Math.floor(secs / 60);
    secs = secs % 60;

    ret = mins + " mins ";

  }
  if (secs >= 7200 && secs < 86400) {
    //hours
    var mins = Math.floor(secs / 60);
    var secs = secs % 60;
    var hours = Math.floor(mins / 60);
    mins = mins % 60;
    ret = hours + "h " + mins + " mins";
  }

  if (secs >= 86400) {
    var mins = Math.floor(secs / 60);
    var secs = secs % 60;
    var hours = Math.floor(mins / 60);
    var days = Math.floor(hours / 24);
    hours = hours - (days * 24);
    //hours = days %24;
    mins = mins % 60;
    ret = days + " days " + hours + "h ";

  }

  return ret;
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
    stats.current.etaDisplay = displaySecs(stats.current.eta);
    stats.etaRollingAvgDisplay = displaySecs(stats.etaRollingAvg);
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
  data.hist.histAvgRuntimeSecs = displaySecs(hist.getAverageRuntime(schedule.jobName));
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

// Routes
// Login route: Redirect to registration if no user is registered
app.get('/login.html', async (req, res) => {
  try {
    const redirect=req.query.redirect;
    logger.debug("Getting login page");
    if(serverConfig.server.hostname=="UNDEFINED")serverConfig.server.hostname = req.hostname;

    if(await User.getUserCount()>0){
      logger.debug("A user is registered");
      res.render('login',{
        version: version,
        redirect: redirect,
      });
    } else {
      logger.warn("no user exists - switching to first time register");
      res.redirect('/register.html');
    }
  } catch (error) {
    console.error(error);
    res.redirect('/');
  }
});

// Logout route
app.get('/logout.html', (req, res) => {
  //req.session.destroy();
  //res.redirect('/login.html');  
  req.session.destroy(() => {
    res.redirect('/login.html');
  });
});


app.post('/saveScript', express.json(), (req, res) => {
  //console.log(req.body);
  const scriptName = req.body.scriptName.replace(/[^a-zA-Z0-9_.]/g, '');
  const scriptContent = req.body.script;
  //console.log("SCRIPT NAME:" + scriptName);
  //console.log("SCRIPT CONTENT" + scriptContent);
  const filePath = `./scripts/${scriptName}`;

  fs.writeFile(filePath, scriptContent, { flag: 'wx' }, (err) => {
    if (err) {
      if (err.code === 'EEXIST') {
        fs.writeFile(filePath, scriptContent, (err) => {
          if (err) {
            console.error(err);
            res.status(500).json({ status: 'error', message: 'Failed to update file.' });
          } else {
            //console.log(`File ${scriptName} updated successfully!`);
            res.json({ status: 'success', message: 'File updated successfully.' });
          }
        });
      } else {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Failed to create file.' });
      }
    } else {
      //console.log(`File ${scriptName} created successfully!`);
      res.json({ status: 'success', message: 'File created successfully.' });
    }
  });
});

// Register route: displays registration form if allowed and not already registered
app.get('/register.html', async (req, res) => {
  try {
    var userCount = await User.getUserCount();
    logger.debug("User Count:" +userCount );
    if (userCount<=0) {
      res.render('register');
    } else {
      logger.warn("Register accessed when user already exists");
      res.redirect('/?message=Register+is+disabled');
    }
  } catch (error) {
    logger.error("An error occurred in register",error);
    res.redirect('/?message=An+error+occurred+during+register');
  }
});

app.post('/register.html', async (req, res) => {
  try {
    if (await User.getUserCount()<=0) {
      const user = await User.createUser(req.body.username, req.body.email, req.body.password );
      res.redirect('/login.html?message=User+Created.+Please+authenticate+with+your+credentials');
    } else {
      res.redirect('/?message="Error+occurred+creating+the+user');
    }
  } catch (error) {
    logger.error("An unknown error occurred posting the register",error);
    res.redirect('/register.html?message="an+unknown+error+occured');
  }
});

// Forgot password route: displays forgot password form
app.get('/forgot.html', (req, res) => {
  if(serverConfig.server.hostname=="UNDEFINED")serverConfig.server.hostname = req.hostname;
  res.render('forgot');
});

app.post('/forgot.html', async (req, res) => {
  try {
    const token = await User.generateResetToken(req.body.username);
    var message="Please+check+your+email+for+a+one+time+password+reset+link+to+continue";
    res.redirect('/login.html?message=' + message);
  } catch (error) {
    logger.error("An error occurred during forgot process",error);
    res.redirect('/forgot.html?message=An+error+occurred+trying+to+reset+your+password');
  }
});

// Reset password route: displays reset password form
app.get('/reset/:token/:user', async (req, res) => {
  try {
    const tokenValid = await User.isResetTokenValid(req.params.user,req.params.token);
    if (tokenValid !== null) {
      res.render('reset', { token: req.params.token, user: req.params.user });
    } else {
      res.redirect('/forgot.html?message=Your+one+time+reset+token+has+already+been+used+or+timed+out.+Please+reset+your+passsword+again');
    }
  } catch (error) {
    logger.error("An error occurred during reset process",error);
    res.redirect('/forgot.html?message=An+error+occurred+trying+to+reset+your+password');
  }
});

app.post('/reset/:token/:user', async (req, res) => {
  try {
    const tokenValid = await User.isResetTokenValid(req.params.user, req.params.token);
    if (tokenValid !== null) {
      const resetSuccessful = await User.resetPassword(req.params.user, req.params.token, req.body.password);
      if (resetSuccessful) {
        res.redirect('/login.html?message=Your+password+has+been+reset.+Please+login+with+your+new+credentials');
      } else {
        res.redirect(`/reset/${req.params.token}/${req.params.user}?message=Unable+to+reset+the+password`);
      }
    } else {
      res.redirect('/forgot.html?message=Your+one+time+reset+token+has+already+been+used+or+timed+out.+Please+reset+your+passsword+again');
    }
  } catch (error) {
    logger.error("An error occurred during reset post process",error);
    res.redirect(`/reset/${req.params.token}/${req.params.user}?message=An+error+occurred+resetting+your+password`);
  }
});


app.post('/login.html', async (req, res) => {
  
  const { username, password, redirect } = req.body;
  const ipAddress = req.headers['x-forwarded-for'] || req.ip;
  logger.info(`Logging in user ${username} from IP: ${ipAddress}`);

  try {
    const user = await User.getUserByUsername(username.toLowerCase());
    //console.log(user);
    if (user) {
      logger.debug("found user");
      const passwordMatch = await bcrypt.compare(password, user.password);
      if (passwordMatch) {
        logger.debug("passwords match");
        req.session.user = user;
        
        if(serverConfig.server.loginSuccessEnabled=="true")notifier.sendNotification("UserAuthentication",`User Logged in for account ${username} from IP: ${ipAddress}`,"INFORMATION");
        //Working where to redirect
        if(serverConfig.websocket_server.port && serverConfig.websocket_server.port !== null && serverConfig.websocket_server.port.length>0)
        {
          if(redirect && redirect!==null){
            logger.debug(`Found redir in url: ${redirect}`);
            res.redirect(redirect);
          }
          else {
            res.redirect('/');
          }
        }
        else{
          //MQTT Not connected - go to initial setup
          res.redirect('/initial-setup-welcome.html');

        }


      } else {
        if(serverConfig.server.loginFailEnabled=="true")notifier.sendNotification("Authentication Failure",`User Login for account ${username} from IP: ${ipAddress} failed.  If this was is unexpected, please change the password immediately`,"WARNING");
        res.redirect('/login.html?message=Unable+to+login+with+those+credentials');

      }
    } else {
      res.redirect('/login.html?message=Unable+to+login+with+those+credentials.+No+user+exists');
    }
  } catch (error) {
    logger.error("An error occurred logged in user",error);
    res.redirect('/login.html?message=Error&message=' + JSON.stringify(error));
  }
});

//Initial setup
app.get('/initial-setup.html',User.isAuthenticated, async (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.redirect('/register.html?not+authenticated');
  }

  res.render('initialsetup1',{
    version: version,
    serverConfig: serverConfig,
  }); 
});



//Initial setup MWQTT
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
    hostName: hostName
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
    hostName: hostName
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
    hostName: hostName
  }); 
});

app.post('/initial-setup-server.html',User.isAuthenticated, async (req, res) => {
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



app.post('/initial-setup1.html',User.isAuthenticated, async (req, res) => {
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


app.post('/initial-setupMQTT.html',User.isAuthenticated, async (req, res) => {
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

app.post('/settings.html',User.isAuthenticated, async (req, res) => {
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
  res.render('settings.ejs', { serverConfig, user });
});


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
  res.render('profile.ejs', { user });
});

app.get('/about.html',User.isAuthenticated, async (req, res) => {

  const user = req.session.user;
  if (!user) return res.redirect('/register.html');

  res.render('about.ejs', { 
    user: User,
    version: version
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


app.get('/historyList/data',User.isAuthenticated, (req, res) => {

  var format = "json"
  if(req.query.format !==undefined && req.query.format!=null)format = req.query.format;

  logger.info(`Format is ${format}`);
  var historyList = hist.getItemsUsingTZ();
  var runningList = running.getItems();
  var schedules = scheduler.getSchedules();

  /*logger.debug(historyList);
  logger.debug("----");
  logger.debug(runningList);
  logger.debug("----");
  logger.debug(schedules);
  logger.debug("----");*/
  for(var x=0;x<historyList.length;x++)
  {
    var workJob = historyList[x].jobName;
    for(var y=0;y<schedules.length;y++){
      if(workJob == schedules[y].jobName){
        historyList[x].icon=schedules[y].icon;
        historyList[x].color=schedules[y].color;
        break;
      }
    }
  }

  var refresh = req.query["refresh"];
  if (refresh === undefined) refresh = 0;
  const sort = req.query.sort || 'jobName'; // Default sorting by jobName
  const order = req.query.order || 'asc'; // Default sorting order is ascending

  logger.info("GetHistoryListData: " + sort + " " + order);
  let sortedData;

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
    // Handle sorting by default (jobName) if the provided sort parameter is invalid
    sortedData = [...historyList].sort((a, b) => a.jobName.localeCompare(b.jobName));
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

app.get('/history.html',User.isAuthenticated, (req, res) => {

  var refresh = req.query["refresh"];
  if (refresh === undefined) refresh = 0;
  const sort = req.query.sort || 'jobName'; // Default sorting by jobName
  const order = req.query.order || 'asc'; // Default sorting order is ascending
  
  res.render('history',{
    refresh: refresh,
    sort:sort,
    order:order,
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
    templates: templateData
  });
});

app.get('/scheduler.html',User.isAuthenticated, (req, res) => {
  logger.info("Scheduler.html");
  var index=req.query.index;
  var internal=req.query.internal;
  var jobname=req.query.jobname;
  var redir=req.query.redir;
  var time=req.query.time;
  var day=req.query.day;
  var type=req.query.type;
  
  if(index===undefined || index === null )index = scheduler.getScheduleIndex(jobname);
  //refresh the scripts list
  refreshScripts();

  res.render('scheduler',{
    scripts: scripts,
    scriptsDesc: scriptsDesc,
    agents: agents.getDict(),
    schedule: scheduler.getSchedules(index),
    index:index,  
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
    stats.current.etaDisplay = displaySecs(stats.current.eta);
    stats.etaRollingAvgDisplay = displaySecs(stats.etaRollingAvg);
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
    log:log,
    refresh,refresh,
    hist:hist,
  });  
});



app.post('/scheduler.html',User.isAuthenticated, (req, res) => {
  
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
  const schedules = scheduler.getSchedules();
  res.render('scheduleList', {
    schedules,
    hist:hist, 
  });
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
  });
});

app.get('/runSchedule.html',User.isAuthenticated, (req, res) => {
  var index=req.query.index;
  var jobname=req.query.jobname;
  var redir=req.query.redir;
  //logger.info(`Running Schedule - Index: ${index}, Jobname: ${jobName}, Redir: ${redir}`);
  logger.info(`Running Schedule - Index: ${index ?? 'undefined'}, Jobname: ${jobname ?? 'undefined'}, Redir: ${redir ?? 'undefined'}`);
  if(redir===undefined || redir === null || redir.length<=0)redir="/scheduleInfo.html?index=" + index + "&refresh=3";
  var status = scheduler.manualJobRun(index,jobname);
  logger.info(`Status: ${status}`)
  if(status!="ok")redir+="&message=Job+Execution+Failed.";
  res.redirect(redir);
});

app.get('/edit/:index',User.isAuthenticated, (req, res) => {
  const index = req.params.index;
  const schedules = scheduler.getSchedules();
  const schedule = schedules[index];

  res.render('scheduler', { 
    schedules, 
    index,
    scripts: scripts,
    agents: agents.getDict(), 
  });
});

app.post('/edit/:index',User.isAuthenticated, (req, res) => {
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

app.get('/schedule',User.isAuthenticated, (request, response) => {
  response.render('schedule', {
    subject: 'BackupHub',
    name: 'Control',
    logs: logsStr,
    config: config,

  });
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
app.get('/logs.html',User.isAuthenticated, (request, response) => {
  var refresh = request.query["refresh"];
  if (refresh === undefined) refresh = 0;
  var sort = request.query["sort"];
  if (sort === undefined) sort = "lastrun";
  var order = request.query["order"];
  if (order === undefined) order = "-1";

  var sortStr = sort;

  if (order == "-1") sortStr = "-" + sort;
  else (sortStr = sort);

  /* Check if one is queued */
  //var cmd = "cat 
  //populateBackupConfig(sortStr);

  response.render('logs-ajax',
    {
      subject: 'EJS template engine',
      name: 'Control/Logs',
      logs: logsStr,
      config: config,
      refresh: request.query["refresh"],
      sort: sort,
      sortstr: sortStr,
      order: order
    });
});


app.get('/logs-ajax.html',User.isAuthenticated, (request, response) => {
  var refresh = request.query["refresh"];
  if (refresh === undefined) refresh = 0;
  var sort = request.query["sort"];
  if (sort === undefined) sort = "id";
  var order = request.query["order"];
  if (order === undefined) order = "1";

  var sortStr = sort;

  if (order == "-1") sortStr = "-" + sort;
  else (sortStr = sort);

  /* Check if one is queued */
  //var cmd = "cat 
  //populateBackupConfig(sortStr);

  response.render('logs-ajax',
    {
      subject: 'EJS template engine',
      name: 'Control/Logs',
      logs: logsStr,
      config: config,
      refresh: request.query["refresh"],
      sort: sort,
      sortstr: sortStr,
      order: order
    });
});

app.get('/logs-inline.html',User.isAuthenticated, (request, response) => {
  var refresh = request.query["refresh"];
  if (refresh === undefined) refresh = 0;
  var sort = request.query["sort"];
  if (sort === undefined) sort = "id";
  var order = request.query["order"];
  if (order === undefined) order = "1";

  var sortStr = sort;

  if (order == "-1") sortStr = "-" + sort;
  else (sortStr = sort);

  //populateBackupConfig(sortStr);

  response.render('logs-inline',
    {
      subject: 'EJS template engine',
      name: 'Control/Logs',
      logs: logsStr,
      config: config,
      refresh: request.query["refresh"],
      sort: sort,
      sortstr: sortStr,
      order: order
    });
});

app.post('/agent-submit.html',User.isAuthenticated, (req, res) => {
  //Get the form data
  
  var name = req.body.agentname;
  var command = req.body.agentcommand;
  var description = req.body.agentdescription;
  var imageurl = req.body.imageurl;

  agents.registerAgent(name,description,command,imageurl,undefined,description);
  res.redirect("/agentstatus.html");

});

app.post('/agentEdit.html',User.isAuthenticated, (req, res) => {
  //Get the form data
  
  var name = req.body.agentname;
  var description = req.body.agentdescription;
  var imageurl = req.body.imageurl;
  var agentObj = agents.getAgent(name);
  agentObj.display = description;
  agents.addObjToAgentStatusDict(agentObj)

  //agents.registerAgent(name,description,command,imageurl,undefined,description);
  res.redirect("/agentstatus.html");

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
        client = wsClients.get(key,true);
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
            wsClients.remove(connId); 
          } catch (err) {
            logger.debug("Unable to remove: " + connId,err)
          }

        }
        //webSocketServer.forceCloseRemove(key);
      }
    //}
  }
}

//______________________________________________________________________________________________________

var server = app.listen(port, function () {
  var host = server.address().address
  var port = server.address().port
  debug.startBanner(version);
  logger.info("\x1b[32mListening on port: " + port);
  //if(debug.enabled())debug.warn("DEBUG ENABLED");
  logger.info("\x1b[32m----------------------------------------------------------------------------------------------\x1b[0m\n");
  
  passman.checkKey();

  scheduler.init();
  hist.init();
  //debug.Info("initiatilizing notification data");
  notificationData.init()
  .then(() => {
    logger.debug('Initiatilizing notification data completed.');
  })
  .catch((error) => {
    logger.error('Error in initiatilizing notification data:', error);
  });
  running.init();
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