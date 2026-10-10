import { getApiClient } from '../helpers/api-client';
import {
  browserFixtureUrl,
  browserScenarioReady,
  newBrowserRun,
  prepareBrowserSourceTestProfile,
  startBrowserFixture,
  stopBrowserFixture,
  TBrowserScenario,
  waitForBrowserReport,
} from '../helpers/browser-source-stress';
import { test, TExecutionContext, useWebdriver } from '../helpers/webdriver';
import { desktopFailureLogs } from '../helpers/webdriver/runner-utils';
import { focusMain, focusWindow, waitForDisplayed } from '../helpers/modules/core';
import { ScenesService } from 'services/api/external-api/scenes';

useWebdriver({
  inheritPlatformEnvironment: true,
  beforeAppStartCb: async t => prepareBrowserSourceTestProfile(t),
});

let fixtureOrigin: string;
test.before(async () => {
  fixtureOrigin = await startBrowserFixture();
});
test.after.always(async () => {
  await stopBrowserFixture();
});

function restoreAndRemoveScene(scenes: ScenesService, initialSceneId: string, sceneId: string): void {
  let cleanupError: unknown;
  try {
    if (!scenes.makeSceneActive(initialSceneId)) {
      throw new Error(`Could not restore scene ${initialSceneId}`);
    }
  } catch (error) {
    cleanupError = error;
  }
  try {
    scenes.removeScene(sceneId);
  } catch (error) {
    if (!cleanupError) cleanupError = error;
  }
  if (cleanupError) throw cleanupError;
}

interface INativeSourceActivity {
  exists: boolean;
  showing: boolean;
  active: boolean;
}

async function observeNativeSourceActivity(
  t: TExecutionContext,
  sourceId: string,
  waitForShowing = true,
): Promise<INativeSourceActivity> {
  const deadline = Date.now() + (waitForShowing ? 10000 : 0);
  let state: INativeSourceActivity = { exists: false, showing: false, active: false };
  try {
    if (!(await focusWindow('worker'))) throw new Error('Could not focus OBS worker window');
    do {
      state = await t.context.app.client.execute((id: string) => {
        const obs = (window as any).obs;
        const input = obs && obs.InputFactory.fromName(id);
        return {
          exists: !!input,
          showing: !!(input && input.showing),
          active: !!(input && input.active),
        };
      }, sourceId);
      if (state.showing || !waitForShowing) return state;
      if (Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 250));
    } while (Date.now() < deadline);
    return state;
  } finally {
    await focusMain();
  }
}

test('Browser source sandbox: non-browser shutdown control', async t => {
  await focusMain();
  await waitForDisplayed('#horizontal-display', { timeout: 10000, interval: 100 });
  const client = await getApiClient();
  const scenes = client.getResource<ScenesService>('ScenesService');
  const scene = scenes.createScene('Sandbox control scene');
  const item = scene.createAndAddSource('Control color', 'color_source');
  t.truthy(item);
  t.true(scenes.makeSceneActive(scene.id));
  t.is(scenes.activeSceneId, scene.id);
  // Leave the source visible for WebDriver's shutdown hook, matching the browser tests.
});

test('Browser source sandbox: streamer workloads execute', async t => {
  await focusMain();
  await waitForDisplayed('#horizontal-display', { timeout: 10000, interval: 100 });
  const client = await getApiClient();
  const scenes = client.getResource<ScenesService>('ScenesService');
  const initialSceneId = scenes.activeSceneId;
  const scene = scenes.createScene('Browser source workloads');
  let testError: unknown;
  try {
    t.true(scenes.makeSceneActive(scene.id));
    t.is(scenes.activeSceneId, scene.id);
    const scenarios: Array<{ scenario: TBrowserScenario; shutdown: boolean }> = [
      { scenario: 'chat', shutdown: false },
      { scenario: 'chat', shutdown: true },
      { scenario: 'alerts', shutdown: true },
      { scenario: 'goals', shutdown: true },
      { scenario: 'canvas', shutdown: true },
      { scenario: 'network', shutdown: true },
    ];
    for (const { scenario, shutdown } of scenarios) {
      const run = newBrowserRun();
      const url = browserFixtureUrl(fixtureOrigin, scenario, run);
      const item = scene.createAndAddSource(`Sandbox ${scenario} shutdown ${shutdown}`, 'browser_source', {
        url,
        width: 640,
        height: 360,
        shutdown,
      });
      t.truthy(item, `${scenario} source was created`);
      if (!item) return;
      let scenarioError: unknown;
      try {
        t.is(item.getSource().getSettings().url, url);
        t.true(item.visible, `${scenario} source is visible`);
        const native = await observeNativeSourceActivity(t, item.getSource().sourceId, shutdown);
        t.log(`${scenario} shutdown=${shutdown} native state: ${JSON.stringify(native)}`);
        const report = await waitForBrowserReport(run, value => browserScenarioReady(scenario, value))
          .catch(error => {
            throw new Error(`${error.message}; native activity: ${JSON.stringify(native)}`);
          });
        t.log(`${scenario} ready: ${JSON.stringify(report.counters)}`);
      } catch (error) {
        scenarioError = error;
        throw error;
      } finally {
        try {
          item.remove();
        } catch (error) {
          if (scenarioError) t.log(`Could not remove ${scenario} after failure: ${error}`);
          else throw error;
        }
      }
    }
  } catch (error) {
    testError = error;
    t.log(desktopFailureLogs(t.context.cacheDir));
    throw error;
  } finally {
    try {
      restoreAndRemoveScene(scenes, initialSceneId, scene.id);
    } catch (error) {
      if (testError) t.log(`Could not remove workload scene after failure: ${error}`);
      else throw error;
    }
  }
});

test('Browser source sandbox: refresh starts a new document', async t => {
  await focusMain();
  await waitForDisplayed('#horizontal-display', { timeout: 10000, interval: 100 });
  const client = await getApiClient();
  const scenes = client.getResource<ScenesService>('ScenesService');
  const initialSceneId = scenes.activeSceneId;
  const scene = scenes.createScene('Browser source refresh');
  const run = newBrowserRun();
  let testError: unknown;
  try {
    const url = browserFixtureUrl(fixtureOrigin, 'combined', run, 'heavy');
    const item = scene.createAndAddSource('Combined overlay', 'browser_source', {
      url,
      width: 1280,
      height: 720,
      shutdown: true,
    });
    t.truthy(item);
    if (!item) return;
    t.is(item.getSource().getSettings().url, url);
    t.true(item.visible, 'combined source is visible');
    t.true(scenes.makeSceneActive(scene.id));
    t.is(scenes.activeSceneId, scene.id);
    const native = await observeNativeSourceActivity(t, item.getSource().sourceId);
    t.log(`combined native state: ${JSON.stringify(native)}`);

    const first = await waitForBrowserReport(
      run,
      report => browserScenarioReady('combined', report),
    ).catch(error => {
      throw new Error(`${error.message}; native activity: ${JSON.stringify(native)}`);
    });
    item.getSource().refresh();
    const refreshed = await waitForBrowserReport(
      run,
      report =>
        report.documentId !== first.documentId &&
        browserScenarioReady('combined', report),
    );
    t.not(refreshed.documentId, first.documentId);
  } catch (error) {
    testError = error;
    t.log(desktopFailureLogs(t.context.cacheDir));
    throw error;
  } finally {
    try {
      restoreAndRemoveScene(scenes, initialSceneId, scene.id);
    } catch (error) {
      if (testError) t.log(`Could not remove refresh scene after failure: ${error}`);
      else throw error;
    }
  }
});
