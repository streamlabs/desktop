import * as fs from 'fs';
import * as path from 'path';
import { test, useWebdriver } from '../../helpers/webdriver';
import { focusMain, focusWindow, getClient } from '../../helpers/modules/core';

const destinations = [
  {
    name: 'mismatched Twitch server',
    type: 'rtmp_common',
    service: 'Twitch',
    server: 'rtmps://a.rtmps.youtube.com:443/live2',
    expectedServer: 'auto',
  },
  {
    name: 'mismatched YouTube server',
    type: 'rtmp_common',
    service: 'YouTube - RTMPS',
    server: 'rtmp://live.twitch.tv/app',
    expectedServer: 'rtmps://a.rtmps.youtube.com:443/live2',
  },
  {
    name: 'valid regional Twitch server',
    type: 'rtmp_common',
    service: 'Twitch',
    server: 'rtmp://usw20.contribute.live-video.net/app',
    expectedServer: 'rtmp://usw20.contribute.live-video.net/app',
  },
  {
    name: 'custom URL with a trailing slash',
    type: 'rtmp_custom',
    server: 'rtmp://example.invalid/live/',
    expectedServer: 'rtmp://example.invalid/live/',
  },
  {
    name: 'Facebook URL with a trailing slash',
    type: 'rtmp_common',
    service: 'Facebook Live',
    server: 'rtmps://rtmp-api.facebook.com:443/rtmp/',
    expectedServer: 'rtmps://rtmp-api.facebook.com:443/rtmp/',
  },
];

// This is the test harness, not a React hook.
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver({
  beforeAppStartCb: async t => {
    const destination = destinations.find(destination => t.title.endsWith(destination.name));
    if (!destination) throw new Error(`Missing upgrade fixture for ${t.title}`);
    const profile = path.join(t.context.cacheDir, 'slobs-client');
    await fs.promises.mkdir(profile, { recursive: true });
    await fs.promises.writeFile(
      path.join(profile, 'service.json'),
      JSON.stringify({
        type: destination.type,
        settings: {
          service: destination.service,
          server: destination.server,
          key: 'synthetic-upgrade-key',
          show_all: false,
        },
      }),
    );
  },
});

for (const destination of destinations) {
  test(`Unprotected upgrade: ${destination.name}`, async t => {
    t.true(await focusWindow('worker'), 'Native output assertions must run in the worker');
    try {
      const result = await getClient().execute(() => {
        const manager = (window as any).servicesManager;
        const streaming = manager.getResource('StreamingService');
        const settings = manager.getResource('SettingsService');
        const streamSettings = manager.getResource('StreamSettingsService');
        const remote = (window as any).require('@electron/remote');
        const fs = (window as any).require('fs');
        const path = (window as any).require('path');
        const servicePath = path.join(
          manager.getResource('AppService').appDataDirectory,
          'service.json',
        );
        const persisted = () => JSON.parse(fs.readFileSync(servicePath, 'utf8')).settings;
        const before = persisted();
        const originalCreate = streaming.createStreaming;
        const rows: { mode: string; server: string; key: string }[] = [];

        // This changes only Desktop's mode flag. Do not save the Stream form:
        // the test must exercise a profile loaded directly from an older version.
        streamSettings.setSettings({ protectedModeEnabled: false });
        settings.setEnhancedBroadcasting(false);
        settings.setSettingValue('General', 'WarnBeforeStartingStream', false);
        streaming.createStreaming = (options: any) =>
          originalCreate.call(streaming, { ...options, start: false }).then((output: any) => {
            if (!output) throw new Error('No native output was created');
            rows.push({
              mode: settings.views.values.Output.Mode,
              server: output.service.settings.server,
              key: output.service.settings.key,
            });
            streaming.resolveStartStreaming();
            return output;
          });

        const releaseOutput = (): Promise<void> => {
          if (
            typeof streaming.powerSaveId === 'number' &&
            remote.powerSaveBlocker.isStarted(streaming.powerSaveId)
          ) {
            remote.powerSaveBlocker.stop(streaming.powerSaveId);
          }
          return streaming.handleDestroyOutputContexts('horizontal');
        };
        settings.setSettingValue('Output', 'Mode', 'Simple');
        // Cover the ordinary Go Live path and direct/retry starts in Advanced mode.
        const run: Promise<unknown> = streaming
          .goLive()
          .then(() => releaseOutput())
          .then(() => {
            settings.setSettingValue('Output', 'Mode', 'Advanced');
            return streaming.finishStartStreaming();
          });
        const cleanup = () => {
          streaming.createStreaming = originalCreate;
          return releaseOutput();
        };
        return run.then(
          () => cleanup().then(() => ({ before, rows, after: persisted() })),
          (error: Error) =>
            cleanup().then(() => {
              throw error;
            }),
        );
      });

      t.is(result.before.server, destination.server, 'The fixture must reach startup unrepaired');
      t.is(result.rows.length, 2);
      t.deepEqual(
        result.rows.map(row => row.mode),
        ['Simple', 'Advanced'],
      );
      for (const row of result.rows) {
        t.is(row.server, destination.expectedServer, `${row.mode}: native output server`);
        t.is(row.key, 'synthetic-upgrade-key', 'Normalization must preserve the stream key');
      }
      t.is(result.after.server, destination.expectedServer, 'Persist the normalized selection');
      t.is(result.after.key, 'synthetic-upgrade-key');
    } finally {
      await focusMain();
    }
  });
}
