/**
 * This file provides patches for AVA that allow to track failed tests to re-run them
 * Also it skips the tests that should be run on an different CI agent in a parallel execution mode
 */

import avaTest, { TestFn } from 'ava';
import { ITestContext } from './index';
import { uniq } from 'lodash';
const fs = require('fs');
const fetch = require('node-fetch');
const tasklist = require('tasklist');
const kill = require('tree-kill');

export interface ITestStats {
  duration: number;
  syncIPCCalls: number;
}

const {
  BUILD_BUILDID,
  SYSTEM_JOBID,
  BUILD_REASON,
  BUILD_SOURCEBRANCH,
  SYSTEM_JOBNAME,
  BUILD_DEFINITIONNAME,
  SLOBS_TEST_RUN_CHUNK,
} = process.env;

// export const USER_POOL_TOKEN = process.env.SLOBS_TEST_USER_POOL_TOKEN;
// const USER_POOL_URL = 'https://slobs-users-pool.herokuapp.com'; // 'http://localhost:5000'
const FAILED_TESTS_PATH = 'test-dist/failed-tests.json'; // failed will be written down to this file
const TESTS_TIMINGS_PATH = 'test-dist/test-timings.json'; // a known timings for tests should be provided in this file
const TEST_STATS_PATH = 'test-dist/test-stats.json'; // each successfully completed tests save stats like duration, syncIPCCalls in this file

// save names of all running tests in this array to use them in the retrying mechanism
const pendingTests: string[] = [];

// read timings for tests
const testTimings: Record<string, number> = (() => {
  try {
    // read the list of timings from the file
    const records: { name: string; time: number }[] = JSON.parse(
      fs.readFileSync(TESTS_TIMINGS_PATH, 'utf-8'),
    );
    const result = {};

    // convert the list to the map where key is a test name
    records.forEach(r => (result[r.name] = r.time));
    return result;
  } catch (e: unknown) {
    return {};
  }
})();

/**
 * overridden version of the ava.test() function
 */
// @ts-ignore typescript upgrade
export const testFn: TestFn<ITestContext> = new Proxy(avaTest, {
  apply: (target, thisArg, args) => {
    const testName = args[0];
    if (!isTestEligibleToRun(testName)) {
      // skip tests that don't belong current slice
      avaTest.skip(`SKIP: ${testName}`, t => {});
      return;
    }
    pendingTests.push(testName);
    return target.apply(thisArg, args);
  },
});

avaTest.before(async t => {
  // consider all tests as failed until it's not successfully finished
  // so we can catch failures for tests with timeouts
  saveFailedTestsToFile(pendingTests);
});

export function saveFailedTestsToFile(failedTests: string[]) {
  if (fs.existsSync(FAILED_TESTS_PATH)) {
    // tslint:disable-next-line:no-parameter-reassignment TODO
    failedTests = JSON.parse(fs.readFileSync(FAILED_TESTS_PATH, 'utf8')).concat(failedTests);
  }
  fs.writeFileSync(FAILED_TESTS_PATH, JSON.stringify(uniq(failedTests)));
}

export function removeFailedTestFromFile(testName: string) {
  if (fs.existsSync(FAILED_TESTS_PATH)) {
    const failedTests = JSON.parse(fs.readFileSync(FAILED_TESTS_PATH, 'utf8'));
    failedTests.splice(failedTests.indexOf(testName), 1);
    fs.writeFileSync(FAILED_TESTS_PATH, JSON.stringify(failedTests));
  }
}

/**
 * check if test is eligible to run on the current CI agent
 */
function isTestEligibleToRun(testName: string) {
  const testAvgTime = testTimings[testName];

  // if we don't have a timing data for test then it's always eligible to run
  if (!testAvgTime) return true;

  // determine which chunk of the test suite is running now
  const chunk = process.env.SLOBS_TEST_RUN_CHUNK;

  // always allow test to run if no chunk data provided
  if (!chunk) return true;

  // get the amount of chunks and the chunk we should run on this agent
  const [currentChunkNum, totalChunks] = chunk.split('/').map(s => Number(s));

  // calculate the chunk number for the current test
  let testAvgStartTime = 0;
  let testAvgTotalTime = 0;
  Object.keys(testTimings).forEach(name => {
    testAvgTotalTime += testTimings[name];
    if (name === testName) testAvgStartTime = testAvgTotalTime;
  });
  const timePerChunk = testAvgTotalTime / totalChunks;
  const testChunkNum = Math.floor(testAvgStartTime / timePerChunk) + 1;
  return testChunkNum === currentChunkNum;
}

export function saveTestStatsToFile(stats: Record<string, ITestStats>) {
  if (!process.env.SLOBS_TEST_RUN_CHUNK) {
    // don't save timings for tests that are not sliced
    return;
  }
  if (fs.existsSync(TEST_STATS_PATH)) {
    // tslint:disable-next-line:no-parameter-reassignment
    stats = { ...JSON.parse(fs.readFileSync(TEST_STATS_PATH, 'utf8')), ...stats };
  }
  fs.writeFileSync(TEST_STATS_PATH, JSON.stringify(stats));
}

// workaround: Ignore the electron.exe processes that are running before the test starts
let ignoreTaskPIDs: number[] = [];
async function getRawElectronTasks() {
  const tasks = await tasklist();
  return tasks.filter((task: any) => task.imageName === 'electron.exe');
}

export async function initializeTasks() {
  const tasks = await getRawElectronTasks();
  ignoreTaskPIDs = tasks.map((task: any) => task.pid);
}

async function getElectronInstances() {
  const tasks = await getRawElectronTasks();
  return tasks.filter((task: any) => !ignoreTaskPIDs.includes(task.pid));
}

export async function killElectronInstances() {
  const tasks = await getElectronInstances();
  tasks.forEach((task: any) => kill(task.pid));
}

export async function waitForElectronInstancesExist() {
  const interval = 1000;
  const timeout = 10000;

  let timeLeft = timeout;
  return new Promise(async resolve => {
    let tasks: any[] = [];
    do {
      tasks = await getElectronInstances();
      timeLeft -= interval;
    } while (tasks.length || timeLeft < 0);
    resolve(null);
  });
}
