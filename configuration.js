function decryptPw(inPass){
  if(inPass.startsWith("@PASSMAN:")==true){
    inPass = inPass.substring(9);
    return passman.decrypt(inPass);
  }
  else return inPass;
}

function isMqttUserPresent(){
  if (serverConfig.mqtt!==undefined && serverConfig.mqtt.password!==undefined && serverConfig.mqtt.password!==null && serverConfig.mqtt.password.length>0){
    return true;
  }
  else{
    return false;
  }
}

function isSmtpUserPresent()
{
  if (serverConfig.smtp!==undefined && serverConfig.smtp.password!==undefined && serverConfig.smtp.password!==null && serverConfig.smtp.password.length>0){
    return true;
  }
  else{
    return false;
  }
}

function processServerConfig() {
  obj = serverConfig;
  var decSmtp=null;
  var decMqtt=null;
  //decrypt passwords in mem
  var needsave = false;
  if (obj.smtp!==undefined && obj.smtp.password!==undefined && obj.smtp.password!==null && obj.smtp.password.length>0)
  {
    var pass = obj.smtp.password
    decSmtp = decryptPw(pass);
    obj.smtp.password=decSmtp;
    if(decSmtp==pass)needsave=true;
  }

  if (obj.mqtt!==undefined && obj.mqtt.password!==undefined && obj.mqtt.password!==null && obj.mqtt.password.length>0)
  {
    var pass = obj.mqtt.password
    decMqtt = decryptPw(pass);
    obj.mqtt.password=decMqtt;
    if(decMqtt==pass)needsave=true;
  }

  if(needsave)saveServerConfig();
  if(decMqtt!=null)obj.mqtt.password=decMqtt;
  if(decSmtp!=null)obj.smtp.password=decSmtp;

  return obj;
}

function loadConfigJson(filename) {
    try {
      const data = fs.readFileSync(filename, 'utf8');
      var configObj = JSON.parse(data);

      if(configObj.threshold===undefined){
        configObj.threshold={};

        //threshold
        configObj.threshold.cpu_percent=80;
        configObj.threshold.filesystem_percent=80;
        configObj.threshold.cooldown_mins=60;
      }

      return configObj;
    } catch (error) {
      // Handle file not found or parsing errors
      logger.error("Error loading server config:",error.message);
      var configObj = {};
      configObj = initServerConfig(configObj);
      return configObj; // Return an empty object or a default configuration
    }
  }

  function saveConfigJSON(filename, inConfigObj){
    const updatedConfig = JSON.stringify(inConfigObj, null, 2); // Convert object to JSON string with indentation
    fs.writeFile(filename, updatedConfig, 'utf8', (err) => {
      if (err) {
        logger.error('Error writing to config file:', err);
      }
      logger.debug('Config File updated successfully.');      
    });
  }

  function isMQTTSet(){
    if(serverConfig!==undefined && serverConfig.mqtt!==undefined && serverConfig.mqtt.server !==undefined &&
      serverConfig.mqtt.server.length>0 && serverConfig.mqtt.port !==undefined && serverConfig.mqtt.port.length>0)
      {
        return true;  
      }
      else{
        return false;
      } 
  }


  function initServerConfig(inConfigObj){
    inConfigObj.server={};
    inConfigObj.mqtt={};
    inConfigObj.smtp={};
    inConfigObj.webhook={};
    inConfigObj.websocket_server={}
    inConfigObj.threshold={};
    inConfigObj.templates={};

    //threshold
    inConfigObj.threshold.cpu_percent=80;
    inConfigObj.threshold.filesystem_percent=80;
    inConfigObj.threshold.cooldown_mins=60;

    //Notification
    inConfigObj.server.minDisconnectDurationForNotification=0;

    //Setup default debug
    inConfigObj.server.debug="true";
    inConfigObj.server.loglevel=4

    //Setup default express settings
    inConfigObj.server.port=8082
    inConfigObj.server.hostname="localhost";
    inConfigObj.server.protocol="http";
    inConfigObj.websocket_server.port=49981;
    
    //Default timezone (from env or set to UTC if not present)
    inConfigObj.server.timezone = process.env.TZ || "UTC";

    //nofiications toggle
    inConfigObj.server.connectionEnabled = "true";
    inConfigObj.server.loginSuccessEnabled = "false";
    inConfigObj.server.loginFailEnabled = "true";
    inConfigObj.server.jobFailEnabled = "true";

    //Setup default template settings
    inConfigObj.templates.enabled="true";
    inConfigObj.templates.repositoryUrl="https://www.pembo.co.uk/BackupHub/template-repository/";
    
    //Job Icons
    inConfigObj.job_icons=[
      "work","cloud","save","storage","dns","layers","schema","delete","hub","insert_drive_file",
      "folder","folder_shared","folder_delete","folder_special","folder_zip","drive_folder_upload",
      "topic","rule_folder","sd_card","archive","library_music","video_library","video_camera_back",
      "photo_library","audio_file","password","account_box","build","restart_alt","start","stop_circle",
      "settings","security","safety_check","sports_esports","dangerous","error","favorite","send",
      "search","feed","shopping_cart","room_service","email","desktop_windows","camera_alt","laptop",
      "power_settings_new","router","schedule","flag","grade","image","key","receipt","money"
    ];

    return inConfigObj;
  }

  function saveServerConfig(){
    logger.debug("Saving server config");
    //encrypt passwords if they're plaintext
    //SMTP
    var encSMTPpw = null;
    var decSMTPpw = null;
    if(serverConfig.smtp!==undefined && serverConfig.smtp!==null && serverConfig.smtp.password!==undefined
      && serverConfig.smtp.password!==null && serverConfig.smtp.password.length>0){
      decSMTPpw = serverConfig.smtp.password;
      encSMTPpw = passman.encrypt(serverConfig.smtp.password);  
      serverConfig.smtp.password = "@PASSMAN:" + encSMTPpw;
    }

    var encMQTTpw = null;
    var decMQTTpw = null;
    if(serverConfig.mqtt!==undefined && serverConfig.mqtt!==null && serverConfig.mqtt.password!==undefined
      && serverConfig.mqtt.password!==null && serverConfig.mqtt.password.length>0){
      decMQTTpw = serverConfig.mqtt.password;
      encMQTTpw = passman.encrypt(serverConfig.mqtt.password);  
      serverConfig.mqtt.password = "@PASSMAN:" + encMQTTpw;
    }

    const updatedConfig = JSON.stringify(serverConfig, null, 2); // Convert object to JSON string with indentation

    //Reset back pws
    if(decMQTTpw !==null){
      serverConfig.mqtt.password = decMQTTpw;
    }
    
    if(decSMTPpw !==null){
      serverConfig.smtp.password = decSMTPpw;
    }

    var configFile = "./data/server-config.json";
    fs.writeFile(configFile, updatedConfig, 'utf8', (err) => {
      if (err) {
        logger.error('Error writing to server config file:', err);
      }
      logger.debug('Server config File updated successfully.');
      logger.debug('Configuring Logger');
  
      

      //var encPw= (passman.encrypt(serverConfig.smtp.password));
      //var decPw= passman.decrypt(encPw);
      // if(serverConfig.server.debug=="true"){
      //   if(serverConfig.server.loglevel){
      //     debug.setLogLevel(serverConfig.server.loglevel);
      //   }
      // }
      
    });
  }

  module.exports = { isMqttUserPresent, isSmtpUserPresent, processServerConfig, loadConfigJson, saveConfigJSON, initServerConfig, saveServerConfig, isMQTTSet}