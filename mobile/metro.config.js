const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// The color tokens are intentionally shared with the responsive web frontend.
config.watchFolders = [path.resolve(__dirname, "../shared")];

module.exports = config;
