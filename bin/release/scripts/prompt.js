// @ts-check

const sh = require('shelljs');
const colors = require('colors/safe');
const inq = require('inquirer');

function log(...msg) {
  sh.echo(...msg);
}

function info(msg) {
  sh.echo(colors.magenta(msg));
}

function error(msg) {
  sh.echo(colors.red(`ERROR: ${msg}`));
}

function executeCmd(cmd, options) {
  log(`Executing: ${cmd}`);
  const result = /** @type {sh.ExecOutputReturnValue} */ (sh.exec(cmd, options));

  if (result.code !== 0) {
    error(`Command Failed >>> ${cmd}`);
    sh.exit(1);
  }

  // returns {code:..., stdout:..., stderr:...}
  return result;
}

async function confirm(msg, defaultValue = true) {
  const result = await inq.prompt({
    type: 'confirm',
    name: 'conf',
    message: msg,
    default: defaultValue,
  });

  return result.conf;
}

async function input(message, defaultValue) {
  const result = await inq.prompt({
    type: 'input',
    name: 'value',
    message,
    default: defaultValue,
  });

  return result.value;
}

module.exports = {
  log,
  info,
  error,
  executeCmd,
  confirm,
  input,
};
