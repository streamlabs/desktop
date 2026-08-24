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
const rimraf = require('rimraf');
const fetch = require('node-fetch');

const failedTestsFile = 'test-dist/failed-tests.json';
const testStatsFile = 'test-dist/test-stats.json';
const failureReasonsFile = 'test-dist/failure-reasons.json';
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

const RUN_TESTS_CMD = !args.length ? `yarn test --timeout=${TIMEOUT}m ` : args.join(' ') + ' ';

(async function main() {
  let failedTests = [];
  try {
    rimraf.sync(failedTestsFile);
    rimraf.sync(testStatsFile);
    rimraf.sync(failureReasonsFile);
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

/**
 * Read recorded failures reasons
 * @remark Test failures may occur because of reasons other than bugs, such as the user pool account
 * - `tests` is keyed by test name and written by the test harness, `job` holds reasons
 * - that belong to the run as a whole and is written here. See IFailureReasons.
 * @returns - An object with the test failure details
 */
function readFailureReason() {
  try {
    const failures = JSON.parse(fs.readFileSync(failureReasonsFile, 'utf8'));
    return { tests: failures?.tests || {}, job: failures?.job || [] };
  } catch (e) {
    console.error('Failed to read the failure reasons file', e);
    return { tests: {}, job: [] };
  }
}

async function sendJobToAnalytics(failedTests) {
  if (!BUILD_BUILDID) return; // do not send analytics for local builds

  const failedAfterRetryTests = getFailedTests();
  const failureReasons = readFailureReason();
  const testsToSend = failedTests.map(testName => {
    const failureLog = {
      name: testName,
      retrySucceeded: !failedAfterRetryTests.includes(testName),
    };

    if (!failureLog.retrySucceeded && failureReasons.tests[testName]) {
      failureLog.failureReason = failureReasons.tests[testName];
    }

    return failureLog;
  });
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
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) requestPayload.body = JSON.stringify(body);
  const response = await fetch(`${utilsServerUrl}/${path}`, requestPayload);

  if (!response.ok) {
    console.error(response.status);
    throw new Error('Unable to request the utility server');
  }
  return response.json();
}
