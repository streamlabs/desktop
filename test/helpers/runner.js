/**
 * Tests runner script:
 * - prepare one shared timing snapshot before packaging the CI test build
 * - reuse that snapshot in every CI batch (or fetch timings for standalone runs)
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

// The timings GET at startup and the analytics POST after the run are 20+ minutes apart.
// Node 22.18.0 is currently pinned for the workflow, which means the startup GET socket cannot
// be reused after 20+ minutes. Each test suite consistently takes > 20 minutes. This meant the
// POST request to attempt to use a closed socket and would fail with an ECONNABORTED error.
const utilsServerAgent = new https.Agent({ keepAlive: false });

const failedTestsFile = 'test-dist/failed-tests.json';
const testStatsFile = 'test-dist/test-stats.json';
const testTimingsFile = 'test-dist/test-timings.json';
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

const RUN_TESTS_CMD = !args.length ? `yarn test --timeout=${TIMEOUT}m --color -v` : args.join(' ');

(async function main() {
  if (args.length === 1 && args[0] === '--prepare-timings') {
    await createTestTimingsFile();
    return;
  }

  let failedTests = [];
  try {
    rimraf.sync(failedTestsFile);
    rimraf.sync(testStatsFile);
    if (process.env.SLOBS_TEST_TIMINGS_PREPARED === '1') {
      // Every CI batch must use the snapshot packaged with the shared build.
      // Refetching here can move tests between batches as other runs finish.
      validateTestTimings(JSON.parse(fs.readFileSync(testTimingsFile, 'utf8')));
    } else {
      await createTestTimingsFile();
    }
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
    execSync([RUN_TESTS_CMD, ...retryingArgs].join(' '), {
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
  rimraf.sync(testTimingsFile);

  const data = await requestUtilityServer('testStats');
  validateTestTimings(data);
  if (!fs.existsSync('test-dist')) {
    fs.mkdirSync('test-dist');
  }
  fs.writeFileSync(testTimingsFile, JSON.stringify(data));
}

function validateTestTimings(records) {
  if (
    !Array.isArray(records) ||
    records.some(
      record =>
        !record ||
        typeof record.name !== 'string' ||
        !Number.isFinite(record.time) ||
        record.time < 0,
    )
  ) {
    throw new Error('Invalid shared test timing snapshot');
  }
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

  // Attempt to send the request to the utility server via the old socket, retrying once on network failure.
  let response;
  try {
    response = await fetch(`${utilsServerUrl}/${path}`, requestPayload);
  } catch (e) {
    console.error(`request to ${path} failed, retrying once`, e);
    response = await fetch(`${utilsServerUrl}/${path}`, requestPayload);
  }

  if (!response.ok) {
    console.error(response.status);
    throw new Error('Unable to request the utility server');
  }
  return response.json();
}
