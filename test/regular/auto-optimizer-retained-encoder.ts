import { test, useWebdriver } from '../helpers/webdriver';
import { focusMain, focusWindow } from '../helpers/modules/core';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('retained encoders preserve Auto Optimizer output bitrates without starting outputs', async t => {
  try {
    t.true(await focusWindow('worker'), 'worker window is available');
    const result = (await t.context.app.client.execute(`
      return (async () => {
        const service = window.servicesManager.getResource('StreamingService');
        const prototype = Object.getPrototypeOf(service);
        async function run(contextName, type, active = false) {
          const updates = [];
          const encoder = {
            id: 'obs_x264', active,
            update(settings, replace) { updates.push({ settings, replace }); },
          };
          const context = {
            contexts: { [contextName]: { [type]: { videoEncoder: encoder } } },
            state: { info: { settings: { autoOptimizerProfile: {
              schemaVersion: 1,
              streamSetup: 'dual-output',
              outputs: [
                { outputKind: 'standard', display: 'horizontal', bitrate: 4500 },
                { outputKind: 'standard', display: 'vertical', bitrate: 3500 },
              ],
            } } } },
            outputSettingsService: {
              getSettings: () => ({ mode: 'Advanced' }),
              getStreamingSettings: () => ({ videoEncoder: 'obs_x264' }),
              getRecordingSettings: () => ({ videoEncoder: 'obs_x264' }),
              getStreamingVideoEncoderSettings: () => ({ bitrate: 6000, preset: 'fast' }),
              getRecordingVideoEncoderSettings: () => ({ bitrate: 9000, preset: 'slow' }),
            },
            isDisplayContext: name => name === 'horizontal' || name === 'vertical',
            isSimpleStreaming: () => false,
            isAdvancedStreaming: () => false,
            isAdvancedRecording: () => false,
            getAutoOptimizerOutputForContext: prototype.getAutoOptimizerOutputForContext,
          };
          await prototype.updateOutputEncoderSettings.call(context, contextName, type);
          return updates;
        }
        return {
          horizontal: await run('horizontal', 'streaming'),
          vertical: await run('vertical', 'streaming'),
          providerOwned: await run('enhancedBroadcasting', 'streaming'),
          recording: await run('horizontal', 'recording'),
          active: await run('horizontal', 'streaming', true),
        };
      })();
    `)) as Record<string, any>;
    const update = (bitrate: number, preset: string) => [
      { settings: { bitrate, preset }, replace: true },
    ];
    t.deepEqual(result.horizontal, update(4500, 'fast'));
    t.deepEqual(result.vertical, update(3500, 'fast'));
    t.deepEqual(result.providerOwned, update(6000, 'fast'));
    t.deepEqual(result.recording, update(9000, 'slow'));
    t.deepEqual(result.active, []);
  } finally {
    await focusMain();
  }
});
