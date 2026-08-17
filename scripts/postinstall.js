const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const rimraf = require('rimraf');

// install native deps
execSync('node ./scripts/install-native-deps.js', { stdio: [0, 1, 2] });

// the antd library doesn't work with webpack5
// @see https://github.com/ant-design/ant-design/issues/26718#issuecomment-691846966
// fortunately we can fix this issue by modifying the file `/node_modules/antd/package.json`
const antdLibSettingsPath = path.resolve('./node_modules/antd/package.json');
const antdlibSettings = JSON.parse(fs.readFileSync(antdLibSettingsPath, 'utf8'));
delete antdlibSettings.module;
antdlibSettings.main = 'dist/antd.min.js';
fs.writeFileSync(antdLibSettingsPath, JSON.stringify(antdlibSettings, null, 2));