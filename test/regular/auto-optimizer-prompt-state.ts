import { test, useWebdriver } from '../helpers/webdriver';
import { focusWindow } from '../helpers/modules/core';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('resetting the Auto Optimizer prompt is identity-scoped and idle-only', async t => {
  t.true(await focusWindow('worker'), 'worker window is available');

  const result = (await t.context.app.client.execute(`
    return (() => {
      const service = window.servicesManager.getResource('AutoConfigService');
      const prototype = Object.getPrototypeOf(service);
      const resetPromptState = prototype.resetPromptState;
      const resetPromptStateMutation = prototype.originalMethods.RESET_PROMPT_STATE;

      function run(stage) {
        const state = {
          stage,
          promptStates: {
            'account:current': 'completed',
            'account:other': 'declined',
          },
        };
        const context = {
          userService: { isLoggedIn: true },
          state,
          getIdentityKey: () => 'account:current',
          RESET_PROMPT_STATE(identity) {
            resetPromptStateMutation.call({ state }, identity);
          },
        };

        return {
          accepted: resetPromptState.call(context),
          promptStates: state.promptStates,
        };
      }

      return {
        idle: run('idle'),
        running: run('running'),
      };
    })();
  `)) as {
    idle: { accepted: boolean; promptStates: Record<string, string> };
    running: { accepted: boolean; promptStates: Record<string, string> };
  };

  t.true(result.idle.accepted);
  t.deepEqual(result.idle.promptStates, { 'account:other': 'declined' });
  t.false(result.running.accepted);
  t.deepEqual(result.running.promptStates, {
    'account:current': 'completed',
    'account:other': 'declined',
  });
});

test('initializing Auto Optimizer restores prompt history without mutating flow state', async t => {
  t.true(await focusWindow('worker'), 'worker window is available');

  const result = (await t.context.app.client.execute(`
    return (() => {
      const service = window.servicesManager.getResource('AutoConfigService');
      const Service = service.constructor;
      const prototype = Object.getPrototypeOf(service);
      const storageKey = Service.localStorageKey;
      const persistedState = localStorage.getItem(storageKey);

      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            stage: 'running',
            phase: 'bandwidth',
            progress: 63,
            progressDetail: { code: 'testing' },
            topology: { kind: 'standard' },
            result: { profile: 'stale' },
            error: { code: 'stale_error' },
            promptStates: {
              'account:current': 'completed',
              'account:other': 'declined',
            },
          }),
        );

        const state = Service.initialState;
        let watchCount = 0;
        let resetCount = 0;
        const context = {
          constructor: Service,
          state,
          store: {
            watch() {
              watchCount += 1;
            },
          },
          RESET_FLOW() {
            resetCount += 1;
          },
        };

        prototype.init.call(context);

        return {
          flowState: {
            stage: state.stage,
            phase: state.phase,
            progress: state.progress,
            progressDetail: state.progressDetail,
            topology: state.topology,
            result: state.result,
            error: state.error,
          },
          promptStates: state.promptStates,
          watchCount,
          resetCount,
        };
      } finally {
        if (persistedState == null) localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, persistedState);
      }
    })();
  `)) as {
    flowState: {
      stage: string;
      phase: string | null;
      progress: number;
      progressDetail: unknown;
      topology: unknown;
      result: unknown;
      error: unknown;
    };
    promptStates: Record<string, string>;
    watchCount: number;
    resetCount: number;
  };

  t.deepEqual(result.flowState, {
    stage: 'idle',
    phase: null,
    progress: 0,
    progressDetail: null,
    topology: null,
    result: null,
    error: null,
  });
  t.deepEqual(result.promptStates, {
    'account:current': 'completed',
    'account:other': 'declined',
  });
  t.is(result.watchCount, 1);
  t.is(result.resetCount, 0);
});
