function getHostName(){
  return serverConfig.server.protocol + "://" + serverConfig.server.hostname +":"+serverConfig.server.port;
}



async function sendNotification(subject,body,type,url){
  d = new Date();
  logger.debug("Sending a notification");
  notificationData.add(notificationData.createNotificationItem(d,type,subject,body,url));
  webSocketBrowser.emitNotification('notification', `Count updated`);
  if(serverConfig.server.notificationType=="email"){
    await sendEmail(subject,body);
  }
  else if(serverConfig.server.notificationType=="webhook"){
    var url = serverConfig.webhook.url;
    var ret = postToWebhook(url,body);
    logger.debug("Webhook return:" + ret);
  }
  else{
    logger.warn(subject + " - " + body);
  }


}

async function sendEmail(subject,body) {
    try {
      // Create a transporter object using the default SMTP transport
      let transporter = nodemailer.createTransport({
        host: serverConfig.smtp.host, // Example: 'smtp.gmail.com'
        port: parseInt(serverConfig.smtp.port),  // SSL port
        secure: (serverConfig.smtp.secure=="true"),           // true for 465, false for other ports
        auth: {
          user: serverConfig.smtp.username,    // Your email address
          pass: serverConfig.smtp.password     // Your email password
        }
      });
  
      // Send mail with defined transport object
      let info = await transporter.sendMail({
        from: `"BackupHub" <${serverConfig.smtp.emailFrom}>`, // Sender address
        to: serverConfig.smtp.emailTo,                        // List of recipients
        subject: subject,                                     // Subject line
        text: body,                                           // Plain text body
        /*html: '<b>Hello world?</b>'                         // HTML body*/
      });
  
      logger.debug('Message sent: %s', info.messageId);
    } catch (error) {
      logger.error('Error sending email:', error);
    }
  }

  async function postToWebhook(url, data) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: data
      });
  
      if (!response.ok) {
        logger.error(`Webhook Notification - HTTP error! Status: ${response.status}`);
        return `Error: Webhook Notification - HTTP error! Status: ${response.status}`;
      }
  
      const responseData = await response.text();
      return responseData;
    } catch (error) {
      logger.error('Webhook Notification - An error occurred:', error);
      //throw error; // Rethrow the error to handle it in the calling code
      return "Error: " + error;
    }
  }
  
  module.exports = { sendEmail,sendNotification,getHostName }