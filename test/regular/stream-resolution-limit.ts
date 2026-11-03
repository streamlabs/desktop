import { skipCheckingErrorsInLog, test, useWebdriver } from '../helpers/webdriver';
import { getApiClient } from '../helpers/api-client';
import { VideoSettingsService } from '../../app/services/settings-v2/video';
import { SettingsService } from '../../app/services/settings';
import { OutputSettingsService } from '../../app/services/settings/output';
import { focusMain, focusWindow } from '../helpers/modules/core';

// not a React hook
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
      await video.limitStreamOutputs(['twitch', 'youtube'], false);
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

test('only selections containing other platforms lower live outputs without resizing authored canvases', async t => {
  const client = await getApiClient();
  const video = client.getResource<VideoSettingsService>('VideoSettingsService');
  const horizontal = { ...video.state.horizontal };
  const vertical = { ...video.state.vertical };
  try {
    await video.applyAutoOptimizerSettings({
      horizontal: { baseWidth: 3840, baseHeight: 2160, outputWidth: 2560, outputHeight: 1440 },
      vertical: { baseWidth: 2160, baseHeight: 3840, outputWidth: 1440, outputHeight: 2560 },
    });
    for (const platforms of [['twitch', 'twitch'], ['youtube'], ['twitch', 'youtube']]) {
      t.deepEqual(await video.limitStreamOutputs(platforms, true), {
        resolutionChanged: false,
        bitrateChanged: false,
      });
    }
    t.is(video.state.horizontal.outputWidth, 2560);
    t.true((await video.limitStreamOutputs(['twitch', 'youtube', 'kick'], true)).resolutionChanged);
    t.is(video.state.horizontal.outputWidth, 1920);
    t.is(video.state.horizontal.outputHeight, 1080);
    t.is(video.state.vertical.outputWidth, 1080);
    t.is(video.state.vertical.outputHeight, 1920);
    t.is(video.state.horizontal.baseWidth, 3840);
    t.is(video.state.vertical.baseHeight, 3840);
    t.is(video.state.horizontal.fpsNum, horizontal.fpsNum);
    t.is(video.state.horizontal.fpsDen, horizontal.fpsDen);
    t.deepEqual(await video.limitStreamOutputs(['youtube'], true), {
      resolutionChanged: false,
      bitrateChanged: false,
    });
    t.is(
      video.state.horizontal.outputWidth,
      1920,
      'removing a platform does not upscale saved settings',
    );
  } finally {
    await video.applyAutoOptimizerSettings({ horizontal, vertical });
  }
});

test('Advanced encoder rescaling preserves Twitch/YouTube sizes and caps other platforms', async t => {
  const client = await getApiClient();
  const video = client.getResource<VideoSettingsService>('VideoSettingsService');
  const settings = client.getResource<SettingsService>('SettingsService');
  const output = client.getResource<OutputSettingsService>('OutputSettingsService');
  const originalOutput = JSON.parse(JSON.stringify(settings.state.Output.formData));
  const horizontal = { ...video.state.horizontal };
  try {
    await video.applyAutoOptimizerSettings({
      horizontal: { outputWidth: 1280, outputHeight: 720 },
    });
    await output.setSettings({ mode: 'Advanced', streaming: { rescaleOutput: true } });
    await settings.setSettingValue('Output', 'RescaleRes', '3840x2160');
    for (const platforms of [['youtube'], ['twitch', 'youtube']]) {
      t.deepEqual(await video.limitStreamOutputs(platforms, false), {
        resolutionChanged: false,
        bitrateChanged: false,
      });
      t.is((await output.getSettings()).streaming.outputResolution, '3840x2160');
    }
    t.true((await video.limitStreamOutputs(['youtube', 'facebook'], false)).resolutionChanged);
    const rescale = settings.state.Output.formData
      .find(group => group.nameSubCategory === 'Streaming')!
      .parameters.find(parameter => parameter.name === 'RescaleRes');
    t.is(rescale!.value, '1920x1080');
    t.is(video.state.horizontal.outputWidth, 1280, 'a smaller output is not upscaled');
    t.is(video.state.horizontal.baseWidth, horizontal.baseWidth);
  } finally {
    await settings.setSettings('Output', originalOutput);
    await settings.setSettings('Output', originalOutput);
    await video.applyAutoOptimizerSettings({ horizontal });
  }
});

for (const mode of ['Simple', 'Advanced'] as const) {
  test(`${mode} multistreaming caps bitrate even when resolution is already within 1080p`, async t => {
    const client = await getApiClient();
    const video = client.getResource<VideoSettingsService>('VideoSettingsService');
    const settings = client.getResource<SettingsService>('SettingsService');
    const output = client.getResource<OutputSettingsService>('OutputSettingsService');
    const originalOutput = JSON.parse(JSON.stringify(settings.state.Output.formData));
    const horizontal = { ...video.state.horizontal };
    try {
      await video.applyAutoOptimizerSettings({
        horizontal: { outputWidth: 1920, outputHeight: 1080 },
      });
      await output.setSettings({ mode, streaming: { bitrate: 8000 } });
      for (const platforms of [['twitch', 'twitch'], ['youtube'], ['twitch', 'youtube']]) {
        t.deepEqual(await video.limitStreamOutputs(platforms, false), {
          resolutionChanged: false,
          bitrateChanged: false,
        });
      }
      t.is((await output.getSettings()).streaming.bitrate, 8000);
      t.deepEqual(await video.limitStreamOutputs(['twitch', 'youtube', 'kick'], false), {
        resolutionChanged: false,
        bitrateChanged: true,
      });
      t.is((await output.getSettings()).streaming.bitrate, 6000);
      t.deepEqual(await video.limitStreamOutputs(['twitch', 'youtube', 'kick'], false), {
        resolutionChanged: false,
        bitrateChanged: false,
      });
      await output.setSettings({ streaming: { bitrate: 4500 } });
      t.deepEqual(await video.limitStreamOutputs(['twitch', 'kick'], false), {
        resolutionChanged: false,
        bitrateChanged: false,
      });
      t.is((await output.getSettings()).streaming.bitrate, 4500);
    } finally {
      await settings.setSettings('Output', originalOutput);
      await settings.setSettings('Output', originalOutput);
      await video.applyAutoOptimizerSettings({ horizontal });
    }
  });
}

test('a bitrate write failure rolls back the bitrate and both scaled outputs', async t => {
  const client = await getApiClient();
  const video = client.getResource<VideoSettingsService>('VideoSettingsService');
  const settings = client.getResource<SettingsService>('SettingsService');
  const output = client.getResource<OutputSettingsService>('OutputSettingsService');
  const originalOutput = JSON.parse(JSON.stringify(settings.state.Output.formData));
  const horizontal = { ...video.state.horizontal };
  const vertical = { ...video.state.vertical };
  try {
    await video.applyAutoOptimizerSettings({
      horizontal: { outputWidth: 2560, outputHeight: 1440 },
      vertical: { outputWidth: 1440, outputHeight: 2560 },
    });
    await output.setSettings({
      mode: 'Advanced',
      streaming: { bitrate: 8000, rescaleOutput: true },
    });
    await settings.setSettingValue('Output', 'RescaleRes', '2560x1440');
    await focusWindow('worker');
    await t.context.app.client.execute(`
      const output = window.servicesManager.getResource('OutputSettingsService');
      const original = output.setSettings;
      let shouldFail = true;
      window.__restoreBitrateSetter = () => {
        output.setSettings = original;
        delete window.__restoreBitrateSetter;
      };
      output.setSettings = function(patch) {
        const result = original.call(this, patch);
        if (patch.streaming?.bitrate === 6000 && shouldFail) {
          shouldFail = false;
          throw new Error('Injected bitrate limit write failure');
        }
        return result;
      };
      return 0;
    `);
    await focusMain();
    skipCheckingErrorsInLog();
    let rejection: { error?: string } | undefined;
    try {
      await video.limitStreamOutputs(['twitch', 'youtube', 'kick'], true);
    } catch (error: unknown) {
      rejection = error as { error?: string };
    }
    t.regex(rejection?.error ?? '', /Injected bitrate limit write failure/);
    t.is((await output.getSettings()).streaming.bitrate, 8000);
    t.is((await output.getSettings()).streaming.outputResolution, '2560x1440');
    t.is(video.state.horizontal.outputWidth, 2560);
    t.is(video.state.vertical.outputHeight, 2560);
    t.is(video.state.horizontal.baseWidth, horizontal.baseWidth);
    t.is(video.state.vertical.baseHeight, vertical.baseHeight);
  } finally {
    await focusWindow('worker');
    await t.context.app.client.execute('window.__restoreBitrateSetter?.(); return 0;');
    await focusMain();
    await settings.setSettings('Output', originalOutput);
    await settings.setSettings('Output', originalOutput);
    await video.applyAutoOptimizerSettings({ horizontal, vertical });
  }
});

test('missing Go Live settings skip output limits without flushing pending video edits', async t => {
  t.true(await focusWindow('worker'));
  try {
    const results = (await t.context.app.client.executeAsync(done => {
      const service = (window as any).servicesManager.getResource('StreamSettingsService');
      const apply = Object.getPrototypeOf(service).applyStreamOutputLimits;
      Promise.all(
        ([undefined, null] as (undefined | null)[]).map(goLiveSettings => {
          const calls: string[] = [];
          const fixture = {
            state: { protectedModeEnabled: true, goLiveSettings },
            userService: { isLoggedIn: true },
            videoSettingsService: {
              flushPendingCanvasSettings() {
                calls.push('flush');
                return Promise.resolve();
              },
              limitStreamOutputs() {
                calls.push('limit');
                return Promise.resolve({ resolutionChanged: true, bitrateChanged: true });
              },
            },
            streamingService: { views: { isDualOutputMode: false } },
            notificationsService: {
              removeByCode: () => calls.push('remove-notification'),
              push: () => calls.push('notify'),
            },
          };
          const result = { savedSettings: String(goLiveSettings), calls };
          return apply.call(fixture).then(
            () => result,
            (error: Error) => ({ ...result, error: error.message }),
          );
        }),
      ).then(done);
    })) as { savedSettings: string; calls: string[]; error?: string }[];
    t.deepEqual(
      results.map(result => result.savedSettings),
      ['undefined', 'null'],
    );
    for (const result of results) {
      t.falsy(result.error, result.savedSettings);
      t.deepEqual(
        result.calls,
        [],
        `${result.savedSettings} must not touch settings or notifications`,
      );
    }
  } finally {
    await focusMain();
  }
});

test('stream output limit notifications replace earlier variants without clearing unrelated messages', async t => {
  t.true(await focusWindow('worker'));
  try {
    const result = (await t.context.app.client.executeAsync(done => {
      const services = (window as any).servicesManager;
      const service = services.getResource('StreamSettingsService');
      const notifications = services.getResource('NotificationsService');
      const code = 'STREAM_OUTPUT_SETTINGS_LIMIT';
      const unrelatedCode = 'STREAM_OUTPUT_NOTIFICATION_TEST';
      const removedIds: number[] = [];
      const subscription = notifications.notificationRead.subscribe((ids: number[]) => {
        removedIds.push(...ids);
      });
      let changes = { resolutionChanged: true, bitrateChanged: false };
      // Exercise the real guard and notification service without changing video settings
      // or requiring a linked platform account.
      const fixture = {
        state: { protectedModeEnabled: true },
        userService: { isLoggedIn: true },
        videoSettingsService: {
          flushPendingCanvasSettings: () => Promise.resolve(),
          limitStreamOutputs: () => Promise.resolve(changes),
        },
        streamingService: { views: { isDualOutputMode: false } },
        notificationsService: notifications,
      };
      const apply = Object.getPrototypeOf(service).applyStreamOutputLimits;
      const snapshots: { id: number; message: string }[][] = [];
      notifications.push({ code: unrelatedCode, message: 'Unrelated test notification' });
      [
        { resolutionChanged: true, bitrateChanged: false },
        { resolutionChanged: true, bitrateChanged: true },
        { resolutionChanged: false, bitrateChanged: true },
        { resolutionChanged: false, bitrateChanged: false },
      ]
        .reduce(
          (pending, nextChanges) =>
            pending
              .then(() => {
                changes = nextChanges;
                return apply.call(fixture, {
                  platforms: {
                    youtube: { enabled: true },
                    twitch: { enabled: true },
                    facebook: { enabled: true },
                  },
                });
              })
              .then(() => {
                snapshots.push(
                  notifications.views
                    .getAll()
                    .filter((notification: { code: string }) => notification.code === code)
                    .map(({ id, message }: { id: number; message: string }) => ({ id, message })),
                );
              }),
          Promise.resolve(),
        )
        .then(() => {
          changes = { resolutionChanged: false, bitrateChanged: false };
          return apply.call(fixture, {
            platforms: { youtube: { enabled: true }, twitch: { enabled: true } },
          });
        })
        .then(() => ({
          snapshots,
          removedIds: [...removedIds],
          remainingLimitId:
            notifications.views
              .getAll()
              .find((notification: { code: string }) => notification.code === code)?.id ?? null,
          unrelatedPresent: notifications.views
            .getAll()
            .some((notification: { code: string }) => notification.code === unrelatedCode),
        }))
        .finally(() => {
          subscription.unsubscribe();
          notifications.removeByCode(code);
          notifications.removeByCode(unrelatedCode);
        })
        .then(done, (error: Error) =>
          done({
            snapshots,
            removedIds,
            remainingLimitId: null,
            unrelatedPresent: false,
            error: error.message,
          }),
        );
    })) as {
      snapshots: { id: number; message: string }[][];
      removedIds: number[];
      remainingLimitId: number | null;
      unrelatedPresent: boolean;
      error?: string;
    };
    t.falsy(result.error);
    t.deepEqual(
      result.snapshots.map(snapshot => snapshot.length),
      [1, 1, 1, 1],
    );
    const [resolution, combined, bitrate, repeated] = result.snapshots.map(snapshot => snapshot[0]);
    t.regex(resolution.message, /1080p because a platform other than Twitch or YouTube/);
    t.false(resolution.message.includes('6000'));
    t.regex(combined.message, /1080p and 6000 Kbps/);
    t.regex(bitrate.message, /bitrate was reduced to 6000 Kbps/);
    t.false(bitrate.message.includes('1080p'));
    t.is(
      repeated.id,
      bitrate.id,
      'a no-change check for the same restricted selection retains the message',
    );
    t.deepEqual(result.removedIds, [resolution.id, combined.id, bitrate.id]);
    t.is(
      result.remainingLimitId,
      null,
      'an exempt selection clears the obsolete warning even without settings changes',
    );
    t.true(result.unrelatedPresent);
  } finally {
    await focusMain();
  }
});
