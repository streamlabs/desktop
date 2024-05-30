/// <reference path="../../../app/index.d.ts" />
import avaTest, { ExecutionContext } from 'ava';
import { DismissablesService } from 'services/dismissables';
import { sleep } from '../sleep';
import { remote, RemoteOptions } from 'webdriverio';
import * as ChildProcess from 'child_process';
import { closeWindow, focusChild, focusMain, waitForLoader } from '../modules/core';
import {
  killElectronInstances,
  waitForElectronInstancesExist,
  testFn,
  initializeTasks,
} from './runner-utils';
import { getApiClient } from '../api-client';
export const test = testFn; // the overridden "test" function

const CHROMEDRIVER_PORT = 4444;

// Enable for verbose debugging output. This does two things:
// Enable Chromedriver logging to chromedriver.log
// Enable Webdriver logging to test output
const CHROMEDRIVER_DEBUG = false;

class Application {
  client: WebdriverIO.Browser;
  process: ChildProcess.ChildProcess;

  constructor(public options: RemoteOptions) {}

  async start(cacheDir: string, chromedriverLogging = false) {
    if (this.process) return;

    const cdPath = require.resolve('electron-chromedriver/chromedriver');
    const chromedriverArgs = [cdPath, `--port=${CHROMEDRIVER_PORT}`];

    if (CHROMEDRIVER_DEBUG) {
      chromedriverArgs.push('--verbose');
      chromedriverArgs.push('--log-path=chromedriver.log');
    } else if (chromedriverLogging) {
      chromedriverArgs.push('--log-path=chromedriver.log');
    }

    this.process = ChildProcess.spawn(process.execPath, chromedriverArgs, {
      env: {
        NODE_ENV: 'test',
        NAIR_CACHE_DIR: cacheDir,
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

const path = require('path');
const fs = require('fs');
const os = require('os');
const rimraf = require('rimraf');

const afterStartCallbacks: ((t: TExecutionContext) => any)[] = [];
export function afterAppStart(cb: (t: TExecutionContext) => any) {
  afterStartCallbacks.push(cb);
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
  appArgs?: string;
  implicitTimeout?: number;
  chromeDriverLogging?: boolean;

  /**
   * Called after cache directory is created but before
   * the app is started.  This is useful for setting up
   * some known state in the cache directory before the
   * app starts up and loads it.
   */
  beforeAppStartCb?(t: any): Promise<any>;
}

const DEFAULT_OPTIONS: ITestRunnerOptions = {
  skipOnboarding: true,
  restartAppAfterEachTest: true,
  implicitTimeout: 1000, // テスト時間短縮のために 2000 -> 1000 にしてみたが、問題が出たら戻す
} as const;

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

export function useWebdriver(options: ITestRunnerOptions = {}) {
  options = Object.assign({}, DEFAULT_OPTIONS, options);
  let appIsRunning = false;
  // let context: any = null;
  let app: Application;
  let testPassed = false;
  let failMsg = '';
  let lastCacheDir: string;

  startAppFn = async function startApp(
    t: TExecutionContext,
    reuseCache = false,
  ): Promise<Application> {
    if (!reuseCache) {
      lastCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n-air-test'));
    }
    t.context.cacheDir = lastCacheDir;
    const appArgs = options.appArgs ? options.appArgs.split(' ') : [];

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
            `user-data-dir=${path.join(t.context.cacheDir, 'nair-client')}`,
          ],
        },
      },
    });
    setContext(t);

    if (options.beforeAppStartCb) await options.beforeAppStartCb(t);

    await t.context.app.start(t.context.cacheDir, options.chromeDriverLogging);

    // Disable CSS transitions while running tests to allow for eager test clicks
    const disableTransitionsCode = `
      const disableAnimationsEl = document.createElement('style');
      disableAnimationsEl.textContent =
        '*{ transition: none !important; transition-property: none !important; animation: none !important }';
      document.head.appendChild(disableAnimationsEl);
    `;
    await focusMain();

    // await t.context.app.webContents.executeJavaScript(disableTransitionsCode);
    app.client.execute(disableTransitionsCode);
    await focusMain();

    // Wait up to 2 seconds before giving up looking for an element.
    // This will slightly slow down negative assertions, but makes
    // the tests much more stable, especially on slow systems.
    // t.context.app.client.timeouts('implicit', 2000);
    t.context.app.client.setTimeout({ implicit: options.implicitTimeout });

    // await sleep(100000);

    // Pretty much all tests except for onboarding-specific
    // tests will want to skip this flow, so we do it automatically.
    await waitForLoader();
    if (options.skipOnboarding) {
      await t.context.app.client.$('.onboarding-step').waitForExist({ timeout: 10000 });
      await t.context.app.client.$('[data-test="Skip"]').click();

      // This will only show up if OBS is installed
      if (await t.context.app.client.$('[data-test="Skip"]').isExisting()) {
        await t.context.app.client.$('[data-test="Skip"]').click();
      }
    } else {
      // Wait for the connect screen before moving on
      await t.context.app.client.$('[data-test="NiconicoSignup"]').isExisting();
    }

    // disable the popups that prevents context menu to be shown
    const client = await getApiClient();
    const dismissablesService = client.getResource<DismissablesService>('DismissablesService');
    dismissablesService.dismissAll();

    // disable animations in the child window
    await focusChild();

    // await t.context.app.webContents.executeJavaScript(disableTransitionsCode);
    app.client.execute(disableTransitionsCode);
    await focusMain();

    // context = t.context;
    appIsRunning = true;

    for (const callback of afterStartCallbacks) {
      await callback(t);
    }

    return app;
  };

  stopAppFn = async function stopApp(t: ExecutionContext, clearCache = true) {
    try {
      await closeWindow('main');
      await waitForElectronInstancesExist();

      await app.stop();
    } catch (e) {
      fail('Crash on shutdown');
      console.error(e);
    }
    await killElectronInstances();
    appIsRunning = false;

    if (!clearCache) return;
    await new Promise(resolve => {
      rimraf(lastCacheDir, resolve);
    });
  };

  test.beforeEach(async t => {
    testPassed = false;

    t.context.app = app;
    if (options.restartAppAfterEachTest || !appIsRunning) {
      await initializeTasks();
      await startApp(t);
    } else {
      // Set the cache dir to what it previously was, since we are re-using it
      t.context.cacheDir = lastCacheDir;
    }
  });

  test.afterEach(async t => {
    testPassed = true;
  });

  test.afterEach.always(async t => {
    // wrap in try/catch for the situation when we have a crash
    // so we still can read the logs after the crash
    try {
      if (options.restartAppAfterEachTest) {
        if (appIsRunning) {
          const client = await getApiClient();
          await client.unsubscribeAll();
          client.disconnect();
          await stopAppFn(t);
        }
      }
    } catch (e) {
      fail('Test finalization failed');
      console.error(e);
    }

    if (!testPassed) {
      fail();
      t.fail(failMsg);
    }
  });

  test.after.always(async t => {
    if (appIsRunning) await stopAppFn(t);
  });

  /**
   * mark tests as failed
   */
  function fail(msg?: string) {
    testPassed = false;
    if (msg) failMsg = msg;
  }
}
