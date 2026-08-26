import { skipCheckingErrorsInLog, test, useWebdriver } from '../helpers/webdriver';
import { getApiClient } from '../helpers/api-client';
import { ScenesService } from '../../app/services/scenes';
import { ScenesService as ExternalScenesService } from '../../app/services/api/external-api/scenes';
import { SceneCollectionsService } from '../../app/services/api/external-api/scene-collections';
import { VideoSettingsService } from '../../app/services/settings-v2/video';
import { StreamingService } from '../../app/services/streaming';
import { sleep } from '../helpers/sleep';
import { startRecording, stopRecording } from '../helpers/modules/streaming';
import { focusMain, focusWindow } from '../helpers/modules/core';

const fs = require('fs');
const path = require('path');

interface IPersistedSceneCollection {
  relativeCoordinates: boolean;
  baseResolutions: {
    horizontal: { baseWidth: number; baseHeight: number };
    vertical: { baseWidth: number; baseHeight: number };
  };
  scenes: {
    items: Array<{
      id: string;
      sceneItems: {
        items: Array<{
          id: string;
          x: number;
          y: number;
          scaleX: number;
          scaleY: number;
          display?: string;
          crop: {
            top: number;
            right: number;
            bottom: number;
            left: number;
            referenceWidth?: number;
            referenceHeight?: number;
          };
        }>;
      };
    }>;
  };
}

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

function approximatelyEqual(actual: number, expected: number) {
  return Math.abs(actual - expected) < 0.01;
}

test('Base canvas changes scale only items assigned to that canvas', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const videoSettingsService = client.getResource<VideoSettingsService>('VideoSettingsService');
  const scene = scenesService.createScene('Relative Coordinates Scene');
  const sourceItem = scene.createAndAddSource('Relative Coordinates', 'color_source');
  const verticalItem = scene.addSource(sourceItem.sourceId, {
    display: 'vertical',
    select: false,
  });
  const horizontalItem = sourceItem;
  const originalHorizontal = { ...videoSettingsService.state.horizontal };

  horizontalItem.setTransform({
    position: {
      x: originalHorizontal.baseWidth / 2,
      y: originalHorizontal.baseHeight / 2,
    },
    scale: { x: 1, y: 1 },
  });
  verticalItem.setTransform({
    position: { x: 120, y: 240 },
    scale: { x: 0.75, y: 0.75 },
  });

  const originalVerticalTransform = verticalItem.getModel().transform;
  const targetBaseWidth = Math.max(2, Math.floor(originalHorizontal.baseWidth / 2));
  const targetBaseHeight = Math.max(2, Math.floor(originalHorizontal.baseHeight / 2));
  const loadingWatcher = client.watchForEvents(['AppService.loadingChanged']);
  await sleep(100);

  try {
    await videoSettingsService.setSettings({
      baseWidth: targetBaseWidth,
      baseHeight: targetBaseHeight,
    });
    await sleep(100);

    const resizedHorizontal = horizontalItem.getModel().transform;
    const resizedVertical = verticalItem.getModel().transform;
    t.is(loadingWatcher.receivedEvents.length, 0, 'canvas resizing remains seamless');
    t.true(approximatelyEqual(resizedHorizontal.position.x, targetBaseWidth / 2));
    t.true(approximatelyEqual(resizedHorizontal.position.y, targetBaseHeight / 2));
    t.true(
      approximatelyEqual(
        resizedHorizontal.scale.x,
        targetBaseHeight / originalHorizontal.baseHeight,
      ),
    );
    t.deepEqual(resizedVertical, originalVerticalTransform);

    const transformBeforeOutputChange = horizontalItem.getModel().transform;
    videoSettingsService.setSettings({
      outputWidth: originalHorizontal.outputWidth === 640 ? 644 : 640,
      outputHeight: originalHorizontal.outputHeight === 360 ? 362 : 360,
    });
    await sleep(500);
    t.deepEqual(horizontalItem.getModel().transform, transformBeforeOutputChange);
  } finally {
    await videoSettingsService.setSettings(originalHorizontal);
  }
});

test('Canvas resolutions and transforms survive a scene collection reload', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ExternalScenesService>('ScenesService');
  const sceneCollectionsService = client.getResource<SceneCollectionsService>(
    'SceneCollectionsService',
  );
  const videoSettingsService = client.getResource<VideoSettingsService>('VideoSettingsService');
  const scene = scenesService.createScene('Relative Coordinates Reload Scene');
  const horizontalItem = scene.createAndAddSource('Reload Source', 'color_source');
  const verticalItem = scene.addSource(horizontalItem.sourceId, { display: 'vertical' });
  const originalHorizontal = { ...videoSettingsService.state.horizontal };
  const originalVertical = { ...videoSettingsService.state.vertical };
  const targetHorizontal = {
    baseWidth: Math.max(2, Math.floor(originalHorizontal.baseWidth * 0.75)),
    baseHeight: Math.max(2, Math.floor(originalHorizontal.baseHeight * 0.75)),
  };
  const targetVertical = {
    baseWidth: Math.max(2, Math.floor(originalVertical.baseWidth * 0.8)),
    baseHeight: Math.max(2, Math.floor(originalVertical.baseHeight * 0.8)),
  };

  horizontalItem.setTransform({
    position: { x: originalHorizontal.baseWidth * 0.25, y: originalHorizontal.baseHeight * 0.4 },
    scale: { x: 0.8, y: 1.2 },
  });
  verticalItem.setTransform({
    position: { x: originalVertical.baseWidth * 0.6, y: originalVertical.baseHeight * 0.3 },
    scale: { x: 1.1, y: 0.7 },
  });

  await videoSettingsService.setSettings(targetHorizontal, 'horizontal');
  await videoSettingsService.setSettings(targetVertical, 'vertical');

  const expectedHorizontalTransform = horizontalItem.getModel().transform;
  const expectedVerticalTransform = verticalItem.getModel().transform;
  const collectionId = sceneCollectionsService.activeCollection.id;
  const sceneId = scene.id;
  const horizontalItemId = horizontalItem.sceneItemId;
  const verticalItemId = verticalItem.sceneItemId;

  await sceneCollectionsService.create({ name: 'Relative Coordinates Other Collection' });
  await videoSettingsService.setSettings(
    {
      baseWidth: originalHorizontal.baseWidth,
      baseHeight: originalHorizontal.baseHeight,
    },
    'horizontal',
  );
  await videoSettingsService.setSettings(
    {
      baseWidth: originalVertical.baseWidth,
      baseHeight: originalVertical.baseHeight,
    },
    'vertical',
  );
  t.is(videoSettingsService.state.horizontal.baseWidth, originalHorizontal.baseWidth);
  t.is(videoSettingsService.state.horizontal.baseHeight, originalHorizontal.baseHeight);
  t.is(videoSettingsService.state.vertical.baseWidth, originalVertical.baseWidth);
  t.is(videoSettingsService.state.vertical.baseHeight, originalVertical.baseHeight);

  await sceneCollectionsService.load(collectionId);

  const reloadedScene = scenesService.getScene(sceneId);
  const reloadedHorizontalItem = reloadedScene.getItem(horizontalItemId);
  const reloadedVerticalItem = reloadedScene.getItem(verticalItemId);
  const actualHorizontalTransform = reloadedHorizontalItem.getModel().transform;
  const actualVerticalTransform = reloadedVerticalItem.getModel().transform;

  t.is(videoSettingsService.state.horizontal.baseWidth, targetHorizontal.baseWidth);
  t.is(videoSettingsService.state.horizontal.baseHeight, targetHorizontal.baseHeight);
  t.is(videoSettingsService.state.vertical.baseWidth, targetVertical.baseWidth);
  t.is(videoSettingsService.state.vertical.baseHeight, targetVertical.baseHeight);
  t.is(reloadedHorizontalItem.display, 'horizontal');
  t.is(reloadedVerticalItem.display, 'vertical');
  t.true(
    approximatelyEqual(
      actualHorizontalTransform.position.x,
      expectedHorizontalTransform.position.x,
    ),
  );
  t.true(
    approximatelyEqual(
      actualHorizontalTransform.position.y,
      expectedHorizontalTransform.position.y,
    ),
  );
  t.true(
    approximatelyEqual(actualHorizontalTransform.scale.x, expectedHorizontalTransform.scale.x),
  );
  t.true(
    approximatelyEqual(actualHorizontalTransform.scale.y, expectedHorizontalTransform.scale.y),
  );
  t.true(
    approximatelyEqual(actualVerticalTransform.position.x, expectedVerticalTransform.position.x),
  );
  t.true(
    approximatelyEqual(actualVerticalTransform.position.y, expectedVerticalTransform.position.y),
  );
  t.true(approximatelyEqual(actualVerticalTransform.scale.x, expectedVerticalTransform.scale.x));
  t.true(approximatelyEqual(actualVerticalTransform.scale.y, expectedVerticalTransform.scale.y));
});

test('Canvas resizing is rejected while recording and succeeds after recording stops', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const videoSettingsService = client.getResource<VideoSettingsService>('VideoSettingsService');
  const streamingService = client.getResource<StreamingService>('StreamingService');
  const scene = scenesService.createScene('Relative Coordinates Recording Scene');
  const item = scene.createAndAddSource('Recording Source', 'color_source');
  const originalVideo = { ...videoSettingsService.state.horizontal };
  const targetVideo = {
    baseWidth: Math.max(2, Math.floor(originalVideo.baseWidth * 0.75)),
    baseHeight: Math.max(2, Math.floor(originalVideo.baseHeight * 0.75)),
  };

  item.setTransform({
    position: { x: originalVideo.baseWidth / 3, y: originalVideo.baseHeight / 3 },
    scale: { x: 1, y: 1 },
  });
  const originalTransform = item.getModel().transform;

  await startRecording();
  try {
    // The service logs rejected legacy fire-and-forget updates in addition to
    // rejecting the returned promise, so this expected error is handled here.
    skipCheckingErrorsInLog();
    const loadingWatcher = client.watchForEvents(['AppService.loadingChanged']);
    await sleep(100);

    let rejection: { error?: string } | undefined;
    try {
      await Promise.resolve(videoSettingsService.setSettings(targetVideo, 'horizontal'));
    } catch (error: unknown) {
      rejection = error as { error?: string };
    }
    await sleep(100);

    t.regex(rejection?.error ?? '', /cannot change while a video output is active/i);
    t.is(videoSettingsService.state.horizontal.baseWidth, originalVideo.baseWidth);
    t.is(videoSettingsService.state.horizontal.baseHeight, originalVideo.baseHeight);
    t.deepEqual(item.getModel().transform, originalTransform);
    t.is(loadingWatcher.receivedEvents.length, 0, 'rejected resizing remains seamless');
  } finally {
    await stopRecording();
  }

  for (let attempt = 0; attempt < 100 && streamingService.isRecording; attempt++) {
    await sleep(50);
  }
  t.false(streamingService.isRecording, 'recording reaches the offline state');

  await videoSettingsService.setSettings(targetVideo, 'horizontal');

  const resizedTransform = item.getModel().transform;
  const resizeFactor = targetVideo.baseHeight / originalVideo.baseHeight;
  t.is(videoSettingsService.state.horizontal.baseWidth, targetVideo.baseWidth);
  t.is(videoSettingsService.state.horizontal.baseHeight, targetVideo.baseHeight);
  t.true(
    approximatelyEqual(resizedTransform.position.x, originalTransform.position.x * resizeFactor),
  );
  t.true(
    approximatelyEqual(resizedTransform.position.y, originalTransform.position.y * resizeFactor),
  );
});

test('Collection switching with different base resolutions is rejected while recording', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ExternalScenesService>('ScenesService');
  const sceneCollectionsService = client.getResource<SceneCollectionsService>(
    'SceneCollectionsService',
  );
  const videoSettingsService = client.getResource<VideoSettingsService>('VideoSettingsService');
  const streamingService = client.getResource<StreamingService>('StreamingService');
  const currentCollectionId = sceneCollectionsService.activeCollection.id;
  const originalVideo = { ...videoSettingsService.state.horizontal };
  const currentScene = scenesService.createScene('Recording Collection Preflight Scene');
  const currentItem = currentScene.createAndAddSource(
    'Recording Collection Preflight Source',
    'color_source',
  );
  const targetVideo = {
    baseWidth: Math.max(2, Math.floor(originalVideo.baseWidth * 0.75)),
    baseHeight: Math.max(2, Math.floor(originalVideo.baseHeight * 0.75)),
  };

  currentItem.setTransform({
    position: { x: originalVideo.baseWidth * 0.35, y: originalVideo.baseHeight * 0.45 },
    scale: { x: 0.8, y: 1.1 },
  });
  const currentSceneId = currentScene.id;
  const currentItemId = currentItem.sceneItemId;

  const targetCollection = await sceneCollectionsService.create({
    name: 'Different Resolution Recording Target',
  });
  await sceneCollectionsService.load(currentCollectionId);

  // Build the target fixture through Desktop's managed file cache so setup
  // does not need an otherwise unrelated live canvas reset and switch back.
  const targetCollectionPath = path.join(
    t.context.cacheDir,
    'slobs-client',
    'SceneCollections',
    `${targetCollection.id}.json`,
  );
  t.true(await focusWindow('worker'), 'worker window is available');
  await t.context.app.client.execute(`
    (() => {
      const fileManager = window.servicesManager.getResource('FileManagerService');
      const collectionPath = ${JSON.stringify(targetCollectionPath)};
      const targetVideo = ${JSON.stringify(targetVideo)};
      const collection = JSON.parse(fileManager.read(collectionPath, { validateJSON: true }));

      collection.baseResolution = { ...collection.baseResolution, ...targetVideo };
      collection.baseResolutions.horizontal = {
        ...collection.baseResolutions.horizontal,
        ...targetVideo,
      };
      fileManager.write(collectionPath, JSON.stringify(collection, null, 2));
    })();
    0;
  `);
  await focusMain();

  const reloadedScene = scenesService.getScene(currentSceneId);
  const reloadedItem = reloadedScene.getItem(currentItemId);
  const expectedSceneNames = scenesService.getSceneNames();
  const expectedActiveSceneId = scenesService.activeSceneId;
  const expectedTransform = reloadedItem.getModel().transform;
  const expectedSourceId = reloadedItem.sourceId;

  t.deepEqual(videoSettingsService.state.horizontal, originalVideo);

  await startRecording();
  try {
    // This rejection is expected and may be logged by the RPC promise handler.
    skipCheckingErrorsInLog();
    const switchWatcher = client.watchForEvents([
      'SceneCollectionsService.collectionWillSwitch',
      'SceneCollectionsService.collectionSwitched',
    ]);
    await sleep(100);

    let rejection: { error?: string } | undefined;
    try {
      await sceneCollectionsService.load(targetCollection.id);
    } catch (error: unknown) {
      rejection = error as { error?: string };
    }
    await sleep(100);

    t.regex(rejection?.error ?? '', /different base canvas resolution/i);
    t.true(streamingService.isRecording);
    t.is(sceneCollectionsService.activeCollection.id, currentCollectionId);
    t.is(scenesService.activeSceneId, expectedActiveSceneId);
    t.deepEqual(scenesService.getSceneNames(), expectedSceneNames);
    t.is(switchWatcher.receivedEvents.length, 0, 'scene graph teardown never begins');

    const preservedScene = scenesService.getScene(currentSceneId);
    const preservedItem = preservedScene.getItem(currentItemId);
    t.is(preservedItem.sourceId, expectedSourceId);
    t.deepEqual(preservedItem.getModel().transform, expectedTransform);
    t.deepEqual(videoSettingsService.state.horizontal, originalVideo);
  } finally {
    await stopRecording();
  }

  for (let attempt = 0; attempt < 100 && streamingService.isRecording; attempt++) {
    await sleep(50);
  }
  t.false(streamingService.isRecording, 'recording reaches the offline state');
});

test('Rapid canvas width and height updates are applied as one coherent resize', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const videoSettingsService = client.getResource<VideoSettingsService>('VideoSettingsService');
  const scene = scenesService.createScene('Relative Coordinates Debounce Scene');
  const item = scene.createAndAddSource('Debounce Source', 'color_source');
  const originalVideo = { ...videoSettingsService.state.horizontal };
  const targetBaseWidth = Math.max(2, Math.floor(originalVideo.baseWidth * 0.75));
  const targetBaseHeight = Math.max(2, Math.floor(originalVideo.baseHeight * 0.75));
  const loadingWatcher = client.watchForEvents(['AppService.loadingChanged']);

  item.setTransform({
    position: { x: originalVideo.baseWidth / 2, y: originalVideo.baseHeight / 2 },
    scale: { x: 1, y: 1 },
  });
  await sleep(100);

  const widthUpdate = Promise.resolve(
    videoSettingsService.setVideoSetting('baseWidth', targetBaseWidth, 'horizontal'),
  );
  const heightUpdate = Promise.resolve(
    videoSettingsService.setVideoSetting('baseHeight', targetBaseHeight, 'horizontal'),
  );
  await Promise.all([widthUpdate, heightUpdate]);
  await sleep(100);

  const resizedTransform = item.getModel().transform;
  const resizeFactor = targetBaseHeight / originalVideo.baseHeight;
  t.is(videoSettingsService.state.horizontal.baseWidth, targetBaseWidth);
  t.is(videoSettingsService.state.horizontal.baseHeight, targetBaseHeight);
  t.true(approximatelyEqual(resizedTransform.position.x, targetBaseWidth / 2));
  t.true(approximatelyEqual(resizedTransform.position.y, targetBaseHeight / 2));
  t.true(approximatelyEqual(resizedTransform.scale.x, resizeFactor));
  t.true(approximatelyEqual(resizedTransform.scale.y, resizeFactor));
  t.is(loadingWatcher.receivedEvents.length, 0, 'debounced resizing remains seamless');
});

test('A persistence failure rolls back the canvas resolution and scene transforms', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const sceneCollectionsService = client.getResource<SceneCollectionsService>(
    'SceneCollectionsService',
  );
  const videoSettingsService = client.getResource<VideoSettingsService>('VideoSettingsService');
  const scene = scenesService.createScene('Relative Coordinates Rollback Scene');
  const item = scene.createAndAddSource('Rollback Source', 'color_source');
  const originalVideo = { ...videoSettingsService.state.horizontal };
  const targetVideo = {
    baseWidth: Math.max(2, Math.floor(originalVideo.baseWidth * 0.75)),
    baseHeight: Math.max(2, Math.floor(originalVideo.baseHeight * 0.75)),
  };

  item.setTransform({
    position: { x: originalVideo.baseWidth * 0.4, y: originalVideo.baseHeight * 0.3 },
    scale: { x: 0.8, y: 1.1 },
  });
  const originalTransform = item.getModel().transform;

  t.true(await focusWindow('worker'), 'worker window is available');
  await t.context.app.client.execute(`
    (() => {
      const fileManager = window.servicesManager.getResource('FileManagerService');
      const originalFlushAll = fileManager.flushAll;
      let shouldFail = true;

      window.__restoreRelativeCoordinatesFlushAll = () => {
        fileManager.flushAll = originalFlushAll;
        delete window.__restoreRelativeCoordinatesFlushAll;
      };
      fileManager.flushAll = function(...args) {
        if (shouldFail) {
          shouldFail = false;
          return Promise.reject(new Error('Injected canvas persistence failure'));
        }
        return originalFlushAll.apply(this, args);
      };
    })();
    0;
  `);
  await focusMain();

  skipCheckingErrorsInLog();
  let rejection: { error?: string } | undefined;
  try {
    await Promise.resolve(videoSettingsService.setSettings(targetVideo, 'horizontal'));
  } catch (error: unknown) {
    rejection = error as { error?: string };
  } finally {
    await focusWindow('worker');
    await t.context.app.client.execute(`
      if (window.__restoreRelativeCoordinatesFlushAll) {
        window.__restoreRelativeCoordinatesFlushAll();
      }
      0;
    `);
    await focusMain();
  }

  t.regex(rejection?.error ?? '', /Injected canvas persistence failure/);
  t.deepEqual(videoSettingsService.state.horizontal, originalVideo);
  const rolledBackTransform = item.getModel().transform;
  t.true(approximatelyEqual(rolledBackTransform.position.x, originalTransform.position.x));
  t.true(approximatelyEqual(rolledBackTransform.position.y, originalTransform.position.y));
  t.true(approximatelyEqual(rolledBackTransform.scale.x, originalTransform.scale.x));
  t.true(approximatelyEqual(rolledBackTransform.scale.y, originalTransform.scale.y));
  t.deepEqual(rolledBackTransform.crop, originalTransform.crop);
  t.is(rolledBackTransform.rotation, originalTransform.rotation);

  const collectionPath = path.join(
    t.context.cacheDir,
    'slobs-client',
    'SceneCollections',
    `${sceneCollectionsService.activeCollection.id}.json`,
  );
  const persisted = JSON.parse(
    fs.readFileSync(collectionPath).toString(),
  ) as IPersistedSceneCollection;
  const persistedScene = persisted.scenes.items.find(candidate => candidate.id === scene.id);
  const persistedItem = persistedScene?.sceneItems.items.find(
    candidate => candidate.id === item.id,
  );

  t.true(persisted.relativeCoordinates);
  t.deepEqual(persisted.baseResolutions.horizontal, {
    baseWidth: originalVideo.baseWidth,
    baseHeight: originalVideo.baseHeight,
  });
  t.truthy(persistedScene);
  t.truthy(persistedItem);
  t.true(approximatelyEqual(persistedItem!.x, originalTransform.position.x));
  t.true(approximatelyEqual(persistedItem!.y, originalTransform.position.y));
  t.true(approximatelyEqual(persistedItem!.scaleX, originalTransform.scale.x));
  t.true(approximatelyEqual(persistedItem!.scaleY, originalTransform.scale.y));
  t.is(persistedItem!.display, 'horizontal');

  await videoSettingsService.setSettings(targetVideo, 'horizontal');

  const resizedTransform = item.getModel().transform;
  const resizeFactor = targetVideo.baseHeight / originalVideo.baseHeight;
  t.is(videoSettingsService.state.horizontal.baseWidth, targetVideo.baseWidth);
  t.is(videoSettingsService.state.horizontal.baseHeight, targetVideo.baseHeight);
  t.true(
    approximatelyEqual(resizedTransform.position.x, originalTransform.position.x * resizeFactor),
  );
  t.true(
    approximatelyEqual(resizedTransform.position.y, originalTransform.position.y * resizeFactor),
  );
});

test('Nested-scene crop references survive Desktop save, reload, and canvas resize', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ExternalScenesService>('ScenesService');
  const sceneCollectionsService = client.getResource<SceneCollectionsService>(
    'SceneCollectionsService',
  );
  const videoSettingsService = client.getResource<VideoSettingsService>('VideoSettingsService');
  const outerScene = scenesService.createScene('Relative Coordinates Crop Outer Scene');
  const nestedScene = scenesService.createScene('Relative Coordinates Crop Nested Scene');
  nestedScene.createAndAddSource('Nested Content', 'color_source');
  const nestedItem = outerScene.addSource(nestedScene.id, { display: 'vertical' });
  const originalVertical = { ...videoSettingsService.state.vertical };
  const firstResize = {
    baseWidth: Math.max(2, Math.floor(originalVertical.baseWidth * 1.25)),
    baseHeight: Math.max(2, Math.floor(originalVertical.baseHeight * 1.25)),
  };
  const secondResize = {
    baseWidth: Math.max(2, Math.floor(originalVertical.baseWidth * 1.5)),
    baseHeight: Math.max(2, Math.floor(originalVertical.baseHeight * 1.5)),
  };
  const authoredCrop = { top: 24, right: 36, bottom: 48, left: 12 };

  nestedItem.setTransform({
    position: { x: originalVertical.baseWidth * 0.2, y: originalVertical.baseHeight * 0.3 },
    scale: { x: 1, y: 1 },
    crop: authoredCrop,
  });
  t.deepEqual(nestedItem.getModel().transform.crop, authoredCrop);

  const collectionPath = path.join(
    t.context.cacheDir,
    'slobs-client',
    'SceneCollections',
    `${sceneCollectionsService.activeCollection.id}.json`,
  );
  const readPersistedItem = () => {
    const persisted = JSON.parse(
      fs.readFileSync(collectionPath).toString(),
    ) as IPersistedSceneCollection;
    const persistedScene = persisted.scenes.items.find(candidate => candidate.id === outerScene.id);
    const persistedItem = persistedScene?.sceneItems.items.find(
      candidate => candidate.id === nestedItem.id,
    );
    return { persisted, persistedItem };
  };

  await videoSettingsService.setSettings(firstResize, 'vertical');

  const firstSave = readPersistedItem();
  t.truthy(firstSave.persistedItem);
  t.deepEqual(firstSave.persistedItem!.crop, {
    ...authoredCrop,
    referenceWidth: originalVertical.baseWidth,
    referenceHeight: originalVertical.baseHeight,
  });

  const outerSceneId = outerScene.id;
  const nestedItemId = nestedItem.id;
  await sceneCollectionsService.load(sceneCollectionsService.activeCollection.id);

  const reloadedOuterScene = scenesService.getScene(outerSceneId);
  const reloadedNestedItem = reloadedOuterScene.getItem(nestedItemId);
  t.is(reloadedNestedItem.display, 'vertical');
  t.deepEqual(reloadedNestedItem.getModel().transform.crop, authoredCrop);

  await videoSettingsService.setSettings(secondResize, 'vertical');

  const secondSave = readPersistedItem();
  t.deepEqual(secondSave.persisted.baseResolutions.vertical, secondResize);
  t.truthy(secondSave.persistedItem);
  t.deepEqual(secondSave.persistedItem!.crop, {
    ...authoredCrop,
    referenceWidth: originalVertical.baseWidth,
    referenceHeight: originalVertical.baseHeight,
  });
  t.deepEqual(reloadedNestedItem.getModel().transform.crop, authoredCrop);
});
