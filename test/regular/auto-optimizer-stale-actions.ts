import { test, useWebdriver } from '../helpers/webdriver';
import { focusWindow } from '../helpers/modules/core';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('closing Auto Optimizer waits for recommendation application and invalidates Apply', async t => {
  t.true(await focusWindow('worker'), 'worker window is available');

  const result = (await t.context.app.client.execute(`
    return (async () => {
      const service = window.servicesManager.getResource('AutoOptimizerService');
      const prototype = Object.getPrototypeOf(service);
      const mutations = prototype.originalMethods;
      let releaseApplication;
      const applicationBarrier = new Promise(resolve => {
        releaseApplication = resolve;
      });
      let cleanupCount = 0;
      let resetCount = 0;
      let promptState = 'unseen';

      const video = {
        baseWidth: 1280,
        baseHeight: 720,
        outputWidth: 1280,
        outputHeight: 720,
        fpsNum: 30,
        fpsDen: 1,
      };
      const output = {
        outputId: 'horizontal',
        display: 'horizontal',
        outputKind: 'twitch-enhanced-broadcasting',
        destinations: [{ platform: 'twitch' }],
        measurement: 'estimated',
        confidence: 'low',
        estimateReason: 'test',
        resolution: { width: 1280, height: 720 },
        fpsNum: 30,
        fpsDen: 1,
        fps: 30,
        bitrate: 0,
      };
      const state = {
        host: 'go-live',
        stage: 'review',
        phase: null,
        progress: 100,
        progressDetail: null,
        streamSetup: {
          type: 'enhanced-broadcasting',
          outputs: [
            {
              outputId: output.outputId,
              display: output.display,
              outputKind: output.outputKind,
              destinations: output.destinations,
              probeCandidates: [],
              measurement: output.measurement,
            },
          ],
        },
        result: {
          schemaVersion: 1,
          streamSetup: 'enhanced-broadcasting',
          status: 'complete',
          outputs: [output],
        },
        error: null,
        promptStates: {},
      };
      const context = {
        state,
        frozenStreamSettings: { marker: 'go-live-run' },
        pendingGoLiveProfile: null,
        nativeRun: null,
        runToken: 0,
        recommendationApplication: null,
        cleanupPromise: null,
        attemptContext: null,
        probeResources: null,
        outputSettingsService: {
          getSettings: () => ({
            mode: 'Simple',
            streaming: { bitrate: 2500, encoder: 'x264', encoderId: 'obs_x264' },
            recording: {},
            replayBuffer: {},
          }),
          setSettings() {
            throw new Error('Estimated Enhanced Broadcasting must not change Output settings');
          },
        },
        encoderQueryService: {},
        settingsService: {
          state: { Output: { type: 0, formData: [] } },
        },
        videoSettingsService: {
          state: { horizontal: { ...video }, vertical: { ...video } },
          contexts: {},
          async flushPendingCanvasSettings() {
            await applicationBarrier;
          },
          async applyAutoOptimizerSettings() {
            throw new Error('Estimated Enhanced Broadcasting must not change Video settings');
          },
        },
        SET_APPLYING() {
          mutations.SET_APPLYING.call({ state });
        },
        SET_ERROR(error) {
          mutations.SET_ERROR.call({ state }, error);
        },
        setPromptState(nextState) {
          promptState = nextState;
        },
        RESET_FLOW() {
          resetCount += 1;
          mutations.RESET_FLOW.call({ state });
        },
        waitForRecommendationApplication() {
          return prototype.waitForRecommendationApplication.call(context);
        },
        cleanupOptimizerRunIfCurrent(token) {
          return prototype.cleanupOptimizerRunIfCurrent.call(context, token);
        },
        cleanupOptimizerRun() {
          return prototype.cleanupOptimizerRun.call(context);
        },
        performOptimizerCleanup() {
          cleanupCount += 1;
          return Promise.resolve();
        },
        toError(error, fallbackCode, retryable) {
          return { code: fallbackCode, message: String(error), retryable };
        },
      };

      const applyPromise = prototype.applyRecommendations.call(context);
      const closePromise = prototype.closeFromHost.call(context, 'go-live');
      let closeSettled = false;
      void closePromise.then(() => {
        closeSettled = true;
      });
      await Promise.resolve();
      await Promise.resolve();
      const whileApplying = {
        closeSettled,
        cleanupCount,
        resetCount,
        stage: state.stage,
      };

      releaseApplication();
      const applied = await applyPromise;
      await closePromise;
      return {
        whileApplying,
        applied,
        cleanupCount,
        resetCount,
        promptState,
        stage: state.stage,
        pendingProfile: context.pendingGoLiveProfile,
        frozenSettingsWereCleared: context.frozenStreamSettings === null,
      };
    })();
  `)) as Record<string, any>;

  t.deepEqual(result.whileApplying, {
    closeSettled: false,
    cleanupCount: 0,
    resetCount: 0,
    stage: 'applying',
  });
  t.false(result.applied);
  t.is(result.cleanupCount, 1);
  t.is(result.resetCount, 1);
  t.is(result.promptState, 'unseen');
  t.is(result.stage, 'idle');
  t.is(result.pendingProfile, null);
  t.true(result.frozenSettingsWereCleared);
});

test('a stale Skip cannot mutate state after Close joins its cleanup', async t => {
  t.true(await focusWindow('worker'), 'worker window is available');

  const result = (await t.context.app.client.execute(`
    return (async () => {
      const service = window.servicesManager.getResource('AutoOptimizerService');
      const prototype = Object.getPrototypeOf(service);
      const mutations = prototype.originalMethods;
      let releaseCleanup;
      const cleanupBarrier = new Promise(resolve => {
        releaseCleanup = resolve;
      });
      let cleanupCount = 0;
      let resetCount = 0;
      let promptState = 'unseen';
      const state = {
        host: 'go-live',
        stage: 'review',
        phase: null,
        progress: 100,
        progressDetail: null,
        streamSetup: { type: 'standard', outputs: [] },
        result: null,
        error: null,
        promptStates: {},
      };
      const context = {
        state,
        frozenStreamSettings: { marker: 'go-live-run' },
        pendingGoLiveProfile: null,
        runToken: 0,
        recommendationApplication: null,
        cleanupPromise: null,
        SET_CANCELLING() {
          mutations.SET_CANCELLING.call({ state });
        },
        SET_ERROR(error) {
          mutations.SET_ERROR.call({ state }, error);
        },
        setPromptState(nextState) {
          promptState = nextState;
        },
        RESET_FLOW() {
          resetCount += 1;
          mutations.RESET_FLOW.call({ state });
        },
        waitForRecommendationApplication() {
          return prototype.waitForRecommendationApplication.call(context);
        },
        cleanupOptimizerRunIfCurrent(token) {
          return prototype.cleanupOptimizerRunIfCurrent.call(context, token);
        },
        cleanupOptimizerRun() {
          return prototype.cleanupOptimizerRun.call(context);
        },
        performOptimizerCleanup() {
          cleanupCount += 1;
          return cleanupBarrier;
        },
        toError(error, fallbackCode, retryable) {
          return { code: fallbackCode, message: String(error), retryable };
        },
      };

      const skipPromise = prototype.skipAndContinue.call(context);
      await Promise.resolve();
      await Promise.resolve();
      const closePromise = prototype.closeFromHost.call(context, 'go-live');
      await Promise.resolve();
      await Promise.resolve();
      const whileCleaning = { cleanupCount, resetCount, stage: state.stage };

      releaseCleanup();
      const skipped = await skipPromise;
      await closePromise;
      return {
        whileCleaning,
        skipped,
        cleanupCount,
        resetCount,
        promptState,
        stage: state.stage,
        frozenSettingsWereCleared: context.frozenStreamSettings === null,
      };
    })();
  `)) as Record<string, any>;

  t.deepEqual(result.whileCleaning, {
    cleanupCount: 1,
    resetCount: 0,
    stage: 'cancelling',
  });
  t.false(result.skipped);
  t.is(result.cleanupCount, 1);
  t.is(result.resetCount, 1);
  t.is(result.promptState, 'unseen');
  t.is(result.stage, 'idle');
  t.true(result.frozenSettingsWereCleared);
});
