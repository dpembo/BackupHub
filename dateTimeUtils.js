function convertToTimezone(utcDate, targetTimezone) {
  if(targetTimezone==null || targetTimezone.length==0)targetTimezone="Europe/London";
  const convertedTimeMoment = moment(utcDate).tz(targetTimezone);
  const convertedTimeDate = convertedTimeMoment.toDate();

  return convertedTimeDate;
}

function applyTz(inDate,targetTimeZone){
  return moment(inDate).tz(targetTimeZone).format('YYYY-MM-DD HH:mm');
}

function displayFormatDate(inDate, future, targetTimeZone, format,addDelta) {
  //logger.debug("Formatting: " + inDate);
  var formattedDate;
  if (targetTimeZone !== undefined) {
      // Convert to target timezone and apply the provided format or default to ISO format
      formattedDate = moment.tz(inDate, targetTimeZone).format(format || 'YYYY-MM-DDTHH:mm:ss');
      //logger.debug("Formatting 1: " + formattedDate);
  } else {
      // Use the provided format or default to ISO without timezone adjustment
      formattedDate = format ? moment(inDate).format(format) : inDate.toISOString().split('.')[0];
      //logger.debug("Formatting 2: " + formattedDate);
  }
  
  var time = inDate.getTime();
  var nowDate = new Date().getTime();
  var delta;
  if (future === true) delta = time - nowDate;
  else delta = nowDate - time;
  delta = delta / 1000;
  const formattedDelta = displaySecs(delta);
  //logger.debug("Formatting: " + formattedDelta);

  //logger.debug(addDelta);
  if(addDelta!==undefined && addDelta==false){
    //logger.debug("Retuning only date: " + formattedDate);
    return `${formattedDate}`;
  }
  else{ 
    logger.debug("delta not set - Reutning date and delta");
    return `${formattedDate} (${formattedDelta})`;
  }
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


module.exports = {
  convertToTimezone,applyTz,displayFormatDate
};