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
