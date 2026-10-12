const sh = require('shelljs');
const colors = require('colors/safe');
const fs = require('fs');
const path = require('path');
const stream = require('stream');

const node_modules = path.join(process.cwd(), 'node_modules');

const fetch = require('node-fetch');

function log_info(msg) {
  sh.echo(colors.magenta(msg));
}

function log_error(msg) {
  sh.echo(colors.red(`ERROR: ${msg}`));
}

function executeCmd(cmd, options) {
  // Default is to exit on failure
  if (options.exit == null) options.exit = true;

  const result = options.silent ? sh.exec(cmd, { silent: true }) : sh.exec(cmd);

  if (result.code !== 0) {
    log_error(`Command Failed >>> ${cmd}`);
    if (options.exit) {
      sh.exit(1);
    } else {
      throw new Error(`Failed to execute command: ${cmd}`);
    }
  }

  return result.stdout;
}

async function downloadFile(srcUrl, dstPath) {
  const tmpPath = `${dstPath}.tmp`;
  try {
    const response = await fetch(srcUrl);
    if (!response.ok) {
      throw new Error(`Got ${response.status} ${response.statusText} response from ${srcUrl}`);
    }
    await new Promise((resolve, reject) => {
      stream.pipeline(response.body, fs.createWriteStream(tmpPath), e => (e ? reject(e) : resolve()));
    });
    fs.renameSync(tmpPath, dstPath);
    log_info(`Successfully downloaded ${srcUrl}`);
  } catch (e) {
    sh.rm('-f', tmpPath);
    throw e;
  }
}

// Returns the version of an installed module, or null if it is missing or unreadable
function getInstalledVersion(name) {
  try {
    const file = path.join(node_modules, name, 'package.json');
    return JSON.parse(fs.readFileSync(file).toString())['version'];
  } catch (e) {
    return null;
  }
}

async function installDependency(dependency, os, arch) {
  const name = dependency['name'];
  let moduleVersion = '';

  if (os === 'osx' && dependency['mac_version']) {
    moduleVersion = dependency['mac_version'];
  } else {
    moduleVersion = dependency['version'];
  }

  if (getInstalledVersion(name) === moduleVersion) {
    return;
  }

  let fileName = dependency['archive'];
  fileName = fileName.replace('[VERSION]', moduleVersion);
  fileName = fileName.replace('[OS]', os);
  fileName = fileName.replace('[ARCH]', arch);

  const url = dependency['url'] + fileName;
  const filePath = path.join(node_modules, fileName);

  try {
    // Download before removing the installed module, so a failed download leaves it in place
    log_info('Downloading ' + fileName);
    await downloadFile(url, filePath);

    log_info('Installing ' + fileName);
    sh.rm('-rf', path.join(node_modules, name));
    executeCmd('tar -xzvf ' + fileName, { silent: true, exit: false });
  } catch (e) {
    throw new Error(`${name} ${moduleVersion}: ${e.message}`);
  } finally {
    sh.rm('-f', filePath);
  }
}

async function runScript() {
  sh.echo(colors.blue('----Streamlabs Desktop native dependecies installation----'));

  try {
    const jsonData = fs.readFileSync('./scripts/repositories.json');
    const root = JSON.parse(jsonData.toString());
    const dependecies = root.root;
    let os = '';
    let arch = '';

    if (process.platform === 'win32') {
      os = 'win64';
    } else if (process.platform === 'darwin') {
      os = 'osx';
      if (process.env.npm_config_arch == 'arm64' || process.env.ARCH == 'arm64') {
        arch = '-arm64';
      } else if (process.env.npm_config_arch == 'x64' || process.env.ARCH == 'x86_64') {
        arch = '-x86_64';
      } else if (process.arch == 'arm64') {
        arch = '-arm64';
      } else if (process.arch == 'x64') {
        arch = '-x86_64';
      } else {
        throw new Error('CPU architecture not supported.');
      }
    } else {
      throw new Error('Platform not supported.');
    }

    sh.cd(node_modules);

    // Let every install finish before reporting, so one failure doesn't
    // abort the others midway
    const results = await Promise.allSettled(
      dependecies
        .filter(dependency => dependency[os])
        .map(dependency => installDependency(dependency, os, arch)),
    );
    const failures = results.filter(result => result.status === 'rejected');

    if (process.platform === 'win32') {
      sh.cd('../scripts');
    }

    if (failures.length > 0) {
      log_error(
        `Failed to install ${failures.length} native ${
          failures.length === 1 ? 'dependency' : 'dependencies'
        }:`,
      );
      failures.forEach(failure => log_error(`  ${failure.reason.message}`));
      sh.exit(1);
    }
  } catch (error) {
    log_error(
      'An error occured preventing the script from installing successfully all required native dependencies.',
    );
    log_error(error.message || error);
    sh.exit(1);
  }
}

runScript().then(() => {
  sh.exit(0);
});
