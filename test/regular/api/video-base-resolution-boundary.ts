import { IVideoInfo } from '../../../obs-api';
import { ScenesService } from '../../../app/services/api/external-api/scenes';
import { SceneCollectionsService } from 'services/scene-collections';
import { OutputSettingsService, TOutputSettingsMode } from 'services/settings/output';
import { VideoSettingsService } from 'services/settings-v2/video';
import { getApiClient } from '../../helpers/api-client';
import { clickButton } from '../../helpers/modules/core';
import { useForm } from '../../helpers/modules/forms';
import { ListInputController } from '../../helpers/modules/forms/list';
import { showSettingsWindow } from '../../helpers/modules/settings/settings';
import { test, useWebdriver } from '../../helpers/webdriver';

useWebdriver();

interface IRuntimeVideoSettingsApi {
  updateVideoSettings(settings: Partial<IVideoInfo>): Promise<void>;
  setVideoSetting(key: keyof IVideoInfo, value: number): Promise<void>;
  setVideoSettings(
    display: 'horizontal' | 'vertical',
    settings: { key: keyof IVideoInfo; value: number }[],
  ): Promise<void>;
  setSettings(settings: Partial<IVideoInfo>): Promise<void>;
}

interface IRuntimeOutputSettingsApi {
  setSettings(settings: { mode: TOutputSettingsMode; inputResolution: string }): Promise<void>;
}

function messageFromRejectedApiCall(error: unknown): string {
  if (error instanceof Error) return error.message;
  const serialized = error as { error?: string; message?: string } | undefined;
  return String(serialized?.error ?? serialized?.message ?? error);
}

test('generic video setters reject base dimensions before mutating any settings', async t => {
  const client = await getApiClient();
  const videoSettings = client.getResource<VideoSettingsService>('VideoSettingsService');
  const runtimeApi = (videoSettings as unknown) as IRuntimeVideoSettingsApi;
  const originalBase = videoSettings.baseResolutions.horizontal;
  const originalOutput = videoSettings.outputResolutions.horizontal;
  const originalFps = videoSettings.values.horizontal.fpsNum;
  const differentBaseWidth = originalBase.baseWidth === 1280 ? 1920 : 1280;
  const differentOutputWidth = originalOutput.outputWidth === 960 ? 1280 : 960;

  const operations = [
    () => runtimeApi.updateVideoSettings({ baseWidth: differentBaseWidth }),
    () =>
      runtimeApi.setSettings({
        outputWidth: differentOutputWidth,
        baseWidth: differentBaseWidth,
        baseHeight: originalBase.baseHeight,
      }),
    () => runtimeApi.setVideoSetting('baseWidth', differentBaseWidth),
    () =>
      runtimeApi.setVideoSettings('horizontal', [
        { key: 'fpsNum', value: originalFps === 30 ? 60 : 30 },
        { key: 'baseHeight', value: originalBase.baseHeight === 720 ? 1080 : 720 },
      ]),
  ];

  for (const operation of operations) {
    let error: unknown;
    try {
      await operation();
    } catch (operationError: unknown) {
      error = operationError;
    }

    t.regex(messageFromRejectedApiCall(error), /SceneCollectionsService\.resizeBaseCanvas/);
    t.deepEqual(videoSettings.baseResolutions.horizontal, originalBase);
    t.deepEqual(videoSettings.outputResolutions.horizontal, originalOutput);
    t.is(videoSettings.values.horizontal.fpsNum, originalFps);
  }

  const outputSettings = client.getResource<OutputSettingsService>('OutputSettingsService');
  const runtimeOutputApi = (outputSettings as unknown) as IRuntimeOutputSettingsApi;
  const originalMode = outputSettings.getSettings().mode;
  const differentMode: TOutputSettingsMode = originalMode === 'Advanced' ? 'Simple' : 'Advanced';
  let outputError: unknown;
  try {
    await runtimeOutputApi.setSettings({
      mode: differentMode,
      inputResolution: `${differentBaseWidth}x${originalBase.baseHeight}`,
    });
  } catch (operationError: unknown) {
    outputError = operationError;
  }

  t.regex(messageFromRejectedApiCall(outputError), /SceneCollectionsService\.resizeBaseCanvas/);
  t.is(outputSettings.getSettings().mode, originalMode);
});

test('an orientation-flipping output preset routes its mixed patch through the resize transaction', async t => {
  const client = await getApiClient();
  const collections = client.getResource<SceneCollectionsService>('SceneCollectionsService');
  const videoSettings = client.getResource<VideoSettingsService>('VideoSettingsService');
  const scenes = client.getResource<ScenesService>('ScenesService');

  await collections.resizeBaseCanvas({
    baseWidth: 1280,
    baseHeight: 720,
    outputWidth: 1280,
    outputHeight: 720,
  });

  const item = scenes.activeScene.createAndAddSource('Canvas resize marker', 'color_source');
  item.setTransform({ position: { x: 640, y: 360 } });

  await showSettingsWindow('Video', async () => {
    const { fillForm } = useForm('video-settings');
    await fillForm({
      outputRes: async (input: ListInputController<string>) => {
        await input.open();
        await input.waitForLoading();
        // The vertical presets are below Ant's virtualized viewport.
        await t.context.app.client.execute(() => {
          const holder = document.querySelector(
            '.ant-select-dropdown .rc-virtual-list-holder',
          ) as HTMLElement | null;
          if (!holder) return;
          holder.scrollTop = holder.scrollHeight;
          holder.dispatchEvent(new Event('scroll', { bubbles: true }));
        });
        await t.context.app.client.pause(100);
        const selected = await t.context.app.client.execute(() => {
          const options = Array.from(
            document.querySelectorAll('.ant-select-dropdown [data-option-value="720x1280"]'),
          ) as HTMLElement[];
          const option = options.find(element => element.offsetParent !== null) ?? options[0];
          option?.click();
          return !!option;
        });
        if (!selected) throw new Error('The 720x1280 output preset was not rendered');
      },
    });
    await clickButton('Close');
  });
  try {
    await t.context.app.client.waitUntil(
      () => {
        const resolution = videoSettings.baseResolutions.horizontal;
        return resolution.baseWidth === 720 && resolution.baseHeight === 1280;
      },
      {
        timeout: 10000,
        interval: 100,
      },
    );
  } catch (error: unknown) {
    throw new Error(
      `The mixed output/base patch did not complete its canvas resize transaction: ${JSON.stringify(
        {
          base: videoSettings.baseResolutions.horizontal,
          output: videoSettings.outputResolutions.horizontal,
        },
      )}`,
    );
  }

  t.deepEqual(videoSettings.outputResolutions.horizontal, {
    outputWidth: 720,
    outputHeight: 1280,
  });
  const position = item.getModel().transform.position;
  t.true(Math.abs(position.x - 360) < 0.01);
  t.true(Math.abs(position.y - 640) < 0.01);
});
