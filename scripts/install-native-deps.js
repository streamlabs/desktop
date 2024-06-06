const sh = require('shelljs');
const colors = require('colors/safe');
const fs = require('node:fs');
const path = require('node:path');
const stream = require('node:stream');

const node_modules = path.join(process.cwd(), 'node_modules');

const fetch = require('node-fetch');

function log_info(msg) {
  console.log(`INFO ${msg}`);
}

function log_error(msg) {
  console.log(`ERROR ${msg}`);
}

function executeCmd(cmd, options) {
  // Default is to exit on failure
  if (options.exit == null) options.exit = true;

  const result = options.silent ? sh.exec(cmd, { silent: true }) : sh.exec(cmd);

  if (result.code !== 0) {
    error(`Command Failed >>> ${cmd}`);
    if (options.exit) {
      sh.exit(1);
    } else {
      throw new Error(`Failed to execute command: ${cmd}`);
    }
  }

  return result.stdout;
}

function downloadFile(srcUrl, dstPath, param) {
  const tmpPath = `${dstPath}.tmp`;
  return new Promise((resolve, reject) => {
    fetch(srcUrl, param)
      .then(response => {
        if (response.ok) return response;
        log_error(`Got ${response.status} response from ${srcUrl}`);
        return Promise.reject(response);
      })
      .then(({ body }) => {
        const fileStream = fs.createWriteStream(tmpPath);
        stream.pipeline(body, fileStream, e => {
          if (e) {
            log_error(`Error downloading ${srcUrl}`, e);
            reject(e);
          } else {
            fs.rename(tmpPath, dstPath, e => {
              console.log(dstPath);
              if (e) {
                reject(e);
                return;
              }
              log_info(`Successfully downloaded ${srcUrl}`);
              resolve();
            });
          }
        });
      })
      .catch(e => reject(e));
  });
}

async function rtvc() {
  // cwd is node_modules
  log_info('copy rtvc');

  const url = 'https://github.com/n-air-app/rtvc_plugin/releases/download/1.0.5/nair-rtvc.tar.gz';
  const zip = './nair-rtvc.tar.gz';
  const dst = './obs-studio-node/obs-plugins/64bit/';

  if (fs.existsSync('../nair-rtvc.tar.gz')) {
    log_info('use existing file');
    sh.cp('../nair-rtvc.tar.gz', zip);
  } else {
    const token = process.env['github_token'];

    const param = { headers: { Accept: 'application/octet-stream' } };
    if (token) param.headers.Authorization = `Bearer ${token}`;

    log_info('downloading..');
    await downloadFile(url, zip, param);
  }

  log_info('extracting..');
  executeCmd(`tar -xzvf ${zip} -C ${dst}`, { silent: false });
  sh.rm(zip);
}

async function runScript() {
  colors.blue('----Streamlabs Desktop native dependecies installation----');

  try {
    sh.cd(node_modules);

    await rtvc();

    if (process.platform === 'win32') {
      sh.cd('../scripts');
    }
  } catch (error) {
    log_error(
      'An error occured preventing the script from installing successfully all required native dependencies.',
    );
    log_error(error);
    sh.exit(1);
  }
}

runScript()
  .then(() => {
    sh.exit(0);
  })
  .catch(e => console.log(e));

//-------
function error(a) {
  console.log(a);
}
