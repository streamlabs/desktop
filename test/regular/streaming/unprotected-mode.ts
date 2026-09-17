import { test, useWebdriver } from '../../helpers/webdriver';
import { focusMain, focusWindow, getClient } from '../../helpers/modules/core';

// This is the test harness, not a React hook.
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Unprotected mode uses the selected destination with Enhanced Broadcasting enabled', async t => {
  t.true(await focusWindow('worker'), 'Native output assertions must run in the worker');
  try {
    const result = await getClient().execute(() => {
      const manager = (window as any).servicesManager;
      const streaming = manager.getResource('StreamingService');
      const settings = manager.getResource('SettingsService');
      const streamSettings = manager.getResource('StreamSettingsService');
      const user = manager.getResource('UserService');
      const twitch = manager.getResource('TwitchService');
      const remote = (window as any).require('@electron/remote');
      const originalCreate = streaming.createStreaming;
      const originalFinish = streaming.finishStartStreaming;
      const originalSetup = streaming.setPlatformSettings;
      const originalAfterGoLive = twitch.afterGoLive;
      const originalState = Object.getOwnPropertyDescriptor(user, 'state');
      const originalStream = JSON.parse(JSON.stringify(settings.state.Stream.formData));
      const originalLocalSettings = JSON.parse(JSON.stringify(streamSettings.state));
      const originalMode = settings.views.values.Output.Mode;
      const originalEnhanced = settings.isEnhancedBroadcasting();
      const originalRunEnhanced = streaming.state.enhancedBroadcasting;
      const originalWarn = settings.views.values.General.WarnBeforeStartingStream;

      // Simulate a Twitch-primary account only in this worker. No login mutation,
      // real credentials, account requests, or renderer account changes are needed.
      Object.defineProperty(user, 'state', {
        configurable: true,
        value: {
          ...user.state,
          loginValidated: true,
          auth: {
            primaryPlatform: 'twitch',
            widgetToken: 'synthetic',
            platforms: {
              twitch: { type: 'twitch', id: 'synthetic', username: 'synthetic' },
              youtube: { type: 'youtube', id: 'synthetic', username: 'synthetic' },
            },
          },
        },
      });

      streamSettings.setSettings({
        protectedModeEnabled: false,
        goLiveSettings: {
          platforms: {
            twitch: { enabled: true, display: 'both' },
            youtube: { enabled: true, display: 'horizontal' },
          },
          customDestinations: [],
          advancedMode: false,
          streamShift: true,
        },
      });
      settings.setEnhancedBroadcasting(true);
      settings.setSettingValue('General', 'WarnBeforeStartingStream', false);
      twitch.afterGoLive = () => Promise.resolve();

      const rows: any[] = [];
      const current = { name: '' };
      let bypassedPlatformSetup = 0;
      streaming.createStreaming = (options: any) => {
        // Exercise the actual native factory, encoder, and service assignment,
        // stopping at the output-start boundary so no stream can be published.
        return originalCreate.call(streaming, { ...options, start: false }).then((output: any) => {
          if (!output) throw new Error('No native output was created');
          rows.push({
            name: current.name,
            mode: settings.views.values.Output.Mode,
            enhanced: streaming.isEnhancedBroadcastingStreaming(output),
            twitchWindow: streaming.views.isTwitchUnprotectedStream,
            platforms: streaming.views.enabledPlatforms,
            dualOutput: streaming.views.isDualOutputMode,
            restream: streaming.views.shouldSetupRestream,
            streamShift: streaming.views.isStreamShiftMode,
            server: output.service.settings.server,
            key: output.service.settings.key,
            configuredServer: settings.views.values.Stream.server,
            preference: settings.isEnhancedBroadcasting(),
            primaryPlatform: user.state.auth.primaryPlatform,
          });
          streaming.resolveStartStreaming();
          return output;
        });
      };

      const cases = [
        {
          name: 'common Twitch automatic',
          streamType: 'rtmp_common',
          platform: 'twitch',
          server: 'auto',
        },
        { name: 'custom Twitch', streamType: 'rtmp_custom', server: 'rtmp://live.twitch.tv/app' },
        {
          name: 'custom Twitch trailing slash',
          streamType: 'rtmp_custom',
          server: 'rtmp://live.twitch.tv/app/',
        },
        {
          name: 'common YouTube',
          streamType: 'rtmp_common',
          platform: 'youtube',
          server: 'rtmps://a.rtmps.youtube.com:443/live2',
        },
        {
          name: 'custom YouTube',
          streamType: 'rtmp_custom',
          server: 'rtmps://a.rtmps.youtube.com:443/live2',
        },
        {
          name: 'return to common Twitch',
          streamType: 'rtmp_common',
          platform: 'twitch',
          server: 'auto',
        },
        {
          name: 'common Twitch regional',
          streamType: 'rtmp_common',
          platform: 'twitch',
          server: 'rtmp://usw20.contribute.live-video.net/app',
        },
      ];

      const stopPowerSaveBlocker = () => {
        if (
          typeof streaming.powerSaveId === 'number' &&
          remote.powerSaveBlocker.isStarted(streaming.powerSaveId)
        ) {
          remote.powerSaveBlocker.stop(streaming.powerSaveId);
        }
      };
      const cleanup = () => {
        streaming.createStreaming = originalCreate;
        streaming.finishStartStreaming = originalFinish;
        streaming.setPlatformSettings = originalSetup;
        twitch.afterGoLive = originalAfterGoLive;
        stopPowerSaveBlocker();
        return streaming.handleDestroyOutputContexts('horizontal').then(() => {
          // A destination change can clear a carried key; restore it after that change.
          settings.setSettings('Stream', originalStream);
          settings.setSettings('Stream', originalStream);
          streamSettings.setSettings(originalLocalSettings);
          settings.setSettingValue('Output', 'Mode', originalMode);
          settings.setEnhancedBroadcasting(originalEnhanced);
          streaming.SET_ENHANCED_BROADCASTING(originalRunEnhanced);
          settings.setSettingValue('General', 'WarnBeforeStartingStream', originalWarn);
          if (originalState) Object.defineProperty(user, 'state', originalState);
          else delete user.state;
        });
      };

      let run = Promise.resolve();
      for (const mode of ['Simple', 'Advanced']) {
        for (const destination of cases) {
          run = run.then(() => {
            current.name = destination.name;
            settings.setSettingValue('Output', 'Mode', mode);
            streamSettings.setSettings({ ...destination, key: 'synthetic-unprotected-key' });
            // A prior attempt may leave this flag set, including after failure.
            streaming.SET_ENHANCED_BROADCASTING(true);
            return streaming.finishStartStreaming().then(() => {
              stopPowerSaveBlocker();
              return streaming.handleDestroyOutputContexts('horizontal');
            });
          });
        }
      }

      run = run.then(() => {
        streaming.finishStartStreaming = () => {
          bypassedPlatformSetup++;
          return Promise.resolve();
        };
        streaming.setPlatformSettings = () => {
          throw new Error('YouTube in unprotected mode must not run Twitch platform setup');
        };
        streamSettings.setSettings({ streamType: 'rtmp_common', platform: 'youtube' });
        return streaming.goLive().then(() => {
          streamSettings.setSettings({ streamType: 'rtmp_custom' });
          return streaming.goLive();
        });
      });

      return run.then(
        () => cleanup().then(() => ({ rows, bypassedPlatformSetup })),
        error =>
          cleanup().then(() => {
            throw error;
          }),
      );
    });

    t.is(result.rows.length, 14);
    for (const row of result.rows) {
      const isYouTube = row.name.includes('YouTube');
      const isCommon = row.name.includes('common');
      t.is(row.enhanced, isCommon && !isYouTube, `${row.mode}: ${row.name} output type`);
      t.is(row.twitchWindow, !isYouTube, `${row.mode}: ${row.name} Twitch window eligibility`);
      t.is(
        row.primaryPlatform,
        'twitch',
        'Unprotected streaming must preserve the primary account',
      );
      t.deepEqual(row.platforms, isYouTube ? [] : ['twitch']);
      t.false(
        row.dualOutput,
        'Saved protected-mode display assignments must not activate Dual Output',
      );
      t.false(row.restream);
      t.false(row.streamShift);
      t.true(row.preference, 'Changing destinations must preserve the saved Twitch preference');
      t.is(row.key, 'synthetic-unprotected-key');
      t.is(row.server, row.configuredServer, 'The selected server must reach the output unchanged');
      if (row.name.includes('automatic') || row.name.includes('return')) t.is(row.server, 'auto');
      if (row.name.includes('regional')) {
        t.is(row.server, 'rtmp://usw20.contribute.live-video.net/app');
      }
      if (row.name === 'custom Twitch') t.is(row.server, 'rtmp://live.twitch.tv/app');
      if (row.name.includes('trailing slash')) t.is(row.server, 'rtmp://live.twitch.tv/app/');
    }
    t.is(result.bypassedPlatformSetup, 2);
  } finally {
    await focusMain();
  }
});
