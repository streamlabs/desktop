import { skipCheckingErrorsInLog, test, useWebdriver } from '../helpers/webdriver';
import { focusMain, focusWindow } from '../helpers/modules/core';

// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

interface CanvasSnapshot {
  baseWidth: number;
  baseHeight: number;
  nativeWidth: number;
  nativeHeight: number;
}

interface PendingCanvasResult {
  before: CanvasSnapshot;
  afterQueue: CanvasSnapshot;
  after: CanvasSnapshot;
  first: string;
  callsWhilePending: string[];
  calls: string[];
  atTransmission: CanvasSnapshot[];
  startError: string | null;
  editError: string | null;
  baseWidth: number;
  baseHeight: number;
}

for (const unattended of [false, true]) {
  for (const failCanvasEdit of [false, true]) {
    test(`${unattended ? 'Unattended' : 'Confirmed'} Go Live ${
      failCanvasEdit ? 'aborts after a failed' : 'waits for a pending'
    } canvas edit`, async t => {
      if (failCanvasEdit) skipCheckingErrorsInLog();
      t.true(await focusWindow('worker'));
      try {
        const result = (await t.context.app.client.execute(
          `
          return (async (unattended, failCanvasEdit) => {
            const services = window.servicesManager;
            const video = services.getResource('VideoSettingsService');
            const streamingPrototype = Object.getPrototypeOf(services.getResource('StreamingService'));
            const collections = services.getResource('SceneCollectionsService');
            const originalDisableAutoSave = collections.disableAutoSave;
            const originalVideo = { ...video.state.horizontal };
            const baseWidth = originalVideo.baseWidth === 1280 ? 960 : 1280;
            const baseHeight = baseWidth * 9 / 16;
            const calls = [];
            const atTransmission = [];
            const snapshot = () => ({
              baseWidth: video.state.horizontal.baseWidth,
              baseHeight: video.state.horizontal.baseHeight,
              nativeWidth: video.contexts.horizontal.video.baseWidth,
              nativeHeight: video.contexts.horizontal.video.baseHeight,
            });
            const before = snapshot();
            let releaseCanvasEdit;
            let canvasEditStarted;
            const canvasGate = new Promise(resolve => { releaseCanvasEdit = resolve; });
            const canvasStarted = new Promise(resolve => { canvasEditStarted = resolve; });
            const goLiveSettings = {
              platforms: { twitch: { enabled: true } },
              customDestinations: [],
            };
            const context = {
              userService: { isLoggedIn: true, state: { auth: { primaryPlatform: 'twitch' } } },
              videoSettingsService: video,
              views: {
                protectedModeEnabled: true,
                isDualOutputMode: false,
                isTwitchDualStreaming: false,
                shouldSetupRestream: false,
                enabledPlatforms: ['twitch'],
                savedSettings: goLiveSettings,
              },
              state: { info: { error: null } },
              streamSettingsService: { setSettings() {} },
              videoEncodingOptimizationService: { state: { useOptimizedProfile: false } },
              RESET_STREAM_INFO() {},
              SET_GO_LIVE_SETTINGS() {},
              UPDATE_STREAM_INFO() {},
              getIsStreamingStatus: () => false,
              async setPlatformSettings() { calls.push('platform'); },
              async runCheck(_name, action) { await action(); },
              async finishStartStreaming() {
                calls.push('transmission');
                atTransmission.push(snapshot());
              },
            };
            let edit;
            let start;
            try {
              // Hold the real canvas transaction before it updates OBS. Only platform
              // setup and transmission are stubbed, so the test never goes live.
              collections.disableAutoSave = async function(...args) {
                canvasEditStarted('canvas');
                await canvasGate;
                if (failCanvasEdit) throw new Error('Injected pending canvas failure');
                return originalDisableAutoSave.apply(this, args);
              };
              edit = Promise.resolve(video.setSettings({ baseWidth, baseHeight })).then(
                () => null,
                error => error.message,
              );
              const afterQueue = snapshot();
              start = streamingPrototype.goLive.call(
                context,
                unattended ? undefined : goLiveSettings,
              ).then(() => null, error => error.message);
              const first = await Promise.race([canvasStarted, start.then(() => 'go-live')]);
              const callsWhilePending = [...calls];
              releaseCanvasEdit();
              const startError = await start;
              const editError = await edit;
              return {
                before, afterQueue, first, callsWhilePending, calls, atTransmission,
                startError, editError, after: snapshot(), baseWidth, baseHeight,
              };
            } finally {
              releaseCanvasEdit();
              await Promise.all([edit, start]);
              collections.disableAutoSave = originalDisableAutoSave;
              await video.applyAutoOptimizerSettings({ horizontal: originalVideo });
            }
          })(arguments[0], arguments[1]).catch(error => ({ error: error.stack || error.message }));
          `,
          unattended,
          failCanvasEdit,
        )) as PendingCanvasResult | { error: string };

        if ('error' in result) {
          t.fail(result.error);
          return;
        }
        t.deepEqual(result.afterQueue, result.before, 'the canvas edit is initially queued');
        t.is(result.first, 'canvas', 'Go Live must flush the edit before proceeding');
        t.deepEqual(result.callsWhilePending, [], 'startup waits for the canvas transaction');
        if (failCanvasEdit) {
          t.is(result.editError, 'Injected pending canvas failure');
          t.is(result.startError, result.editError, 'the canvas failure reaches the caller');
          t.deepEqual(result.calls, [], 'neither platform setup nor transmission starts');
          t.deepEqual(result.atTransmission, []);
          t.deepEqual(result.after, result.before);
        } else {
          const expected = {
            baseWidth: result.baseWidth,
            baseHeight: result.baseHeight,
            nativeWidth: result.baseWidth,
            nativeHeight: result.baseHeight,
          };
          t.is(result.editError, null);
          t.is(result.startError, null);
          t.deepEqual(result.calls, ['platform', 'transmission']);
          t.deepEqual(result.atTransmission, [expected], 'startup uses the committed canvas');
          t.deepEqual(result.after, expected);
        }
      } finally {
        await focusMain();
      }
    });
  }
}
