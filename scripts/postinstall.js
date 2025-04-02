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


// The code below is needed to provide a better uninstall experience.
// Here we patch assistedInstaller.nsh to avoid redundant uninstaller welcome page.
// When we upgrade electron-builder package to at least 23.0.6 we need to use the removeDefaultUninstallWelcomePage
// option and the code below can be removed.
// @see https://stackoverflow.com/questions/73454796/default-unwelcome-page-with-electron-builder-nsis-cant-be-changed-or-removed
const assistedInstallerPath = path.resolve('./node_modules/app-builder-lib/templates/nsis/assistedInstaller.nsh');

// Read the file, modify it, and write back using file descriptors
const commentLineInFile = (assistedInstallerPath, lineToComment, commentString = ';') => {
  // Check if the file exists
  if (!fs.existsSync(assistedInstallerPath)) {
    console.error(`File not found: ${assistedInstallerPath}`);
    process.exit(1);
  }

  let fd = null;

  try {
    fd = fs.openSync(assistedInstallerPath, 'r');
    const fileContent = fs.readFileSync(fd, 'utf-8');
    fs.closeSync(fd);

    const modifiedContent = fileContent
      .split('\n')
      .map((line) => {
        if (line.includes(lineToComment) && !line.trim().startsWith(';')) {
          return `${commentString}${line}`;
        }
        return line; // Leave all other lines unchanged
      })
      .join('\n'); // Rejoin the lines back together into a single string

    fd = fs.openSync(assistedInstallerPath, 'w');
    if (fd) {
      fs.writeFileSync(fd, modifiedContent, 'utf-8');
      console.log(`Post install. Successfully commented "${lineToComment}" in file: ${assistedInstallerPath}`);
    } else {
      throw Error('Failed to write');
    }
  } catch (error) {
    console.error(`Post install. An error occurred while processing the file: ${error.message}`);
  } finally {
    if (fd) {
      fs.closeSync(fd);
    }
  }
};

// Call the function to comment out a specific line
commentLineInFile(assistedInstallerPath, '!insertmacro MUI_UNPAGE_WELCOME');