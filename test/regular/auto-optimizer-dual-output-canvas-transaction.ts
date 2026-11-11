import { skipCheckingErrorsInLog, test, useWebdriver } from '../helpers/webdriver';
import { getApiClient } from '../helpers/api-client';
import { VideoSettingsService } from '../../app/services/settings-v2/video';
import { focusMain, focusWindow } from '../helpers/modules/core';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('accepted custom and standard outputs keep their exact native dimensions on an ultrawide canvas', async t => {
  const client = await getApiClient();
  const video = client.getResource<VideoSettingsService>('VideoSettingsService');
  const horizontal = { ...video.state.horizontal };
  try {
    for (const outputHeight of [802, 1080]) {
      await video.applyAutoOptimizerSettings({
        horizontal: { baseWidth: 3440, baseHeight: 1440, outputWidth: 1920, outputHeight },
      });
      t.is(video.state.horizontal.baseWidth, 3440);
      t.is(video.state.horizontal.baseHeight, 1440);
      t.is(video.state.horizontal.outputWidth, 1920);
      t.is(video.state.horizontal.outputHeight, outputHeight);
      t.true(await focusWindow('worker'));
      const native = await t.context.app.client.execute(() => {
        return (window as any).servicesManager.getResource('VideoSettingsService').contexts
          .horizontal.video;
      });
      t.is(native.outputWidth, 1920);
      t.is(native.outputHeight, outputHeight);
      await focusMain();
    }
  } finally {
    await video.applyAutoOptimizerSettings({ horizontal });
    await focusMain();
  }
});

test('a vertical apply failure rolls back both Auto Optimizer canvas patches', async t => {
  const client = await getApiClient();
  const videoSettingsService = client.getResource<VideoSettingsService>('VideoSettingsService');
  const originalHorizontal = { ...videoSettingsService.state.horizontal };
  const originalVertical = { ...videoSettingsService.state.vertical };
  const even = (value: number) => Math.max(2, Math.floor(value / 2) * 2);
  const horizontalScale = Math.min(0.9, 960 / originalHorizontal.baseWidth);
  const verticalScale = Math.min(0.9, 960 / originalVertical.baseHeight);
  const horizontal = {
    baseWidth: even(originalHorizontal.baseWidth * horizontalScale),
    baseHeight: even(originalHorizontal.baseHeight * horizontalScale),
    outputWidth: even(originalHorizontal.outputWidth * horizontalScale),
    outputHeight: even(originalHorizontal.outputHeight * horizontalScale),
    fpsNum: originalHorizontal.fpsNum === 30 ? 60 : 30,
    fpsDen: 1,
  };
  const vertical = {
    baseWidth: even(originalVertical.baseWidth * verticalScale),
    baseHeight: even(originalVertical.baseHeight * verticalScale),
    outputWidth: even(originalVertical.outputWidth * verticalScale),
    outputHeight: even(originalVertical.outputHeight * verticalScale),
    fpsNum: horizontal.fpsNum,
    fpsDen: horizontal.fpsDen,
  };

  t.true(await focusWindow('worker'), 'worker window is available');
  await t.context.app.client.execute(`
    (() => {
      const video = window.servicesManager.getResource('VideoSettingsService');
      const dualOutput = video.dualOutputService;
      const originalUpdate = dualOutput.updateVideoSettings;
      let shouldFail = true;

      window.__restoreAutoOptimizerDualOutputUpdateVideoSettings = () => {
        dualOutput.updateVideoSettings = originalUpdate;
        delete window.__restoreAutoOptimizerDualOutputUpdateVideoSettings;
      };
      dualOutput.updateVideoSettings = function(settings, display) {
        if (display === 'vertical' && shouldFail) {
          shouldFail = false;
          throw new Error('Injected vertical Auto Optimizer apply failure');
        }
        return originalUpdate.call(this, settings, display);
      };
    })();
    0;
  `);
  await focusMain();

  skipCheckingErrorsInLog();
  let rejection: { error?: string } | undefined;
  try {
    await videoSettingsService.applyAutoOptimizerSettings({ horizontal, vertical });
  } catch (error: unknown) {
    rejection = error as { error?: string };
  } finally {
    await focusWindow('worker');
    await t.context.app.client.execute(`
      if (window.__restoreAutoOptimizerDualOutputUpdateVideoSettings) {
        window.__restoreAutoOptimizerDualOutputUpdateVideoSettings();
      }
      0;
    `);
    await focusMain();
  }

  t.regex(rejection?.error ?? '', /Injected vertical Auto Optimizer apply failure/);
  t.deepEqual(videoSettingsService.state.horizontal, originalHorizontal);
  t.deepEqual(videoSettingsService.state.vertical, originalVertical);
});
