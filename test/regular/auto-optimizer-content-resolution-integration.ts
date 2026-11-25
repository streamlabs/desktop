import { test, useWebdriver } from '../helpers/webdriver';
import { focusMain, focusWindow } from '../helpers/modules/core';

// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver({ restartAppAfterEachTest: false });

for (const [width, height] of [
  [1920, 1080],
  [2560, 1440],
]) {
  test(`optimizer request uses ${width}x${height} captured content, not the saved 1440p canvas`, async t => {
    t.true(await focusWindow('worker'));
    try {
      const result = (await t.context.app.client.executeAsync(
        (captureWidth, captureHeight, done) => {
          const service = (window as any).servicesManager.getResource('AutoOptimizerService');
          const prototype = Object.getPrototypeOf(service);
          const horizontal = {
            baseWidth: 2560,
            baseHeight: 1440,
            outputWidth: 2560,
            outputHeight: 1440,
            fpsNum: 30,
            fpsDen: 1,
          };
          const fixture = {
            videoSettingsService: {
              state: {
                horizontal,
                vertical: {
                  baseWidth: 1080,
                  baseHeight: 1920,
                  outputWidth: 1080,
                  outputHeight: 1920,
                  fpsNum: 30,
                  fpsDen: 1,
                },
              },
              contexts: { horizontal: { canvasId: 0 }, vertical: { canvasId: 1 } },
            },
            scenesService: {
              views: {
                activeSceneId: 'test-scene',
                getScene: () => ({
                  getItems: () => [
                    {
                      getModel: () => ({
                        sourceId: 'capture',
                        type: 'game_capture',
                        visible: true,
                        width: captureWidth,
                        height: captureHeight,
                      }),
                    },
                  ],
                }),
              },
            },
            outputSettingsService: {
              getSettings: () => ({
                streaming: { bitrate: 8000, encoderId: 'obs_x264' },
              }),
            },
            // Use the production request path, but never allocate platform resources or start OBS outputs.
            getProbeResources: () => ({
              prepare: (streamSetup: unknown) =>
                Promise.resolve({ streamSetup, probesByOutput: new Map() }),
              cleanupAfterNativeClose: () => Promise.resolve(),
            }),
          };
          Object.setPrototypeOf(fixture, prototype);
          prototype.createNativeRequest
            .call(fixture, {
              type: 'enhanced-broadcasting',
              outputs: [
                {
                  outputId: 'twitch',
                  outputKind: 'twitch-enhanced-broadcasting',
                  display: 'both',
                  destinations: [{ platform: 'twitch' }],
                  measurement: 'active',
                  probeCandidates: [],
                },
              ],
            })
            .then(
              (prepared: any) =>
                done({
                  limits: prepared.request.outputs[0].limits,
                  verticalLimits: prepared.request.outputs[0].additionalVideo.limits,
                  savedWidth: horizontal.outputWidth,
                }),
              (error: Error) => done({ error: error.message }),
            );
        },
        width,
        height,
      )) as {
        limits?: { maxWidth: number; maxHeight: number; maxFpsNum: number; maxFpsDen: number };
        verticalLimits?: {
          maxWidth: number;
          maxHeight: number;
          maxFpsNum: number;
          maxFpsDen: number;
        };
        savedWidth?: number;
        error?: string;
      };
      t.falsy(result.error);
      t.deepEqual(result.limits, {
        maxWidth: width,
        maxHeight: height,
        maxFpsNum: 60,
        maxFpsDen: 1,
      });
      t.deepEqual(result.verticalLimits, {
        maxWidth: 1080,
        maxHeight: 1920,
        maxFpsNum: 60,
        maxFpsDen: 1,
      });
      t.is(result.savedWidth, 2560);
    } finally {
      await focusMain();
    }
  });
}
