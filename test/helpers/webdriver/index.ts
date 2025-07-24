/// <reference path="../../../app/index.d.ts" />
/// <reference path="../../../app/jsx.d.ts" />
import { ExecutionContext } from 'ava';
import { getApiClient } from '../api-client';
import { DismissablesService } from 'services/dismissables';
import { getUser, logOut } from './user';
import { sleep } from '../sleep';
import { remote, RemoteOptions } from 'webdriverio';
import * as ChildProcess from 'child_process';
import fetch from 'node-fetch';

import {
  ITestStats,
  killElectronInstances,
  removeFailedTestFromFile,
  saveFailedTestsToFile,
  saveTestStatsToFile,
  testFn,
  waitForElectronInstancesExist,
} from './runner-utils';
import { skipOnboarding } from '../modules/onboarding';
import { closeWindow, focusChild, focusMain, getClient, waitForLoader } from '../modules/core';
import { clearCollections } from '../modules/api/scenes';
export const test = testFn; // the overridden "test" function

const path = require('path');
const fs = require('fs');
const os = require('os');
const rimraf = require('rimraf');

const ALMOST_INFINITY = Math.pow(2, 31) - 1; // max 32bit int

const CHROMEDRIVER_PORT = 4444;

// Enable for verbose debugging output. This does two things:
// Enable Chromedriver logging to chromedriver.log
// Enable Webdriver logging to test output
const CHROMEDRIVER_DEBUG = false;

const testStats: Record<string, ITestStats> = {};

let testStartTime = 0;

const afterStartCallbacks: ((t: TExecutionContext) => any)[] = [];
export function afterAppStart(cb: (t: TExecutionContext) => any) {
  afterStartCallbacks.push(cb);
}
const afterStopCallbacks: ((t: TExecutionContext) => any)[] = [];
export function afterAppStop(cb: (t: TExecutionContext) => any) {
  afterStopCallbacks.push(cb);
}

let testContext: TExecutionContext;
export function setContext(t: TExecutionContext) {
  testContext = t;
}
export function getContext(): TExecutionContext {
  return testContext;
}
export function getApp() {
  return getContext().context.app;
}

interface ITestRunnerOptions {
  skipOnboarding?: boolean;
  restartAppAfterEachTest?: boolean;
  clearCollectionAfterEachTest?: boolean;
  pauseIfFailed?: boolean;
  appArgs?: string;
  implicitTimeout?: number;

  /**
   * disable synchronisation of scene-collections and media-backup
   */
  noSync?: boolean;

  /**
   * Enable this to show network logs if test failed
   */
  networkLogging?: boolean;

  /**
   * Called after cache directory is created but before
   * the app is started.  This is useful for setting up
   * some known state in the cache directory before the
   * app starts up and loads it.
   */
  beforeAppStartCb?(t: TExecutionContext): Promise<any>;
}

const DEFAULT_OPTIONS: ITestRunnerOptions = {
  skipOnboarding: true,
  restartAppAfterEachTest: true,
  clearCollectionAfterEachTest: false,
  noSync: true,
  networkLogging: false,
  pauseIfFailed: false,
  implicitTimeout: 0,
};

class Application {
  client: WebdriverIO.Browser;
  process: ChildProcess.ChildProcess;

  constructor(public options: RemoteOptions) {}

  async start(cacheDir: string) {
    if (this.process) return;

    const cdPath = require.resolve('electron-chromedriver/chromedriver');
    const chromedriverArgs = [cdPath, `--port=${CHROMEDRIVER_PORT}`];

    if (CHROMEDRIVER_DEBUG) {
      chromedriverArgs.push('--verbose');
      chromedriverArgs.push('--log-path=chromedriver.log');
    }

    this.process = ChildProcess.spawn(process.execPath, chromedriverArgs, {
      env: {
        NODE_ENV: 'test',
        SLOBS_CACHE_DIR: cacheDir,
      },
    });

    await this.waitForChromedriver();

    this.client = await remote(this.options);
  }

  stopInProgress = false;

  stop() {
    if (!this.process) return;
    this.process.kill();
    this.process = null;
  }

  async waitForChromedriver() {
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
    }, 10 * 1000);

    while (true) {
      if (timedOut) {
        throw new Error('Chromedriver did not start within 10 seconds!');
      }

      if (await this.isChromedriverRunning()) {
        clearTimeout(timeout);
        return;
      }

      await sleep(100);
    }
  }

  async isChromedriverRunning() {
    const statusUrl = `http://localhost:${CHROMEDRIVER_PORT}/status`;

    try {
      const result = await fetch(statusUrl);
      return result.status === 200;
    } catch (e: unknown) {}
  }
}

export interface ITestContext {
  cacheDir: string;
  app: Application;
}

export type TExecutionContext = ExecutionContext<ITestContext>;

let startAppFn: (t: TExecutionContext, reuseCache?: boolean) => Promise<any>;
let stopAppFn: (t: TExecutionContext, clearCache?: boolean) => Promise<any>;

export async function startApp(t: TExecutionContext, reuseCache = false) {
  return startAppFn(t, reuseCache);
}

export async function stopApp(t: TExecutionContext, clearCache?: boolean) {
  return stopAppFn(t, clearCache);
}

export async function restartApp(t: TExecutionContext): Promise<Application> {
  await stopAppFn(t, false);
  return await startAppFn(t, true);
}

let skipCheckingErrorsInLogFlag = false;

/**
 * Disable checking errors in the log file for a single test
 */
export function skipCheckingErrorsInLog() {
  skipCheckingErrorsInLogFlag = true;
}

export async function debugPause() {
  await getClient().execute(
    "(() => { var _elec = require('electron'); _elec.ipcRenderer.send('openDevTools'); })();",
  );
  await new Promise(() => {});
}

export function useWebdriver(options: ITestRunnerOptions = {}) {
  // tslint:disable-next-line:no-parameter-reassignment TODO
  options = Object.assign({}, DEFAULT_OPTIONS, options);
  let appIsRunning = false;
  let app: Application;
  let testPassed = false;
  let failMsg = '';
  let testName = '';
  let logFileLastReadingPos = 0;
  let lastCacheDir: string;
  let lastLogs: string;

  startAppFn = async function startApp(
    t: TExecutionContext,
    reuseCache = false,
  ): Promise<Application> {
    if (!reuseCache) {
      lastCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slobs-test'));
    }

    t.context.cacheDir = lastCacheDir;
    const appArgs = options.appArgs ? options.appArgs.split(' ') : [];
    if (options.networkLogging) appArgs.push('--network-logging');
    if (options.noSync) appArgs.push('--nosync');

    await killElectronInstances();

    app = t.context.app = new Application({
      port: CHROMEDRIVER_PORT,
      logLevel: CHROMEDRIVER_DEBUG ? 'debug' : 'silent',
      capabilities: {
        browserName: 'chrome',
        'goog:chromeOptions': {
          binary: path.join(
            __dirname,
            '..',
            '..',
            '..',
            '..',
            'node_modules',
            '.bin',
            'electron.cmd',
          ),
          args: [
            ...appArgs,
            '--app=test-main.js',
            `user-data-dir=${path.join(t.context.cacheDir, 'slobs-client')}`,
          ],
        },
      },
    });

    if (options.beforeAppStartCb) await options.beforeAppStartCb(t);

    await t.context.app.start(t.context.cacheDir);

    // Disable CSS transitions while running tests to allow for eager test clicks
    // also disable tooltips and the tree mask on sourceSelector
    const disableTransitionsCode = `
      const disableAnimationsEl = document.createElement('style');
      disableAnimationsEl.textContent =
        '*{ transition: none !important; transition-property: none !important; animation-duration: 0 !important } .ant-tooltip-content{display: none} div[data-name=treeMask]{display: none}';
      document.head.appendChild(disableAnimationsEl);
      0; // Prevent returning a value that cannot be serialized
    `;
    await focusMain();

    // await t.context.app.webContents.executeJavaScript(disableTransitionsCode);
    app.client.execute(disableTransitionsCode);
    await focusMain();

    // Wait up to N seconds before giving up looking for an element.
    // This will slightly slow down negative assertions, but makes
    // the tests much more stable, especially on slow systems.
    await t.context.app.client.setTimeout({ implicit: options.implicitTimeout });

    // Pretty much all tests except for onboarding-specific
    // tests will want to skip this flow, so we do it automatically.
    await waitForLoader();

    if (options.skipOnboarding) await skipOnboarding();

    // disable the popups that prevents context menu to be shown
    const client = await getApiClient();
    const dismissablesService = client.getResource<DismissablesService>('DismissablesService');
    dismissablesService.dismissAll();

    // disable animations in the child window
    await focusChild();

    // await t.context.app.webContents.executeJavaScript(disableTransitionsCode);
    app.client.execute(disableTransitionsCode);
    await focusMain();
    appIsRunning = true;

    return app;
  };

  stopAppFn = async function stopApp(t: TExecutionContext, clearCache = true) {
    try {
      await closeWindow('main');
      await waitForElectronInstancesExist();

      app.stop();
    } catch (e: unknown) {
      fail('Crash on shutdown');
      console.error(e);
    }
    await killElectronInstances();
    appIsRunning = false;
    await checkErrorsInLogFile(t);
    logFileLastReadingPos = 0;

    if (!clearCache) return;
    await new Promise(resolve => {
      rimraf(lastCacheDir, resolve);
    });
    for (const callback of afterStopCallbacks) {
      await callback(t);
    }
  };

  /**
   * test should be considered as failed if it writes exceptions in to the log file
   */
  async function checkErrorsInLogFile(t: TExecutionContext) {
    await sleep(1000); // electron-log needs some time to write down logs
    const logs: string = await readLogs();
    if (!logs) return;
    lastLogs = logs;
    let ignoringErrors = false;
    const errors = logs
      .slice(logFileLastReadingPos)
      .split('\n')
      .filter((record: string) => {
        // This error is outside our control and can be ignored.
        // See: https://stackoverflow.com/questions/49384120/resizeobserver-loop-limit-exceeded
        if (record.match(/ResizeObserver loop limit exceeded/)) {
          return false;
        }

        // This error is related to a bug in `useModule` and this check should be removed
        // after we fix it in the new `useModule`
        if (record.match(/while rendering a different component/)) {
          // Ignore errors until we encouter the next thing that isn't an error
          ignoringErrors = true;
          return false;
        }

        // TODO: Only enable this check when running tests locally
        if (record.match(/Missing translation/)) {
          return false;
        }

        const isError = !!record.match(/\[error\]/);

        if (isError) {
          return !ignoringErrors;
        } else {
          ignoringErrors = false;
          return false;
        }
      });

    // save the last reading position, to skip already read records next time
    logFileLastReadingPos = logs.length - 1;

    // remove [vue-i18n] warnings
    const displayLogs = logs
      .split('\n')
      .filter(str => !str.match('Fall back to translate'))
      .join('\n');

    if (errors.length && !skipCheckingErrorsInLogFlag) {
      fail(`The log-file has errors \n ${displayLogs}`);
    } else if (options.networkLogging && !testPassed) {
      fail(`log-file: \n ${displayLogs}`);
    }
  }

  test.beforeEach(async t => {
    testName = t.title.replace('beforeEach hook for ', '');
    testPassed = false;
    skipCheckingErrorsInLogFlag = false;

    t.context.app = app;
    setContext(t);
    if (options.restartAppAfterEachTest || !appIsRunning) {
      await startAppFn(t);
    } else {
      // Set the cache dir to what it previously was, since we are re-using it
      t.context.cacheDir = lastCacheDir;
    }
    for (const callback of afterStartCallbacks) {
      await callback(t);
    }
    testStartTime = Date.now();
  });

  test.afterEach(async t => {
    testPassed = true;
  });

  test.afterEach.always(async t => {
    await checkErrorsInLogFile(t);
    if (!testPassed && options.pauseIfFailed) {
      console.log('Test execution has been paused due `pauseIfFailed` enabled');
      await sleep(ALMOST_INFINITY);
    }

    // wrap in try/catch for the situation when we have a crash
    // so we still can read the logs after the crash
    try {
      if (appIsRunning && options.clearCollectionAfterEachTest) await clearCollections();
      await logOut(t, true);
      if (options.restartAppAfterEachTest) {
        if (appIsRunning) {
          const client = await getApiClient();
          await client.unsubscribeAll();
          client.disconnect();
          await stopAppFn(t);
        }
      }
    } catch (e: unknown) {
      fail('Test finalization failed');
      console.error(e);
    }

    if (testPassed) {
      // consider this test succeed and remove from the `failedTests` list
      removeFailedTestFromFile(testName);
      // save the test execution time
      testStats[testName] = {
        duration: Date.now() - testStartTime,
        syncIPCCalls: getSyncIPCCalls(),
      };
    } else {
      fail();
      const user = getUser();
      if (user) console.log(`Test failed for the account: ${user.type} ${user.email}`);
      t.fail(failMsg);
    }
  });

  test.after.always(async t => {
    if (appIsRunning) await stopAppFn(t);
    if (!testPassed) saveFailedTestsToFile([testName]);
    await saveTestStatsToFile(testStats);
  });

  /**
   * mark tests as failed
   */
  function fail(msg?: string) {
    testPassed = false;
    if (msg) failMsg = msg;
  }

  function readLogs(): string {
    const filePath = path.join(lastCacheDir, 'slobs-client', 'app.log');
    if (!fs.existsSync(filePath)) return;
    return fs.readFileSync(filePath).toString();
  }

  function getSyncIPCCalls() {
    return lastLogs.split('\n').filter(line => line.match('Calling synchronous service method'))
      .length;
  }
}
