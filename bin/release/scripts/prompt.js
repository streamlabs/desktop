// @ts-check

const sh = require('shelljs');
const colors = require('colors/safe');
const inq = require('@inquirer/prompts');

/**
 * @param {string[]} msg
 */
function log(...msg) {
  sh.echo(...msg);
}

/**
 * @param {string} msg
 */
function info(msg) {
  sh.echo(colors.magenta(msg));
}

/**
 * @param {string} msg
 */
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

/**
 * @param {string} msg
 * @returns {Promise<boolean>}
 */
async function confirm(msg, defaultValue = true) {
  const result = await inq.confirm({
    message: msg,
    default: defaultValue,
  });

  return result;
}

/**
 * @param {string} message
 * @param {string} defaultValue
 * @returns {Promise<string>}
 */
async function input(message, defaultValue) {
  const result = await inq.input({
    message,
    default: defaultValue,
  });

  return result;
}

module.exports = {
  log,
  info,
  error,
  executeCmd,
  confirm,
  input,
};
