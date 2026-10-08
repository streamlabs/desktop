import { getApiClient } from '../helpers/api-client';
import {
  browserFixtureUrl,
  browserScenarioReady,
  IBrowserFixtureReport,
  newBrowserRun,
  prepareBrowserSourceTestProfile,
  startBrowserFixture,
  stopBrowserFixture,
  TBrowserScenario,
  waitForBrowserReport,
} from '../helpers/browser-source-stress';
import { restartApp, test, useWebdriver } from '../helpers/webdriver';
import { focusMain, waitForDisplayed } from '../helpers/modules/core';
import { ScenesService } from 'services/api/external-api/scenes';

useWebdriver({
  inheritPlatformEnvironment: true,
  beforeAppStartCb: async t => prepareBrowserSourceTestProfile(t),
});

test.beforeEach(async () => {
  await focusMain();
  await waitForDisplayed('#horizontal-display', { timeout: 10000, interval: 100 });
});

let fixtureOrigin: string;
test.before(async () => {
  fixtureOrigin = await startBrowserFixture();
});
test.after.always(async () => {
  await stopBrowserFixture();
});

function repeatCount(name: string, fallback: number, maximum: number, minimum = 1): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const count = Number(raw);
  if (!Number.isInteger(count) || count < minimum || count > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return count;
}

test('Browser source sandbox stress: repeated Desktop launches', async t => {
  const launchCount = repeatCount('SLOBS_BROWSER_SOURCE_LAUNCHES', 30, 200);
  const client = await getApiClient();
  const scenes = client.getResource<ScenesService>('ScenesService');
  const scene = scenes.createScene('Persisted browser source');
  const sceneId = scene.id;
  t.true(scenes.makeSceneActive(sceneId));
  const run = newBrowserRun();
  const item = scene.createAndAddSource('Combined streamer overlay', 'browser_source', {
    url: browserFixtureUrl(fixtureOrigin, 'combined', run, 'heavy'),
    width: 800,
    height: 600,
    shutdown: true,
  });
  t.truthy(item);
  if (!item) return;
  const webglRun = newBrowserRun();
  const webglItem = scene.createAndAddSource('WebGL streamer overlay', 'browser_source', {
    url: browserFixtureUrl(fixtureOrigin, 'webgl', webglRun, 'heavy'),
    width: 480,
    height: 600,
    shutdown: true,
  });
  t.truthy(webglItem);
  if (!webglItem) return;
  webglItem.setTransform({ position: { x: 800, y: 0 } });

  let previous = await Promise.all([
    waitForBrowserReport(run, report => browserScenarioReady('combined', report)),
    waitForBrowserReport(webglRun, report => browserScenarioReady('webgl', report)),
  ]);
  for (let launch = 1; launch <= launchCount; launch += 1) {
    try {
      await restartApp(t);
      await waitForDisplayed('#horizontal-display', { timeout: 10000, interval: 100 });
      const current = await Promise.all([
        waitForBrowserReport(
          run,
          value =>
            value.documentId !== previous[0].documentId && browserScenarioReady('combined', value),
          45000,
        ),
        waitForBrowserReport(
          webglRun,
          value =>
            value.documentId !== previous[1].documentId && browserScenarioReady('webgl', value),
          45000,
        ),
      ]);
      const reopenedClient = await getApiClient();
      const reopenedScenes = reopenedClient.getResource<ScenesService>('ScenesService');
      t.is(reopenedScenes.activeSceneId, sceneId);
      t.truthy(reopenedScenes.activeScene.getNodeByName('Combined streamer overlay'));
      t.truthy(reopenedScenes.activeScene.getNodeByName('WebGL streamer overlay'));
      t.log(`launch ${launch}/${launchCount}: documents ${current.map(report => report.documentId).join(', ')}`);
      previous = current;
    } catch (error) {
      throw new Error(`Browser source failed on launch ${launch}/${launchCount}: ${error.message}`);
    }
  }
});

test('Browser source sandbox stress: mixed overlays survive scene cycling', async t => {
  const cycles = repeatCount('SLOBS_BROWSER_SOURCE_CYCLES', 12, 100);
  const client = await getApiClient();
  const scenes = client.getResource<ScenesService>('ScenesService');
  const overlayScene = scenes.createScene('Streamer overlays');
  const blankScene = scenes.createScene('Scene switch target');
  t.true(scenes.makeSceneActive(overlayScene.id));

  const scenarios: TBrowserScenario[] = ['chat', 'alerts', 'goals', 'canvas', 'webgl', 'network'];
  const runs = scenarios.map(scenario => ({ scenario, run: newBrowserRun() }));
  const items = runs.map(({ scenario, run }, index) => {
    const item = overlayScene.createAndAddSource(`Cycle ${scenario}`, 'browser_source', {
      url: browserFixtureUrl(fixtureOrigin, scenario, run, 'heavy'),
      width: 400,
      height: 300,
      shutdown: true,
    });
    if (!item) throw new Error(`Could not create ${scenario} browser source`);
    item.setTransform({ position: { x: (index % 3) * 400, y: Math.floor(index / 3) * 300 } });
    return item;
  });

  let previous = await Promise.all(
    runs.map(({ scenario, run }) =>
      waitForBrowserReport(run, report => browserScenarioReady(scenario, report)),
    ),
  );
  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    t.true(scenes.makeSceneActive(blankScene.id));
    await new Promise(resolve => setTimeout(resolve, 1500));
    t.true(scenes.makeSceneActive(overlayScene.id));
    try {
      const current = await Promise.all(
        runs.map(({ scenario, run }, index) =>
          waitForBrowserReport(
            run,
            report =>
              report.documentId !== previous[index].documentId &&
              browserScenarioReady(scenario, report),
          ),
        ),
      );
      current.forEach((report, index) => t.is(report.scenario, scenarios[index]));
      previous = current;
      t.log(`scene cycle ${cycle}/${cycles}: all ${current.length} pages restarted`);
    } catch (error) {
      throw new Error(`Browser sources failed after scene cycle ${cycle}/${cycles}: ${error.message}`);
    }
  }

  items.forEach(item => item.remove());
});

test('Browser source sandbox stress: repeated source creation', async t => {
  const attempts = repeatCount('SLOBS_BROWSER_SOURCE_CREATIONS', 40, 300);
  const client = await getApiClient();
  const scenes = client.getResource<ScenesService>('ScenesService');
  const scene = scenes.createScene('Browser source creation loop');
  t.true(scenes.makeSceneActive(scene.id));
  const scenarios: TBrowserScenario[] = ['chat', 'alerts', 'goals', 'canvas', 'webgl', 'network'];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const scenario = scenarios[(attempt - 1) % scenarios.length];
    const run = newBrowserRun();
    const item = scene.createAndAddSource(`Browser iteration ${attempt}`, 'browser_source', {
      url: browserFixtureUrl(fixtureOrigin, scenario, run, 'heavy'),
      width: 960,
      height: 540,
      shutdown: true,
    });
    if (!item) throw new Error(`Source creation failed at ${attempt}/${attempts}`);
    try {
      const report = await waitForBrowserReport(
        run,
        value => browserScenarioReady(scenario, value),
      );
      t.log(`source ${attempt}/${attempts}: ${scenario}, document ${report.documentId}`);
    } catch (error) {
      throw new Error(`Browser source ${scenario} failed at ${attempt}/${attempts}: ${error.message}`);
    } finally {
      item.remove();
    }
  }
});

test('Browser source sandbox stress: media GPU and network soak', async t => {
  const seconds = repeatCount('SLOBS_BROWSER_SOURCE_SOAK_SECONDS', 90, 3600, 20);
  const client = await getApiClient();
  const scenes = client.getResource<ScenesService>('ScenesService');
  const scene = scenes.createScene('Browser source soak');
  t.true(scenes.makeSceneActive(scene.id));
  const scenarios: TBrowserScenario[] = ['alerts', 'webgl', 'network'];
  const runs = scenarios.map(scenario => ({ scenario, run: newBrowserRun() }));
  runs.forEach(({ scenario, run }, index) => {
    const item = scene.createAndAddSource(`Soak ${scenario}`, 'browser_source', {
      url: browserFixtureUrl(fixtureOrigin, scenario, run, 'heavy'),
      width: 400,
      height: 300,
      shutdown: true,
    });
    if (!item) throw new Error(`Could not create ${scenario} soak source`);
    item.setTransform({ position: { x: index * 400, y: 0 } });
  });

  const initial = await Promise.all(
    runs.map(({ scenario, run }) =>
      waitForBrowserReport(run, report => browserScenarioReady(scenario, report)),
    ),
  );
  const deadline = Date.now() + seconds * 1000;
  let last: IBrowserFixtureReport[] = initial;
  while (Date.now() < deadline) {
    const sampleStarted = Date.now();
    const previous = last;
    await new Promise(resolve =>
      setTimeout(resolve, Math.max(1, Math.min(10000, deadline - Date.now()))),
    );
    last = await Promise.all(
      runs.map(({ run }, index) =>
        waitForBrowserReport(
          run,
          report =>
            report.documentId === previous[index].documentId &&
            report.receivedAt > previous[index].receivedAt,
        ),
      ),
    );
    if (Date.now() - sampleStarted >= 5000) {
      t.true(last[0].counters.alerts > previous[0].counters.alerts);
      t.true(last[1].counters.webglFrames > previous[1].counters.webglFrames);
      t.true(last[2].counters.fetch > previous[2].counters.fetch);
      t.true(last[2].counters.sse > previous[2].counters.sse);
      t.true(last[0].videoStatus === 'playing' || last[0].videoStatus === 'ended');
      t.is(last[1].webglStatus, 'active');
    }
  }
  t.true(last[0].counters.alerts > initial[0].counters.alerts);
  t.true(last[0].counters.videoEnds > initial[0].counters.videoEnds);
  t.true(last[0].videoStatus === 'playing' || last[0].videoStatus === 'ended');
  t.true(last[1].counters.webglFrames > initial[1].counters.webglFrames);
  t.is(last[1].webglStatus, 'active');
  t.true(last[2].counters.fetch > initial[2].counters.fetch);
  t.true(last[2].counters.sse > initial[2].counters.sse);
  t.true(last[2].counters.reconnects > initial[2].counters.reconnects);
});
