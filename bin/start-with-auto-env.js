const { exec } = require('node:child_process');
const process = require('node:process');
const { version } = require('../package.json');
const { getVersionContext } = require('./release/scripts/patchNote');

const { channel } = getVersionContext(`v${version}`);

const childProcess = exec(`yarn start:${channel} ${process.argv.slice(2).join(' ')}`);

process.stdin.pipe(childProcess.stdin);
childProcess.stdout.pipe(process.stdout);
childProcess.stderr.pipe(process.stderr);

childProcess.on('close', code => {
  process.exitCode = code;
  process.stdin.unref();
});
