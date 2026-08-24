import { skipCheckingErrorsInLog, test, useWebdriver } from '../helpers/webdriver';
import { getApiClient } from '../helpers/api-client';
import { ScenesService } from '../../app/services/scenes';
import { ScenesService as ExternalScenesService } from '../../app/services/api/external-api/scenes';
import { SceneCollectionsService } from '../../app/services/api/external-api/scene-collections';
import { VideoSettingsService } from '../../app/services/settings-v2/video';
import { StreamingService } from '../../app/services/streaming';
import { sleep } from '../helpers/sleep';
import { startRecording, stopRecording } from '../helpers/modules/streaming';

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
