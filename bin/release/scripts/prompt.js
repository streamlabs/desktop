// @ts-check

const inq = require('@inquirer/prompts');

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
  confirm,
  input,
};
