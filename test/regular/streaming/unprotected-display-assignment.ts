import { test, useWebdriver } from '../../helpers/webdriver';
import {
  focusChild,
  focusMain,
  focusWindow,
  getClient,
  isDisplayed,
} from '../../helpers/modules/core';
import { submit } from '../../helpers/modules/streaming';

// This is the test harness, not a React hook.
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Unprotected Twitch Go Live ignores saved Dual Output destinations', async t => {
  // Simulate a non-Ultra account in the worker and Go Live renderer without login/API requests.
  for (const windowName of ['worker', 'child']) {
    t.true(await focusWindow(windowName));
    await getClient().execute(() => {
      const manager = (window as any).servicesManager;
      const user = manager.getResource('UserService');
      const twitch = manager.getResource('TwitchService');
      const originalState = Object.getOwnPropertyDescriptor(user, 'state');
      const originalFetchGame = twitch.fetchGame;
      // The category input fetches its thumbnail in the child renderer when mounted.
      twitch.fetchGame = () => Promise.resolve(undefined);
      Object.defineProperty(user, 'state', {
        configurable: true,
        value: {
          ...user.state,
          isPrime: false,
          loginValidated: true,
          auth: {
            primaryPlatform: 'twitch',
            widgetToken: 'synthetic',
            platforms: {
              twitch: { type: 'twitch', id: 'synthetic', username: 'synthetic' },
            },
          },
        },
      });
      (window as any).restoreDisplayAssignmentUser = () => {
        twitch.fetchGame = originalFetchGame;
        if (originalState) Object.defineProperty(user, 'state', originalState);
        else delete user.state;
      };
    });
  }

  try {
    t.true(await focusWindow('worker'));
    await getClient().execute(() => {
      const manager = (window as any).servicesManager;
      const streaming = manager.getResource('StreamingService');
      const twitch = manager.getResource('TwitchService');
      const originalGoLive = streaming.goLive;
      const originalPrepopulate = twitch.prepopulateInfo;
      (window as any).displayAssignmentGoLiveCalls = 0;
      // Stop at the service boundary after the real window's validation has run.
      streaming.goLive = () => {
        (window as any).displayAssignmentGoLiveCalls++;
        return Promise.resolve();
      };
      twitch.prepopulateInfo = () => Promise.resolve();
      twitch.UPDATE_STREAM_SETTINGS({
        title: 'Synthetic stream',
        game: 'Just Chatting',
        gameId: '509658',
        gameName: 'Just Chatting',
      });
      (window as any).restoreDisplayAssignmentMethods = () => {
        streaming.goLive = originalGoLive;
        twitch.prepopulateInfo = originalPrepopulate;
      };
      manager.getResource('StreamSettingsService').setSettings({
        protectedModeEnabled: false,
        streamType: 'rtmp_custom',
        server: 'rtmp://live.twitch.tv/app',
        key: 'synthetic-key',
        goLiveSettings: {
          platforms: { twitch: { enabled: true, display: 'vertical' } },
          customDestinations: [
            {
              name: 'Saved custom destination',
              url: 'rtmp://example.invalid/live',
              streamKey: 'synthetic-key',
              enabled: true,
              display: 'horizontal',
            },
          ],
          advancedMode: false,
        },
      });
      streaming.showGoLiveWindow();
    });

    await focusChild();
    await getClient().$('button=Confirm & Go Live').waitForDisplayed();
    t.false(await isDisplayed('h2=Destinations'), 'Protected-mode destination controls are hidden');
    await submit();
    t.false(await isDisplayed('[data-name="dual-output-info-alert"]'));
    t.true(await focusWindow('worker'));
    await getClient().waitUntil(
      async () =>
        (await getClient().execute(() => (window as any).displayAssignmentGoLiveCalls)) === 1,
      { timeout: 5000, timeoutMsg: 'The Go Live window should accept the single custom ingest' },
    );

    const result = await getClient().execute(() => {
      const manager = (window as any).servicesManager;
      const streaming = manager.getResource('StreamingService');
      const settings = manager.getResource('StreamSettingsService');
      manager.getResource('WindowsService').closeChildWindow();
      const saved = JSON.parse(JSON.stringify(settings.state.goLiveSettings));
      const unprotected = {
        valid: streaming.views.hasValidDisplayAssignment,
        dualOutput: streaming.views.isDualOutputMode,
      };
      settings.setSettings({ protectedModeEnabled: true });
      const protectedValid = streaming.views.hasValidDisplayAssignment;
      settings.setSettings({
        goLiveSettings: {
          ...saved,
          platforms: { twitch: { enabled: true, display: 'horizontal' } },
        },
      });
      const protectedInvalid = streaming.views.hasValidDisplayAssignment;
      settings.setSettings({ protectedModeEnabled: false, goLiveSettings: saved });
      return { unprotected, protectedValid, protectedInvalid, saved };
    });
    t.deepEqual(result.unprotected, { valid: true, dualOutput: false });
    t.true(result.protectedValid, 'Protected mode still accepts one destination per display');
    t.false(result.protectedInvalid, 'Protected mode still rejects two horizontal destinations');
    t.is(result.saved.platforms.twitch.display, 'vertical', 'Saved assignments must be preserved');
    t.true(result.saved.customDestinations[0].enabled);
  } finally {
    t.true(await focusWindow('worker'));
    await getClient().execute(() => {
      (window as any).servicesManager.getResource('WindowsService').closeChildWindow();
      (window as any).restoreDisplayAssignmentMethods?.();
      delete (window as any).restoreDisplayAssignmentMethods;
      delete (window as any).displayAssignmentGoLiveCalls;
    });
    for (const windowName of ['worker', 'child']) {
      await focusWindow(windowName);
      await getClient().execute(() => {
        (window as any).restoreDisplayAssignmentUser();
        delete (window as any).restoreDisplayAssignmentUser;
      });
    }
    await focusMain();
  }
});
