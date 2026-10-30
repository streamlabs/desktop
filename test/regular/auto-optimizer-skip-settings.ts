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
}

for (const mode of ['Simple', 'Advanced'] as const) {
  test(`${mode} YouTube-only Skip then Go Live preserves 1440p and 10000 Kbps`, async t => {
    t.true(await focusWindow('worker'));
    try {
      const result = (await t.context.app.client.execute(
        `
        return (async outputMode => {
          const services = window.servicesManager;
          const video = services.getResource('VideoSettingsService');
          const output = services.getResource('OutputSettingsService');
          const settings = services.getResource('SettingsService');
          const optimizer = services.getResource('AutoOptimizerService');
          const optimizerPrototype = Object.getPrototypeOf(optimizer);
          const streamSettingsPrototype = Object.getPrototypeOf(
            services.getResource('StreamSettingsService'),
          );
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
          });

          try {
            await video.applyAutoOptimizerSettings({
              horizontal: { outputWidth: 2560, outputHeight: 1440 },
            });
            output.setSettings({
              mode: outputMode,
              streaming: { bitrate: 10000, rescaleOutput: false },
            });
            const before = snapshot();
            const goLiveSettings = {
              platforms: { youtube: { enabled: true, enableAutoStart: true } },
              customDestinations: [],
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
              enabledPlatforms: ['youtube'],
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
              async applyStreamOutputLimits(selected) {
                calls.push('output-limits');
                await streamSettingsPrototype.applyStreamOutputLimits.call(this, selected);
              },
            };
            const streamingContext = {
              userService: { isLoggedIn: true, state: { auth: { primaryPlatform: 'youtube' } } },
              views,
              state: { info: { error: null } },
              streamSettingsService: streamSettingsContext,
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
            };
            await streamingPrototype.goLive.call(streamingContext, {
              ...goLiveSettings,
              autoOptimizerProfile: profile || undefined,
            });
            return {
              before,
              afterSkip,
              afterGoLive: snapshot(),
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
        })(arguments[0]).catch(error => ({ error: error.stack || error.message }));
      `,
        mode,
      )) as
        | { error: string }
        | {
            before: SettingsSnapshot;
            afterSkip: SettingsSnapshot;
            afterGoLive: SettingsSnapshot;
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
        width: 2560,
        height: 1440,
        nativeWidth: 2560,
        nativeHeight: 1440,
        bitrate: 10000,
      };
      t.deepEqual(result.before, expected, 'the requested settings were established');
      t.is(result.promptState, 'declined');
      t.is(result.profile, null, 'Skip must not supply recommendations to Go Live');
      t.deepEqual(result.calls, ['output-limits', 'platform:youtube', 'transmission']);
      t.deepEqual(result.afterSkip, expected);
      t.deepEqual(result.atTransmission, [expected], 'settings stay intact at transmission start');
      t.deepEqual(result.afterGoLive, expected);
    } finally {
      await focusMain();
    }
  });
}
