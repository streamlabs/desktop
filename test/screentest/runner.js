const rimraf = require('rimraf');
const { execSync } = require('child_process');
const fs = require('fs');

const CONFIG = JSON.parse(fs.readFileSync('test/screentest/config.json'));

const branches = ['current', CONFIG.baseBranch];

const returnCode = (function main() {
  log('use branches', branches);

  const dir = CONFIG.dist;
  rimraf.sync(dir);

  // create dir
  let currentPath = '';
  dir.split('/').forEach(dirName => {
    currentPath += dirName;
    if (!fs.existsSync(currentPath)) fs.mkdirSync(currentPath);
    currentPath += '/';
  });

  for (const branchName of branches) {
    checkoutBranch(branchName);

    log('project compilation');
    try {
      execSync('yarn compile:ci');
    } catch (e) {
      err('compilation failed', e);
      return 1;
    }

    log('tests compilation');

    try {
      execSync('yarn compile-tests');
    } catch (e) {
      err('compilation failed', e);
      return 1;
    }

    log('creating screenshots');
    try {
      execSync(`yarn ava test-dist/test/screentest/tests`);
    } catch (e) {
      err('creating screenshots failed');
      return 1;
    }
  }

  checkoutBranch(branches[0]);

  log('comparing screenshots');
  try {
    execSync(`node test-dist/test/screentest/comparator.js ${branches[0]} ${branches[1]}`);
  } catch (e) {
    err('comparing screenshots failed');
    return 1;
  }

  return 0;
})();

if (returnCode !== 0) {
  process.exit(1);
}

checkoutBranch(branches[0]);

function log(...args) {
  console.log(...args);
}

function err(...args) {
  console.error(...args);
}

function checkoutBranch(branchName) {
  const branchPath = `${CONFIG.dist}/${branchName}`;
  if (!fs.existsSync(branchPath)) fs.mkdirSync(branchPath);
  if (branchName !== 'current') {
    log(`checkout ${branchName}`);
    execSync(`git checkout ${branchName}`);
    log('run yarn install');
    execSync('yarn install');
  }
  fs.writeFileSync(`${CONFIG.dist}/current-branch.txt`, branchName);
}
