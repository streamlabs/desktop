import { test, useWebdriver } from '../helpers/webdriver';
import { focusWindow } from '../helpers/modules/core';

// not a React hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('cancelling, closing or failing preparation never saves optimizer settings', async t => {
  t.true(await focusWindow('worker'));
  const results = (await t.context.app.client.execute(`
    return (async () => {
      const prototype = Object.getPrototypeOf(window.servicesManager.getResource('AutoOptimizerService'));
      const results = [];
      for (const host of ['settings', 'go-live']) {
        for (const action of ['cancel', 'close', 'fail']) {
          let enterPreparation, releasePreparation;
          const entered = new Promise(resolve => { enterPreparation = resolve; });
          const pending = new Promise(resolve => { releasePreparation = resolve; });
          const saved = { baseWidth: 3440, baseHeight: 1440, outputWidth: 3440, outputHeight: 1440, bitrate: 8000, rescale: '3440x1440' };
          const before = { ...saved };
          let writes = 0;
          const context = {
            state: { stage: 'intro', host, streamSetup: { outputs: [] } },
            frozenStreamSettings: { platforms: { twitch: { enabled: true }, youtube: { enabled: true } } },
            runToken: 0, nativeRun: null, cleanupPromise: null, recommendationApplication: null,
            probeResources: null, attemptContext: null,
            streamSettingsService: {
              async applyStreamOutputLimits() {
                writes++;
                Object.assign(saved, { outputWidth: 1920, outputHeight: 802, bitrate: 6000, rescale: '1920x802' });
              },
            },
            SET_RUNNING() { this.state.stage = 'running'; },
            SET_CANCELLING() { this.state.stage = 'cancelling'; },
            SET_INTRO() { this.state.stage = 'intro'; },
            SET_ERROR(error) { this.state.stage = 'error'; this.state.error = error; },
            RESET_FLOW() { this.state.stage = 'idle'; },
            beginPhasePacing() {},
            async waitForPhasePacing() {},
            toError(error) { return { message: String(error), code: 'preparation-failed' }; },
            getProbeResources() { return { redactCredentials() {}, async cleanupAfterNativeClose(close) { await close(); } }; },
            async createNativeRequest() {
              enterPreparation();
              await pending;
              if (action === 'fail') throw new Error('Injected preparation failure');
              return { request: {}, streamSetup: { outputs: [] } };
            },
          };
          for (const method of ['waitForRecommendationApplication', 'cleanupOptimizerRunIfCurrent', 'cleanupOptimizerRun', 'performOptimizerCleanup']) {
            context[method] = (...args) => prototype[method].apply(context, args);
          }
          const started = prototype.startOptimization.call(context);
          await entered;
          if (action === 'cancel') await prototype.cancelOptimization.call(context);
          if (action === 'close') await prototype.closeFromHost.call(context, host);
          releasePreparation();
          await started;
          results.push({ host, action, before, saved, writes, stage: context.state.stage });
        }
      }
      return results;
    })();
  `)) as Array<{
    host: string;
    action: 'cancel' | 'close' | 'fail';
    before: unknown;
    saved: unknown;
    writes: number;
    stage: string;
  }>;
  t.is(results.length, 6);
  const expectedStages = { cancel: 'intro', close: 'idle', fail: 'error' };
  for (const result of results) {
    t.is(result.writes, 0, `${result.host}/${result.action} must not apply platform limits`);
    t.deepEqual(result.saved, result.before);
    t.is(result.stage, expectedStages[result.action]);
  }
});
