/**
 * Tests runner script:
 * - fetch average test timings from the DB
 * - run tests
 * - if some tests failed retry only these tests
 * - save failed tests to DB
 */
const jobStartTime = Date.now();
const { execSync } = require('child_process');
const fs = require('fs');
const https = require('https');
const rimraf = require('rimraf');
const fetch = require('node-fetch');

// The timings GET at startup and the analytics POST after the run are 20+ minutes apart. Node's
// default agent keeps sockets alive, so the POST would reuse one the server has already closed,
// which writes an ECONNABORTED). Open a fresh connection per request instead.
// TMP: Test if opening a fresh connection per request resolves the ECONNABORTED issue.
const utilsServerAgent = new https.Agent({ keepAlive: false });

const failedTestsFile = 'test-dist/failed-tests.json';
const testStatsFile = 'test-dist/test-stats.json';
const args = process.argv.slice(2);
const TIMEOUT = 3; // timeout in minutes
const {
  BUILD_BUILDID,
  SYSTEM_JOBID,
  BUILD_REASON,
  BUILD_SOURCEBRANCH,
  SYSTEM_JOBNAME,
  BUILD_DEFINITIONNAME,
  SLOBS_TEST_RUN_CHUNK,
} = process.env;
let retryingFailed = false;

const RUN_TESTS_CMD = !args.length
  ? `yarn test --timeout=${TIMEOUT}m --color -v`
  : args.join(' ') + ' ';

(async function main() {
  let failedTests = [];
  try {
    rimraf.sync(failedTestsFile);
    rimraf.sync(testStatsFile);
    await createTestTimingsFile();
    execSync(RUN_TESTS_CMD, { stdio: [0, 1, 2] });
  } catch (e) {
    console.log(e);
    failedTests = getFailedTests();
    retryTests(failedTests);
  }
  sendJobToAnalytics(failedTests).then(() => {
    if (retryingFailed) failAndExit();
  });
})();

function retryTests(failedTests) {
  log('retrying failed tests');

  if (!failedTests.length) {
    console.error('no tests to retry');
    failAndExit();
  }

  const retryingArgs = failedTests.map(testName => `--match="${testName}"`);
  try {
    execSync(RUN_TESTS_CMD + retryingArgs.join(' '), {
      stdio: [0, 1, 2],
    });
    log('retrying succeed');
  } catch (e) {
    retryingFailed = true;
    log('failed to retry tests');
  }
}

function log(...args) {
  console.log(...args);
}

function failAndExit() {
  process.exit(1);
}

function getFailedTests() {
  let failedTests = [];
  try {
    failedTests = JSON.parse(fs.readFileSync(failedTestsFile, 'utf8'));
    rimraf.sync(failedTestsFile);
  } catch (e) {
    console.error(e);
  }
  return failedTests;
}

function readTestStats() {
  let stats = {};
  try {
    stats = JSON.parse(fs.readFileSync(testStatsFile, 'utf8'));
  } catch (e) {
    console.error(e);
  }
  return stats;
}

async function sendJobToAnalytics(failedTests) {
  if (!BUILD_BUILDID) return; // do not send analytics for local builds

  const failedAfterRetryTests = getFailedTests();
  const testsToSend = failedTests.map(testName => ({
    name: testName,
    retrySucceeded: !failedAfterRetryTests.includes(testName),
  }));
  log('Sending analytics..');
  const body = {
    name: SYSTEM_JOBNAME,
    pipelineName: BUILD_DEFINITIONNAME,
    duration: Date.now() - jobStartTime,
    failedTests: testsToSend,
    buildId: BUILD_BUILDID,
    jobId: SYSTEM_JOBID,
    buildReason: BUILD_REASON,
    branch: BUILD_SOURCEBRANCH,
    slice: SLOBS_TEST_RUN_CHUNK,
    stats: readTestStats(),
  };
  log(body);
  try {
    await requestUtilityServer('job', 'post', body);
  } catch (e) {
    console.error('failed to send analytics', e);
  }
}

/**
 * Fetch average execution timings for tests from DB
 * and save results to a file
 */
async function createTestTimingsFile() {
  const testTimingsFile = 'test-dist/test-timings.json';
  rimraf.sync(testTimingsFile);

  const data = await requestUtilityServer('testStats');
  if (!fs.existsSync('test-dist')) {
    fs.mkdirSync('test-dist');
  }
  fs.writeFileSync(testTimingsFile, JSON.stringify(data));
}

async function requestUtilityServer(path, method = 'get', body = null) {
  const utilsServerUrl = 'https://slobs-users-pool.herokuapp.com';
  const token = process.env.SLOBS_TEST_USER_POOL_TOKEN;
  const requestPayload = {
    method,
    agent: utilsServerAgent,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) requestPayload.body = JSON.stringify(body);

  // TMP: Test if opening a fresh connection per request resolves the ECONNABORTED issue.
  // This is to confirm that the second utility-server call was being sent over a connection that already died,
  // and whether this is the cause of the ECONNABORTED issue.
  let response;
  // const response = await fetch(`${utilsServerUrl}/${path}`, requestPayload);
  try {
    response = await fetch(`${utilsServerUrl}/${path}`, requestPayload);
  } catch (e) {
    // retry once on a network failure; an HTTP error status is handled below, not retried
    console.error(`request to ${path} failed, retrying once`, e);
    response = await fetch(`${utilsServerUrl}/${path}`, requestPayload);
  }

  if (!response.ok) {
    console.error(response.status);
    throw new Error('Unable to request the utility server');
  }
  return response.json();
}
