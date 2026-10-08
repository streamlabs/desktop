/**
 * This file provides patches for AVA that allow to track failed tests to re-run them
 * Also it skips the tests that should be run on an different CI agent in a parallel execution mode
 */

import avaTest, { TestInterface } from 'ava';
import { ITestContext } from './index';
import { uniq } from 'lodash';
import * as path from 'path';
const fs = require('fs');
const fetch = require('node-fetch');
const kill = require('tree-kill');

export interface ITestStats {
  duration: number;
  syncIPCCalls: number;
}

export function desktopFailureLogs(cacheDir: string): string {
  const files = [path.join(cacheDir, 'slobs-client', 'app.log')];
  const obsLogDir = path.join(cacheDir, 'slobs-client', 'node-obs', 'logs');
  try {
    const obsLogs = fs.readdirSync(obsLogDir)
      .map((name: string) => path.join(obsLogDir, name))
      .filter((file: string) => fs.statSync(file).isFile())
      .sort((left: string, right: string) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
    if (obsLogs.length) files.push(obsLogs[0]);
  } catch (error) {
    files.push(`${obsLogDir} (unavailable: ${error.message})`);
  }
  const matcher = /\[Shutdown\]|obs-browser|Browser Source|CreateBrowserSync|CEF|sandbox|obs_shutdown|destroyOBS_API|Failed to load plugin/i;
  return files.map(file => {
    try {
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      const relevant = lines.filter((line: string) => matcher.test(line)).slice(-30);
      return `${file}:\n${relevant.length ? relevant.join('\n') : '(no matching lines)'}`;
    } catch (error) {
      return `${file}: unreadable (${error.message})`;
    }
  }).join('\n');
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

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

export function windowsProcessStartTime(pid: number): string | undefined {
  if (process.platform !== 'win32' || !Number.isInteger(pid) || pid <= 0) return;
  try {
    const { execFileSync } = require('child_process');
    const script = `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks`;
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      timeout: 5000,
    }).trim() || undefined;
  } catch (error) {
    return;
  }
}

function describeWindowsProcess(pid: number): string {
  try {
    const { execFileSync } = require('child_process');
    const script = `Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,Path,StartTime,HasExited,@{Name='ThreadCount';Expression={$_.Threads.Count}} | ConvertTo-Json -Compress`;
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      timeout: 5000,
    }).trim() || 'no matching process';
  } catch (error) {
    return `process lookup failed: ${error.message}`;
  }
}

export async function waitForProcessExit(
  pid: number,
  timeoutMs = 55000,
  description = 'process',
  expectedStartTime?: string,
): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error(`Invalid ${description} PID: ${pid}`);
  const startedAt = Date.now();
  while (processExists(pid)) {
    if (Date.now() - startedAt >= timeoutMs) {
      const details = process.platform === 'win32' ? `; process: ${describeWindowsProcess(pid)}` : '';
      const currentStartTime = process.platform === 'win32' ? windowsProcessStartTime(pid) : undefined;
      if (expectedStartTime && currentStartTime && currentStartTime !== expectedStartTime) return;
      if (!processExists(pid)) return;
      throw new Error(`Timed out waiting for ${description} PID ${pid} to exit after ${Date.now() - startedAt}ms${details}`);
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}

export async function killProcessTree(pid: number): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0 || !processExists(pid)) return;
  await new Promise<void>((resolve, reject) => {
    kill(pid, (error: NodeJS.ErrnoException) => {
      // The process may exit between the existence check and tree-kill's taskkill call.
      try {
        if (error && processExists(pid)) reject(error);
        else resolve();
      } catch (checkError) {
        reject(checkError);
      }
    });
  });
  await waitForProcessExit(pid, 10000, 'process tree root');
}

export async function killChromedriverOnPort(port: number): Promise<void> {
  const { execSync } = require('child_process');

  const p = Number(port);
  if (!Number.isInteger(p) || p <= 0 || p > 65535) return;

  const pids = new Set<number>();
  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${p}`).toString();
      output.split('\n').forEach((line: string) => {
        const parts = line.trim().split(/\s+/);
        // Proto LocalAddress ForeignAddress State PID
        if (parts.length >= 5 && parts[1].endsWith(`:${p}`) && parts[3] === 'LISTENING') {
          const pid = parseInt(parts[4], 10);
          if (Number.isFinite(pid)) pids.add(pid);
        }
      });
    } else {
      const output = execSync(`lsof -nP -iTCP:${p} -sTCP:LISTEN -t`).toString().trim();
      if (output) {
        output
          .split('\n')
          .map((pidStr: string) => parseInt(pidStr, 10))
          .filter((pid: number) => Number.isFinite(pid))
          .forEach((pid: number) => pids.add(pid));
      }
    }
  } catch (e: unknown) {
    // Nothing is found
  }
  await Promise.all(Array.from(pids).map(pid => killProcessTree(pid)));
}
