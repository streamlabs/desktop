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
const accountFailuresFile = 'test-dist/account-failures.json';
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

// Order the account failure errors from highest to lowest severity
const ACCOUNT_FAILURE_SEVERITY = [
  'NO_ACCOUNT_AVAILABLE',
  'HEROKU_ANALYTICS_SEND_FAILED',
  'YOUTUBE_ACCOUNT_FAILURE',
  'YOUTUBE_ACCOUNT_RATE_LIMITED',
  'YOUTUBE_STREAMING_DISABLED',
];

let retryingFailed = false;

const RUN_TESTS_CMD = !args.length ? `yarn test --timeout=${TIMEOUT}m ` : args.join(' ') + ' ';

(async function main() {
  let failedTests = [];
  try {
    rimraf.sync(failedTestsFile);
    rimraf.sync(testStatsFile);
    rimraf.sync(accountFailuresFile);
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
 * Read recorded failures from user pool account failure reasons
 * @remark Test failures may occur because of the user pool account instead of from a bug,
 * which creates a false failure.
 * - `tests` is keyed by test name and written by the test harness, `job` holds reasons
 * - that belong to the run as a whole and is written here. See IAccountFailures.
 * @returns - An object with the test failure details
 */
function readAccountFailures() {
  let failures = {};
  try {
    failures = JSON.parse(fs.readFileSync(accountFailuresFile, 'utf8'));
  } catch (e) {
    failures = {};
  }
  return { tests: failures.tests || {}, job: failures.job || [] };
}

/**
 * Roll the per-test and job-wide reasons up into a single reason for the job.
 * A pool with no free accounts affects the whole run, so it wins over an account
 * that just couldn't go live on YouTube.
 */
function getJobAccountFailure(testsToSend, jobReasons) {
  const reasons = jobReasons.concat(
    testsToSend.map(test => test.accountFailure).filter(reason => reason),
  );
  if (!reasons.length) return null;
  return ACCOUNT_FAILURE_SEVERITY.find(reason => reasons.includes(reason)) || reasons[0];
}

async function sendJobToAnalytics(failedTests) {
  if (!BUILD_BUILDID) return; // do not send analytics for local builds

  const failedAfterRetryTests = getFailedTests();
  const accountFailures = readAccountFailures();
  const testsToSend = failedTests.map(testName => ({
    name: testName,
    retrySucceeded: !failedAfterRetryTests.includes(testName),
    accountFailure: accountFailures.tests[testName] || null,
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
    accountFailure: getJobAccountFailure(testsToSend, accountFailures.job),
  };
  log(body);
  try {
    await requestUtilityServer('job', 'post', body);
  } catch (e) {
    console.error('failed to send analytics', e);
    saveJobAccountFailure('HEROKU_ANALYTICS_SEND_FAILED');
  }
}

/**
 * The body never reached the server, so nothing in it was recorded - including the
 * accountFailure we just worked out. Append the reason to the account failures file so the
 * lost job is visible on the agent rather than only in the console. Reasons accumulate
 * rather than overwrite, so an earlier one isn't lost behind a later one.
 */
function saveJobAccountFailure(reason) {
  const failures = readAccountFailures();
  failures.job.push(reason);
  try {
    fs.writeFileSync(accountFailuresFile, JSON.stringify(failures));
  } catch (e) {
    console.error('failed to record the account failure', e);
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
