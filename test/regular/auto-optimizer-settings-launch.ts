import { test, useWebdriver } from '../helpers/webdriver';
import { focusWindow } from '../helpers/modules/core';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Settings launch enforces runtime eligibility and owns the opened flow', async t => {
  t.true(await focusWindow('worker'), 'worker window is available');

  const result = (await t.context.app.client.execute(`
    return (() => {
      const service = window.servicesManager.getResource('AutoConfigService');
      const prototype = Object.getPrototypeOf(service);
      const openFromSettings = prototype.openFromSettings;

      function run(options = {}) {
        let initialization = null;
        let startCount = 0;
        const context = {
          state: { stage: options.stage || 'idle' },
          userService: { isLoggedIn: options.loggedIn !== false },
          streamingService: {
            views: {
              isIdle: options.outputIdle !== false,
              isReplayBufferActive: options.replayBufferActive === true,
              savedSettings: { platforms: {}, customDestinations: [], marker: 'saved' },
            },
          },
          settingsService: { views: { hasHDRSettings: options.hdr === true } },
          pendingGoLiveProfile: { marker: 'stale' },
          cloneStreamSettings(settings) {
            return { ...settings, cloned: true };
          },
          initializeFlow(settings, host) {
            initialization = { settings, host };
            return options.initializationResult || 'opened';
          },
          startOptimization() {
            startCount += 1;
          },
        };

        const launchResult = openFromSettings.call(context);
        return {
          launchResult,
          initialization,
          startCount,
          pendingProfileWasCleared: context.pendingGoLiveProfile === null,
        };
      }

      const viewsPrototype = Object.getPrototypeOf(service.views);
      const isOpenFor = viewsPrototype.isOpenFor;
      return {
        busy: run({ stage: 'running' }),
        loggedOut: run({ loggedIn: false }),
        streaming: run({ outputIdle: false }),
        replayBuffer: run({ replayBufferActive: true }),
        hdr: run({ hdr: true }),
        noDestinations: run({ initializationResult: 'no-destinations' }),
        opened: run(),
        hostViews: {
          settings: isOpenFor.call(
            { isOpen: true, state: { stage: 'intro', host: 'settings' } },
            'settings',
          ),
          notGoLive: isOpenFor.call(
            { isOpen: true, state: { stage: 'intro', host: 'settings' } },
            'go-live',
          ),
          notIdle: isOpenFor.call(
            { isOpen: false, state: { stage: 'idle', host: 'settings' } },
            'settings',
          ),
        },
      };
    })();
  `)) as Record<string, any>;

  t.is(result.busy.launchResult, 'busy');
  t.is(result.loggedOut.launchResult, 'not-logged-in');
  t.is(result.streaming.launchResult, 'output-active');
  t.is(result.replayBuffer.launchResult, 'output-active');
  t.is(result.hdr.launchResult, 'hdr');
  t.is(result.noDestinations.launchResult, 'no-destinations');
  t.is(result.noDestinations.startCount, 0);

  t.is(result.opened.launchResult, 'opened');
  t.deepEqual(result.opened.initialization, {
    settings: {
      platforms: {},
      customDestinations: [],
      marker: 'saved',
      cloned: true,
    },
    host: 'settings',
  });
  t.is(result.opened.startCount, 1);
  t.true(result.opened.pendingProfileWasCleared);
  t.deepEqual(result.hostViews, {
    settings: true,
    notGoLive: false,
    notIdle: false,
  });
});

test('applying from Settings completes the shared prompt and retains a Go Live profile', async t => {
  t.true(await focusWindow('worker'), 'worker window is available');

  const result = (await t.context.app.client.execute(`
    return (async () => {
      const service = window.servicesManager.getResource('AutoConfigService');
      const prototype = Object.getPrototypeOf(service);
      const mutations = prototype.originalMethods;
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
      const optimizerResult = {
        schemaVersion: 1,
        streamSetup: 'enhanced-broadcasting',
        status: 'complete',
        outputs: [output],
      };
      const streamSetup = {
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
      };
      const video = {
        baseWidth: 1280,
        baseHeight: 720,
        outputWidth: 1280,
        outputHeight: 720,
        fpsNum: 30,
        fpsDen: 1,
      };
      const state = {
        host: 'settings',
        stage: 'review',
        phase: null,
        progress: 100,
        progressDetail: null,
        streamSetup,
        result: optimizerResult,
        error: null,
        promptStates: { 'account:other': 'declined' },
      };
      const context = {
        state,
        frozenStreamSettings: { marker: 'settings-run' },
        pendingGoLiveProfile: null,
        runToken: 0,
        userService: { isLoggedIn: true },
        dualOutputService: { state: { dualOutputMode: false } },
        twitchService: { views: { hasTwitchDualStreamAccess: false } },
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
          views: { hasHDRSettings: false },
        },
        videoSettingsService: {
          state: { horizontal: { ...video }, vertical: { ...video } },
          contexts: {},
          async flushPendingCanvasSettings() {},
          async applyAutoOptimizerSettings() {
            throw new Error('Estimated Enhanced Broadcasting must not change Video settings');
          },
        },
        SET_APPLYING() {
          mutations.SET_APPLYING.call({ state });
        },
        setPromptState(promptState) {
          mutations.SET_PROMPT_STATE.call({ state }, 'account:current', promptState);
        },
        RESET_FLOW() {
          mutations.RESET_FLOW.call({ state });
        },
        cloneStreamSettings(settings) {
          return settings;
        },
        getPromptState() {
          return state.promptStates['account:current'] || 'unseen';
        },
        initializeFlow() {
          throw new Error('A completed Settings run must not reopen Auto Optimizer');
        },
      };

      const applied = await prototype.applyRecommendations.call(context);
      const settings = {
        platforms: {
          twitch: {
            enabled: true,
            useCustomFields: false,
            display: 'horizontal',
            isEnhancedBroadcasting: true,
          },
        },
        customDestinations: [],
        advancedMode: false,
        recording: 'horizontal',
        enhancedBroadcasting: true,
      };
      const intercepted = await prototype.interceptGoLive.call(context, settings);
      const pendingProfileWasPreserved = context.pendingGoLiveProfile !== null;
      const consumedProfile = prototype.consumePendingGoLiveProfile.call(context, settings);
      return {
        applied,
        intercepted,
        state,
        frozenSettingsWereCleared: context.frozenStreamSettings === null,
        pendingProfileWasPreserved,
        consumedProfile,
        pendingProfileWasConsumed: context.pendingGoLiveProfile === null,
      };
    })();
  `)) as {
    applied: boolean;
    intercepted: boolean;
    state: Record<string, any>;
    frozenSettingsWereCleared: boolean;
    pendingProfileWasPreserved: boolean;
    consumedProfile: Record<string, any>;
    pendingProfileWasConsumed: boolean;
  };

  t.true(result.applied);
  t.false(result.intercepted);
  t.true(result.frozenSettingsWereCleared);
  t.is(result.state.stage, 'idle');
  t.is(result.state.host, null);
  t.is(result.state.promptStates['account:current'], 'completed');
  t.is(result.state.promptStates['account:other'], 'declined');
  t.true(result.pendingProfileWasPreserved);
  t.true(result.pendingProfileWasConsumed);
  t.deepEqual(result.consumedProfile, {
    schemaVersion: 1,
    streamSetup: 'enhanced-broadcasting',
    outputs: [
      {
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
      },
    ],
  });
});
