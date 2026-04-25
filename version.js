var version="%%UNDEFINED%%";
var supportedAgentVersion = "2026.04.25.02";

function getVersion(){
    return version
}

function getMinimumAgentSupportedVersion(){
    return supportedAgentVersion;
}

module.exports = { getVersion, getMinimumAgentSupportedVersion }
