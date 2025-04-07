const bcrypt = require('bcrypt');
const { Level } = require('level')
const { randomUUID } = require('crypto');
var db;
// Initialize the LevelDB database




class Users {

    emailer=null;
    debug=null;

    init(dbPath,debug,emailer) {
    this.debug = debug;
    this.emailer = emailer;

    this.debug.debug("Initializing User Capability");
    this.initializeDB(dbPath);

  }
    
  initializeDB(dbPath) {
    this.debug.info("Initializing User DB from [" + dbPath + "]");
    db = new Level(dbPath, { valueEncoding: 'json' })
  }

  async createUser(username, email, password) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = { username, email, password: hashedPassword };
    await db.put(username, user);
  }

  async getUserByUsername(username) {
    try {
      return await db.get(username);
    } catch (error) {
      if (error.notFound) return null;
      throw error;
    }
  }

  async getUserByEmail(email) {
    try {
      return await db.get(email);
    } catch (error) {
      if (error.notFound) return null;
      throw error;
    }
  }

  async getUserByToken(token){
    this.debug.debug("Getting user by token [" + token) + "]";
    for await (const [key, value] of db.iterator({})) {
        if(value.resetPasswordToken && value.resetPasswordToken==token)
        {
            this.debug.debug("Matched token to user");
            return value;
        } 
      }
      this.debug.warn("Unable to match a user by token provided [" + token + "]");
      throw error("token not matched");
  }

  async updatePassword(username, newPassword) {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const user = await this.getUserByUsername(username);
    if (user) {
      user.password = hashedPassword;
      user.resetPasswordToken=undefined;
      user.resetPasswordExpires=undefined;
      //console.log(user);
      await db.put(username, user);
    }
    var body=`Hello ${username}\n\n `
    body+=`This is a message from BackupHub at ${this.emailer.getHostName()}\n\n`
    body+=`Your password for account [${username}] has been updated\n\n`;
    body+="If this was not you, please take immediate action to reset your password here:\n";
    body+=this.emailer.getHostName() + "/forgot.html";
    this.emailer.sendEmail("Backup-Control - Changed Password",body);
  }

  isAuthenticated(req, res, next) {
    //this.logger.debug("Checking if user is authenticated");
    if (req.session.user) {
        //this.logger.debug("[" + req.session.user.username + "] is logged in");
      next();
    } else {
        //this.logger.debug("user is not logged in");
        //const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        const fullUrl = `${req.originalUrl}`;
        // Redirect with the full URL as a query parameter
        res.redirect(`/login.html?message=User+Not+Authenticated&redirect=${encodeURIComponent(fullUrl)}`);

        //res.redirect('/login.html?message=User+Not+Authenticated');
    }
  }

  async getUserCount() {
    const keys = await db.keys({ limit: 10 }).all();
    return keys.length;
  }

  async generateResetToken(username) {
    this.debug.debug("Generating reset token for user:" + username);
    try {
      const token = randomUUID();
      const user = await this.getUserByUsername(username);

      if (user) {
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // Token expires in one hour
        await this.updateUser(user);

            // Send reset password email (configure and send with nodemailer)
        var body=`Hello ${username}\n\n `
        body+=`This is a message from BackupHub at ${this.emailer.getHostName()}\n\n`
        body+="Somebody has requested to reset your password. If this was not you, please ignore.\n";
        body+="If you want to continue to change your passsword, please click the following link\n\n";
        body+=this.emailer.getHostName() + "/reset/" + token + "/" + username;

        this.emailer.sendEmail("Backup-Controller - Reset Password",body);
      }

      return token;
    } catch (error) {
      throw error;
    }
  }

  async resetPassword(username, token, newPassword) {
    try {
      const user = this.isResetTokenValid(username,token);
      
      if (user && user !==null) {
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await this.updatePassword(username,newPassword);
        return true;
      }

      return false;
    } 
    catch (error) 
    {
      this.logger.error("An error occurred resetting the password: ", error);
      throw error;
    }
  }


  async updateUser(updatedUser) {
    try {
      await db.put(updatedUser.username, updatedUser);
    } catch (error) {
        this.logger.error("An error occurred updating a user",error);
        throw error;
    }
  }

  async isResetTokenValid(username,token){
    this.debug.debug("Checking reset token is value for:" + username + " " + token);
    const user = await this.getUserByUsername(username);
    if (user &&  user.resetPasswordExpires && user.resetPasswordExpires > Date.now()
    && user.resetPasswordToken && user.resetPasswordToken==token) {
        this.debug.debug("Returning matched user");
        //console.log(user);
        return user; 
    }
    else{
        this.debug.debug("User not matched");
        return null;
    }
  }
  
}

module.exports = new Users();
