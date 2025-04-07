const white = "\x1b[37m";
const Dim = "\x1b[2m";
const Reset = "\x1b[0m";
const Green = "\x1b[32m";
const Red = "\x1b[31m";
const Cyan = "\x1b[36m";
const Yellow = "\x1b[33m"


const lvl_permanent = -1;
const lvl_off = 0;
const lvl_error = 1;
const lvl_warning = 2;
const lvl_info = 3;
const lvl_debug = 4;


var defaultLevel = 0;
activeLevel = 0;

const prefix ="CONTROL";


// function off()
// {
//     setLogLevel(lvl_off)
// }
// function on() {
//     setLogLevel(lvl_debug);}

// function enabled(){
//     return activeLevel>0;
// }

// function setLogLevel(inLevel){
//     switch (inLevel){
//         case lvl_off:
//             logger.level("off");
//             break;
//         case lvl_debug:
//             logger.level("debug");
//             break;
//         case lvl_info:
//             logger.level("info");
//             break;
//         case lvl_warning:
//             logger.level("warn");
//             break;
//         case lvl_error:
//             logger.level("error");
//             break;
                            
//     }
//     console.log("Setting Debug log level [" + inLevel + "]");
//     activeLevel = inLevel;
// }

// function message(inMessage,level)
// {
//     var message = inMessage;
//     if(level==undefined)level = 4;
//     if(level==lvl_permanent)console.log(message);
//     else
//     {
//         if(level > 2 && level>activeLevel)return;
//         switch (level)
//         {
//             case lvl_off:
//                 //Nothing to do
//                 break;

//             case lvl_debug:
//                 message = Dim + "[DEBG][" + prefix +"] "+ inMessage + Reset; 
//                 console.log(message);
//                 break;

//             case lvl_info:
//                 message = white + "[INFO][" + prefix +"] "+ inMessage + Reset;
//                 console.log(message);
//                 break;

//             case lvl_warning:
//                 message = Yellow + "[WARN][" + prefix +"] " + inMessage + Reset; 
//                 console.log(message);
//                 break;

//             case lvl_error:
//                 message = Red + "[ERRR][" + prefix + "] " + inMessage + Reset;
//                 console.error(message); 
//                 break;
//         }
        
//     }
    
// }


// function start() {
//     message(start.caller.name + " started");
// }

// function stop() {
//     message(stop.caller.name + " completed");
// }
/*
function error(e,error) {
    message(e,lvl_error);
    if(error!==undefined)console.error(error);
}

function info(msg){
    message(msg,lvl_info);
}

function debug(msg,error){
    message(msg,lvl_debug);
    //if(error!==undefined)console.error(error);
}

function warn(msg){
    message(msg,lvl_warning);
}

function log(msg){
    debug(msg);
}*/

function startBanner(version){
    console.log('');
    console.log('\x1b[32m                                 888                                                  888      ');
    console.log('                                 888                                                  888      ');
    console.log('                                 888                                                  888      ');
    console.log(' 88888b.   .d88b.  88888b.d88b.  88888b.   .d88b.       .d8888b  .d88b.      888  888 888  888 ');
    console.log(' 888 "88b d8P  Y8b 888 "888 "88b 888 "88b d88""88b     d88P"    d88""88b     888  888 888 .88P ');
    console.log(' 888  888 88888888 888  888  888 888  888 888  888     888      888  888     888  888 888888K  ');
    console.log(' 888 d88P Y8b.     888  888  888 888 d88P Y88..88P d8b Y88b.    Y88..88P d8b Y88b 888 888 "88b ');
    console.log(' 88888P"   "Y8888  888  888  888 88888P"   "Y88P"  Y8P  "Y8888P  "Y88P"  Y8P  "Y88888 888  888 ');
    console.log(' 888                                                                                           ');
    console.log(' 888                                                                                           ');
    console.log(' 888                                                                                           ');
    console.log('\x1b[36m _________________');
    console.log('|# \x1b[30m\x1b[47m:           :\x1b[0m\x1b[36m #|');
    console.log('|  \x1b[30m\x1b[47m:  BACK-UP  :\x1b[0m\x1b[36m  |');
    console.log('|  \x1b[30m\x1b[47m:  CONTROL  :\x1b[0m\x1b[36m  |');
    console.log('|  \x1b[30m\x1b[47m:           :\x1b[0m\x1b[36m  |       \x1b[32mVersion: ' + version + '\x1b[36m');
    console.log('|  \x1b[30m\x1b[47m:___________:\x1b[0m\x1b[36m  |');
    console.log('|    \x1b[90m _________\x1b[36m   |');
    console.log('|    \x1b[90m| __      |\x1b[36m  |');
    console.log('|    \x1b[90m||  |     |\x1b[36m  |');
    console.log('\\____\x1b[90m||__|_____|\x1b[36m__|\x1b[0m');
    console.log('')  
}
module.exports = {startBanner};