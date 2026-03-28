var version="%%UNDEFINED%%";
var supportedAgentVersion = "2026.03.28.04";

function getVersion(){
    return version
}

function getMinimumAgentSupportedVersion(){
    return supportedAgentVersion;
}

module.exports = { getVersion, getMinimumAgentSupportedVersion }
