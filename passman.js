const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const algorithm = 'aes-256-cbc';
var key = process.env.BACKUPHUB_ENCRYPTION_KEY;
if(key===undefined||key===null||key.length==0){
  key="CHANGEIT";
  //console.log("\x1b[33m" + "WARNING: Default master password in use, please change" + "\x1b[0m");
}
key = padStringTo256Bits(key);


function checkKey()
{ 
  if(key==padStringTo256Bits("CHANGEIT"))logger.warn("WARNING: Default encryption key in use. Please consider changing this before use. This will affect user password hash values, and message validation between hub and agent");
}
/**
 * Creates a JWT Token
 * @param {} payload 
 */
function createJWTToken(payload,expiryHours){
  logger.debug("Generating JWT Auth Token");
  if(expiryHours===undefined||expiryHours==null)expiryHours=3;
  const signOptions = {
    expiresIn: expiryHours + 'h', // Token expiration time
    algorithm: 'HS256'
    // Other options if needed
  };

  const token = jwt.sign(payload, key, signOptions);
  //logger.debug(JSON.stringify(token));
  return token;
}

function validateJWTToken(inToken) {
  logger.debug("Validating JWT Token");
  //logger.debug("KEY: [" + key + "]");
  return new Promise((resolve, reject) => {
    jwt.verify(inToken, key, (err, decoded) => {
      if (err) {
        // Token verification failed
        logger.error("Validation failed",err);
        reject(err);
      } else {
        // Token is valid, 'decoded' contains the decoded payload
        logger.info("Validation Successfull");
        resolve(decoded);
      }
    });
  });
}

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(key), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

//old encryption padding function
function padStringTo256Bits(inputString) {
    const blockSize = 32; // 256 bits / 8 bits per byte = 32 bytes
    const inputLength = Buffer.from(inputString, 'utf8').length;
    const paddingLength = blockSize - (inputLength % blockSize);
    const padding = Buffer.alloc(paddingLength, paddingLength); // Create a buffer filled with the padding length
    const paddedBuffer = Buffer.concat([Buffer.from(inputString, 'utf8'), padding]);
    return paddedBuffer.toString('utf8');
}

//new key derivation function using PBKDF2
function deriveKey(password) {
  const salt = Buffer.from('BackupHubSalt'); // Use a consistent salt or store it securely
  const iterations = 100000; // NIST recommended minimum
  const keyLength = 32; // 256 bits for aes-256
  const digest = 'sha256';
  return crypto.pbkdf2Sync(password, salt, iterations, keyLength, digest);
}

/* Example usage */
//const plaintextPassword = 'yourPlainTextPassword';

/* Encrypt the password */
//const encryptedPassword = encrypt(plaintextPassword);
//console.log('Encrypted Password:', encryptedPassword);

/* Decrypt the password */
//const decryptedPassword = decrypt(encryptedPassword);
//console.log('Decrypted Password:', decryptedPassword);


module.exports = { encrypt, decrypt, checkKey, createJWTToken, validateJWTToken };