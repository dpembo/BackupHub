var version="%%UNDEFINED%%";
var supportedAgentVersion = "2025.03.30.01";

function getVersion(){
    return version
}

function getMinimumAgentSupportedVersion(){
    return supportedAgentVersion;
}

module.exports = { getVersion, getMinimumAgentSupportedVersion }
