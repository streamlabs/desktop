import { test, useWebdriver } from '../helpers/webdriver';
import { getApiClient } from '../helpers/api-client';
import { ScenesService } from '../../app/services/scenes';
import { VideoSettingsService } from '../../app/services/settings-v2/video';
import { sleep } from '../helpers/sleep';

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
