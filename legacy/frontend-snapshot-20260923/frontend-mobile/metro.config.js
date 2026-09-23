const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../shared')];
config.resolver.extraNodeModules = {
  '@shared': path.resolve(__dirname, '../shared'),
};
module.exports = config;
