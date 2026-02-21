var version="%%UNDEFINED%%";
var supportedAgentVersion = "2026.02.21.01";

function getVersion(){
    return version
}

function getMinimumAgentSupportedVersion(){
    return supportedAgentVersion;
}

module.exports = { getVersion, getMinimumAgentSupportedVersion }
