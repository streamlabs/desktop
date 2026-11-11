import { test, useWebdriver } from '../helpers/webdriver';
import { focusMain, focusWindow } from '../helpers/modules/core';

// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

interface SettingsSnapshot {
  width: number;
  height: number;
  nativeWidth: number;
  nativeHeight: number;
  bitrate: number;
  rescale: string;
  baseWidth: number;
  baseHeight: number;
  fpsNum: number;
  fpsDen: number;
}

for (const mode of ['Simple', 'Advanced'] as const) {
  for (const multistream of [false, true]) {
    test(`${mode} ${
      multistream ? 'Twitch + Kick + custom' : 'YouTube-only'
    } Go Live preserves video settings after Skip, unattended start and live update`, async t => {
      t.true(await focusWindow('worker'));
      try {
        const result = (await t.context.app.client.execute(
          `
        return (async (outputMode, multistream) => {
          const services = window.servicesManager;
          const video = services.getResource('VideoSettingsService');
          const output = services.getResource('OutputSettingsService');
          const settings = services.getResource('SettingsService');
          const optimizer = services.getResource('AutoOptimizerService');
          const optimizerPrototype = Object.getPrototypeOf(optimizer);
          const streamingPrototype = Object.getPrototypeOf(
            services.getResource('StreamingService'),
          );
          const originalOutput = JSON.parse(JSON.stringify(settings.state.Output.formData));
          const originalVideo = { ...video.state.horizontal };
          const snapshot = () => ({
            width: video.state.horizontal.outputWidth,
            height: video.state.horizontal.outputHeight,
            nativeWidth: video.contexts.horizontal.video.outputWidth,
            nativeHeight: video.contexts.horizontal.video.outputHeight,
            bitrate: output.getSettings().streaming.bitrate,
            rescale: output.getSettings().streaming.outputResolution,
            baseWidth: video.state.horizontal.baseWidth,
            baseHeight: video.state.horizontal.baseHeight,
            fpsNum: video.state.horizontal.fpsNum,
            fpsDen: video.state.horizontal.fpsDen,
          });

          try {
            await video.applyAutoOptimizerSettings({
              horizontal: { outputWidth: multistream ? 3440 : 2560, outputHeight: 1440 },
            });
            output.setSettings({
              mode: outputMode,
              streaming: { bitrate: 10000, rescaleOutput: outputMode === 'Advanced' },
            });
            if (outputMode === 'Advanced') settings.setSettingValue('Output', 'RescaleRes', '2560x1440');
            const before = snapshot();
            const platforms = multistream ? ['twitch', 'kick'] : ['youtube'];
            const goLiveSettings = {
              platforms: Object.fromEntries(platforms.map(platform => [platform, { enabled: true, enableAutoStart: true }])),
              customDestinations: multistream ? [{ enabled: true, url: 'rtmp://127.0.0.1/unused', streamKey: 'test', display: 'horizontal' }] : [],
            };
            const optimizerState = {
              ...JSON.parse(JSON.stringify(optimizer.constructor.initialState)),
              host: 'go-live',
              stage: 'intro',
            };
            const optimizerContext = {
              state: optimizerState,
              frozenStreamSettings: goLiveSettings,
              pendingGoLiveProfile: null,
              runToken: 0,
              nativeRun: null,
              probeResources: null,
              recommendationApplication: null,
              cleanupPromise: null,
              getIdentityKey: () => 'account:skip-settings-test',
            };
            for (const method of [
              'waitForRecommendationApplication',
              'cleanupOptimizerRunIfCurrent',
              'cleanupOptimizerRun',
              'performOptimizerCleanup',
              'setPromptState',
            ]) {
              optimizerContext[method] = (...args) =>
                optimizerPrototype[method].apply(optimizerContext, args);
            }
            for (const mutation of ['SET_CANCELLING', 'SET_PROMPT_STATE', 'RESET_FLOW']) {
              optimizerContext[mutation] = (...args) =>
                optimizerPrototype.originalMethods[mutation].apply(optimizerContext, args);
            }

            // Run the production Skip action and consume its pending profile as the
            // Go Live continuation does. Settings and the OBS video context are real;
            // account/provider calls and actual broadcast transmission are isolated.
            const skipped = await optimizerPrototype.skipAndContinue.call(optimizerContext);
            if (!skipped) throw new Error('Skip did not allow Go Live to continue');
            const afterSkip = snapshot();
            const profile = optimizerPrototype.consumePendingGoLiveProfile.call(
              optimizerContext,
              goLiveSettings,
            );
            const calls = [];
            const atTransmission = [];
            const views = {
              protectedModeEnabled: true,
              isDualOutputMode: false,
              isTwitchDualStreaming: false,
              shouldSetupRestream: false,
              enabledPlatforms: platforms,
              isLiveOutputEditingEnabled: true,
              getEnabledPlatforms: () => platforms,
              get savedSettings() {
                return streamSettingsContext.state.goLiveSettings;
              },
            };
            const streamSettingsContext = {
              state: { protectedModeEnabled: true, goLiveSettings },
              userService: { isLoggedIn: true },
              videoSettingsService: video,
              streamingService: { views },
              notificationsService: { removeByCode() {}, push() {} },
              setSettings(patch) {
                this.state.goLiveSettings = patch.goLiveSettings;
              },
            };
            const streamingContext = {
              userService: { isLoggedIn: true, state: { auth: { primaryPlatform: platforms[0] } } },
              videoSettingsService: video,
              views,
              state: { info: { error: null } },
              streamSettingsService: streamSettingsContext,
              // goLive's platform codec guard runs against the real Output settings.
              outputSettingsService: output,
              throwIfPlatformCodecIncompatible(platforms) {
                return streamingPrototype.throwIfPlatformCodecIncompatible.call(this, platforms);
              },
              getPlatformCodecIncompatibility(platforms) {
                return streamingPrototype.getPlatformCodecIncompatibility.call(this, platforms);
              },
              videoEncodingOptimizationService: { state: { useOptimizedProfile: false } },
              RESET_STREAM_INFO() {},
              SET_GO_LIVE_SETTINGS() {},
              UPDATE_STREAM_INFO() {},
              async setPlatformSettings(platform) {
                calls.push('platform:' + platform);
              },
              async runCheck(_name, action) {
                await action();
              },
              async finishStartStreaming() {
                calls.push('transmission');
                atTransmission.push(snapshot());
              },
              getIsStreamingStatus: () => false,
              parseUpdatePlatforms: () => ({ start: [], stop: [], continue: platforms }),
              parseUpdateCustomDestinations: () => ({ start: [], stop: [], continue: goLiveSettings.customDestinations }),
              async runUpdateStreamSettings() {
                calls.push('live-update');
              },
            };
            await streamingPrototype.goLive.call(streamingContext, {
              ...goLiveSettings,
              autoOptimizerProfile: profile || undefined,
            });
            const afterGoLive = snapshot();
            await streamingPrototype.goLive.call(streamingContext);
            const afterUnattended = snapshot();
            const updated = await streamingPrototype.updateStreamSettings.call(streamingContext, goLiveSettings);
            return {
              before,
              afterSkip,
              afterGoLive,
              afterUnattended,
              afterUpdate: snapshot(),
              updated,
              atTransmission,
              profile,
              promptState: optimizerState.promptStates['account:skip-settings-test'],
              calls,
            };
          } finally {
            settings.setSettings('Output', originalOutput);
            settings.setSettings('Output', originalOutput);
            await video.applyAutoOptimizerSettings({ horizontal: originalVideo });
          }
        })(arguments[0], arguments[1]).catch(error => ({ error: error.stack || error.message }));
      `,
          mode,
          multistream,
        )) as
          | { error: string }
          | {
              before: SettingsSnapshot;
              afterSkip: SettingsSnapshot;
              afterGoLive: SettingsSnapshot;
              afterUnattended: SettingsSnapshot;
              afterUpdate: SettingsSnapshot;
              updated: boolean;
              atTransmission: SettingsSnapshot[];
              profile: unknown;
              promptState: string;
              calls: string[];
            };

        if ('error' in result) {
          t.fail(result.error);
          return;
        }
        const expected = {
          ...result.before,
          width: multistream ? 3440 : 2560,
          height: 1440,
          nativeWidth: multistream ? 3440 : 2560,
          nativeHeight: 1440,
          bitrate: 10000,
        };
        t.deepEqual(result.before, expected, 'the requested settings were established');
        if (mode === 'Advanced') t.is(result.before.rescale, '2560x1440');
        t.is(result.promptState, 'declined');
        t.is(result.profile, null, 'Skip must not supply recommendations to Go Live');
        const startCalls = [
          ...(multistream ? ['platform:twitch', 'platform:kick'] : ['platform:youtube']),
          'transmission',
        ];
        t.deepEqual(result.calls, [...startCalls, ...startCalls, 'live-update']);
        t.deepEqual(result.afterSkip, expected);
        t.deepEqual(
          result.atTransmission,
          [expected, expected],
          'settings stay intact at transmission start',
        );
        t.deepEqual(result.afterGoLive, expected);
        t.deepEqual(result.afterUnattended, expected);
        t.true(result.updated);
        t.deepEqual(result.afterUpdate, expected);
      } finally {
        await focusMain();
      }
    });
  }
}
