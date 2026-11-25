/**
 * This file provides patches for AVA that allow to track failed tests to re-run them
 * Also it skips the tests that should be run on an different CI agent in a parallel execution mode
 */

import avaTest, { TestInterface } from 'ava';
import { ITestContext } from './index';
import { uniq } from 'lodash';
import { testBelongsToChunk } from '../test-sharding';
import {
  SHUTDOWN_ACK_TIMEOUT_MS,
  SHUTDOWN_COMPLETE_TIMEOUT_MS,
  SHUTDOWN_EXIT_TIMEOUT_MS,
} from '../../../app/util/shutdown-coordinator';
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

export const USER_POOL_TOKEN = process.env.SLOBS_TEST_USER_POOL_TOKEN;
const USER_POOL_URL = 'https://slobs-users-pool.herokuapp.com'; // 'http://localhost:5000'
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
    // TODO: index
    // @ts-ignore
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
export const testFn: TestInterface<ITestContext> = new Proxy(avaTest, {
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
  return testBelongsToChunk(testName, testTimings, process.env.SLOBS_TEST_RUN_CHUNK);
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

export function requestUtilsServer(path: string, method = 'get', body?: unknown) {
  return new Promise((resolve, reject) => {
    fetch(`${USER_POOL_URL}/${path}`, {
      method,
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${USER_POOL_TOKEN}`,
        'Content-Type': 'application/json',
      },
    })
      .then((res: any) => {
        if (res.status !== 200) {
          res.json().then((data: any) => {
            console.error('Unable to request the utility server', data);
            reject();
          });
        } else {
          res.json().then((data: any) => resolve(data));
        }
      })
      .catch((e: any) => reject(`Utility server is not available ${e}`));
  });
}

async function getElectronInstances() {
  if (process.platform === 'win32') {
    const tasks = await tasklist();
    return tasks.filter((task: any) => task.imageName === 'electron.exe');
  }

  // Returns an object { pid: number, comm: string } for each process, where comm is the command that launched the process
  const { execSync } = require('child_process');
  const output = execSync('ps -eo pid,comm').toString();
  return output
    .split('\n')
    .slice(1)
    .map((line: string) => {
      const [pid, ...commParts] = line.trim().split(/\s+/);
      return { pid: parseInt(pid, 10), comm: commParts.join(' ') };
    })
    .filter((proc: any) => proc.comm && proc.comm.includes('electron'));
}

export async function killElectronInstances() {
  const tasks = await getElectronInstances();
  await Promise.all(tasks.map((task: any) => killProcessTree(task.pid)));
}

function killProcessTree(pid: number): Promise<void> {
  // tree-kill starts taskkill asynchronously. Wait until it finishes before reusing
  // the port or starting an app with a different test cache. The process may already be gone.
  return new Promise(resolve => kill(pid, () => resolve()));
}

export async function killChromedriverOnPort(port: number) {
  const { execSync } = require('child_process');

  const p = Number(port);
  if (!Number.isInteger(p) || p <= 0 || p > 65535) return;

  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${p}`).toString();
      const pids = new Set<number>();
      output.split('\n').forEach((line: string) => {
        const parts = line.trim().split(/\s+/);
        // Proto LocalAddress ForeignAddress State PID
        if (parts.length >= 5 && parts[1].endsWith(`:${p}`) && parts[3] === 'LISTENING') {
          const pid = parseInt(parts[4], 10);
          if (Number.isFinite(pid)) pids.add(pid);
        }
      });
      await Promise.all(Array.from(pids, pid => killProcessTree(pid)));
    } else {
      const output = execSync(`lsof -nP -iTCP:${p} -sTCP:LISTEN -t`).toString().trim();
      if (output) {
        const pids = output
          .split('\n')
          .map((pidStr: string) => parseInt(pidStr, 10))
          .filter((pid: number) => Number.isFinite(pid));
        await Promise.all(pids.map((pid: number) => killProcessTree(pid)));
      }
    }
  } catch (e: unknown) {
    // Nothing is found
  }
}

export async function waitForElectronInstancesExist() {
  const interval = 1000;
  // Allow the application's bounded shutdown to finish before declaring a crash.
  const timeout =
    SHUTDOWN_ACK_TIMEOUT_MS + SHUTDOWN_COMPLETE_TIMEOUT_MS + SHUTDOWN_EXIT_TIMEOUT_MS + interval;

  const startedAt = Date.now();
  let tasks: any[] = await getElectronInstances();

  while (tasks.length > 0 && Date.now() - startedAt < timeout) {
    await new Promise(resolve => setTimeout(resolve, interval));
    tasks = await getElectronInstances();
  }

  const elapsed = Date.now() - startedAt;
  if (tasks.length > 0) {
    throw new Error(`Timed out waiting for Electron instances to exit after ${elapsed}ms`);
  }
}
