const fs = require('node:fs');
const path = require('node:path');

function log_info(msg) {
  console.log(`INFO ${msg}`);
}

function log_error(msg) {
  console.log(`ERROR ${msg}`);
}

function loadJsonFile(filename) {
  const file = path.join(filename);
  const jsonData = fs.readFileSync(file);
  return JSON.parse(jsonData.toString());
}
async function runScript() {
  try {
    const packageJsonFilename = './package.json';
    const packageJson = loadJsonFile(packageJsonFilename);
    let modified = false;

    const dependencies = loadJsonFile('./scripts/repositories.json').root;
    let os = '';

    if (process.platform === 'win32') {
      os = 'win64';
    } else if (process.platform === 'darwin') {
      os = 'osx';
    } else {
      throw new Error('Platform not supported.');
    }

    for (const dependency of dependencies) {
      if (!dependency[os]) continue;

      const name = dependency['name'];

      if (os === 'osx' && dependency['mac_version']) {
        moduleVersion = dependency['mac_version'];
      } else {
        moduleVersion = dependency['version'];
      }

      let fileName = dependency['archive'];
      fileName = fileName.replace('[VERSION]', moduleVersion);
      fileName = fileName.replace('[OS]', os);

      const url = dependency['url'] + fileName;

      if (!packageJson['dependencies'][name]) {
        // error
        log_error(`${name} not found in dependencies!`);
        process.exit(1);
      }
      if (packageJson['dependencies'][name] === url) {
        continue;
      }
      log_info(`Update ${name}: ${packageJson['dependencies'][name]} to ${url}`);
      packageJson['dependencies'][name] = url;
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(packageJsonFilename, JSON.stringify(packageJson, null, 2));
      log_info('package.json has been updated. please re-run yarn install!');
      process.exit(1);
    }
  } catch (error) {
    log_error(
      'An error occurred preventing the script from installing successfully all required native dependencies.',
    );
    log_error(error);
    process.exit(1);
  }
}

runScript()
  .then(() => {
    process.exit(0);
  })
  .catch(e => console.log(e));
