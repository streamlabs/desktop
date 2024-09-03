// @ts-check

const sh = require('shelljs');
const { executeCmd, error } = require('./prompt');

function getTagCommitId(tag) {
  const line = executeCmd(`git rev-parse -q --verify "refs/tags/${tag}" || cat /dev/null`, {
    silent: true,
  }).stdout;
  // 末尾の改行を除去する
  return line.replace(/\n$/, '');
}

function checkEnv(varName) {
  if (!process.env[varName]) {
    error(`Missing environment variable ${varName}`);
    sh.exit(1);
  }
}

module.exports = {
  getTagCommitId,
  checkEnv,
};
