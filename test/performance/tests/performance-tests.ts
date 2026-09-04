import { MetricsService } from '../../../app/services/metrics';
import { test, stopApp, startApp, TExecutionContext } from '../../helpers/webdriver';
import { ApiClient, getApiClient } from '../../helpers/api-client';
import { TSourceType } from '../../../app/services/sources/sources-api';
import { ScenesService } from '../../../app/services/api/external-api/scenes';
import { getMeter } from '../meter';
import { spawnSync } from 'child_process';
import { sleep } from '../../helpers/sleep';
import { startRecording, stopRecording } from '../../helpers/modules/streaming';
import { getCPUUsage, getMemoryUsage, logTiming, usePerformanceTest } from '../tools';
import { logIn } from '../../helpers/webdriver/user';
import { ExecutionContext } from 'ava';
import { CustomizationService } from '../../../app/services/customization';
import {
  setOutputResolution,
  setTemporaryRecordingPath,
} from '../../helpers/modules/settings/settings';
const fs = require('fs-extra');
const _7z = require('7zip')['7z'];
const path = require('path');

usePerformanceTest();

const RELOAD_ATTEMPTS = 15;
const CPU_ATTEMPTS = 100;
const ADD_SOURCES_ATTEMPTS = 5;
const MAX_SOURCES_COUNT = 40;

/**
 * unzip a sample of a large scene collection to the SceneCollection folder
 */
function unzipLargeSceneCollection(t: TExecutionContext) {
  const cacheDir = path.resolve(t.context.cacheDir, 'slobs-client');
  const sceneCollectionPath = path.resolve(cacheDir, 'SceneCollections');
  fs.removeSync(sceneCollectionPath);

  const dataDir = path.resolve(__dirname, '..', '..', '..', '..', '..', 'test', 'data');
  const sceneCollectionZip = path.resolve(
    dataDir,
    'scene-collections',
    'huge-scene-collection.zip',
  );
  spawnSync(_7z, ['x', sceneCollectionZip, `-o${cacheDir}`]);
}

function measureStartupTime(api: ApiClient) {
  const meter = getMeter();
  const metricsService = api.getResource<MetricsService>('MetricsService');
  const appMetrics = metricsService.getMetrics();
  meter.addMeasurement('mainWindowShow', appMetrics.mainWindowShowTime - appMetrics.appStartTime);
  meter.addMeasurement(
    'sceneCollectionLoad',
    appMetrics.sceneCollectionLoadingTime - appMetrics.mainWindowShowTime,
  );
}

async function measureMemoryAndCPU(t: ExecutionContext, attempts = CPU_ATTEMPTS) {
  logTiming(t, 'Start recodring CPU and Memory');
  const meter = getMeter();
  while (attempts--) {
    meter.addMeasurement('CPU', await getCPUUsage());
    meter.addMeasurement('memory', await getMemoryUsage());
    await sleep(2000);
  }
  logTiming(t, 'Stop recodring CPU and Memory');
}

test('Bundle size', async t => {
  const meter = getMeter();
  const bundlePath = path.resolve(__dirname, '..', '..', '..', '..', 'bundles');
  const rendererPath = path.resolve(bundlePath, 'renderer.js');
  const updaterPath = path.resolve(bundlePath, 'updater.js');
  const rendererSize = fs.statSync(rendererPath).size;
  const updaterSize = fs.statSync(updaterPath).size;
  meter.addMeasurement('renderer-js', rendererSize);
  meter.addMeasurement('updater-js', updaterSize);
  t.pass();
});

test('Empty collection', async t => {
  await stopApp(t, false);

  // measure startup time
  let attempts = RELOAD_ATTEMPTS;
  while (attempts--) {
    await startApp(t, true);
    const api = await getApiClient();
    measureStartupTime(api);
    await stopApp(t, false);
  }

  // measure memory and CPU
  await startApp(t, true);
  await measureMemoryAndCPU(t);

  t.pass();
});

test('Large collection', async t => {
  await sleep(2000);
  await stopApp(t, false);
  await unzipLargeSceneCollection(t);

  // measure startup time
  let i = RELOAD_ATTEMPTS;
  while (i--) {
    await startApp(t, true);
    const api = await getApiClient();
    measureStartupTime(api);
    await stopApp(t, false);
  }

  // measure memory and CPU
  await startApp(t, true);
  await measureMemoryAndCPU(t);
  t.pass();
});

test('Empty collection (logged-in twitch)', async t => {
  const meter = getMeter();
  await logIn(t, 'twitch');
  await sleep(2000);
  await stopApp(t, false);

  // measure startup time
  let attempts = RELOAD_ATTEMPTS;
  while (attempts--) {
    await startApp(t, true);
    const api = await getApiClient();
    measureStartupTime(api);
    await stopApp(t, false);
  }
  t.pass();
});

test('Recording', async t => {
  await setTemporaryRecordingPath(false, t.context.cacheDir);
  await setOutputResolution('100x100');
  const api = await getApiClient();
  const scenesService = api.getResource<ScenesService>('ScenesService');
  scenesService.activeScene.createAndAddSource('Color', 'color_source');

  await startRecording();
  await measureMemoryAndCPU(t);
  await stopRecording();

  t.pass();
});

test('Create sources', async t => {
  const sourceTypes = [
    'image_source',
    'color_source',
    'slideshow',
    'text_gdiplus',
    'text_ft2_source',
    'monitor_capture',
    'window_capture',
    'game_capture',
    'decklink-input',
    'ndi_source',
    'openvr_capture',
    'liv_capture',
    'ovrstream_dc_source',
    'vlc_source',
    'browser_source',
    'wasapi_input_capture',
    'wasapi_output_capture',
    'ffmpeg_source',
    'dshow_input',
  ];

  const api = await getApiClient();
  const scenesService = api.getResource<ScenesService>('ScenesService');
  const cs = api.getResource<CustomizationService>('CustomizationService');
  cs.setSettings({ performanceMode: false });
  const meter = getMeter();

  // create sources of different types
  let attempts = ADD_SOURCES_ATTEMPTS;
  while (attempts--) {
    meter.startMeasure('addSources');
    for (let ind = 0; ind < MAX_SOURCES_COUNT; ind++) {
      // create item and insert it into a folder
      const sourceType = sourceTypes[ind % sourceTypes.length];
      scenesService.activeScene.createAndAddSource(sourceType, sourceType as TSourceType);
    }
    meter.stopMeasure('addSources');

    // remove all created sources
    scenesService.activeScene.getNodes().forEach(node => {
      node.remove();
    });

    // give SLOBS some time to unfreeze UI
    await sleep(2000, true);
  }
  t.pass();
});

test('Add and remove items and folders', async t => {
  const api = await getApiClient();
  const scenesService = api.getResource<ScenesService>('ScenesService');
  const meter = getMeter();

  // create and delete a bunch of folders and items
  let attempts = ADD_SOURCES_ATTEMPTS;
  while (attempts--) {
    meter.startMeasure('addNodes');
    let sourcesCount = MAX_SOURCES_COUNT;
    while (sourcesCount--) {
      // create item and insert it into a folder
      const item = scenesService.activeScene.createAndAddSource('color', 'color_source');
      const folder = scenesService.activeScene.createFolder(`folder for ${item.nodeId}`);
      folder.add(item.id);
    }
    meter.stopMeasure('addNodes');

    // remove all created nodes
    meter.startMeasure('removeNodes');
    scenesService.activeScene.getFolders().forEach(node => {
      node.remove();
    });
    meter.stopMeasure('removeNodes');

    // give SLOBS some time to unfreeze UI
    await sleep(2000, true);
  }
  t.pass();
});
