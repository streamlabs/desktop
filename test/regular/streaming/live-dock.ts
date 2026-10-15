import { test, useWebdriver } from '../../helpers/webdriver';
import { focusMain, focusWindow, getClient, isDisplayed } from '../../helpers/modules/core';

// This is the test harness, not a React hook.
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Expanded Live Dock handles unprotected destinations without a linked platform', async t => {
  await focusMain();
  await getClient().execute(() => {
    const manager = (window as any).servicesManager;
    const user = manager.getResource('UserService');
    const originalState = Object.getOwnPropertyDescriptor(user, 'state');
    // Only the main renderer needs an account to mount the dock. Avoid account
    // requests and login side effects in the worker; all credentials are synthetic.
    Object.defineProperty(user, 'state', {
      configurable: true,
      value: {
        ...user.state,
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
    (window as any).restoreLiveDockUser = () => {
      if (originalState) Object.defineProperty(user, 'state', originalState);
      else delete user.state;
    };
  });

  try {
    for (const destination of [
      { streamType: 'rtmp_common', platform: 'youtube' },
      { streamType: 'rtmp_custom', server: 'rtmp://example.invalid/live' },
    ]) {
      t.true(await focusWindow('worker'));
      await getClient().execute(destination => {
        const manager = (window as any).servicesManager;
        manager.getResource('StreamSettingsService').setSettings({
          ...destination,
          protectedModeEnabled: false,
          key: 'synthetic-key',
        });
        manager.getResource('CustomizationService').setSettings({ livedockCollapsed: false });
      }, destination);
      await focusMain();
      await getClient().$('span=Your chat is currently offline').waitForDisplayed();
      t.true(await isDisplayed('span=Offline'), 'The expanded dock should render its header');
      t.false(await isDisplayed('a=Refresh Chat'), 'No linked-platform chat should be mounted');
      t.deepEqual(
        await getClient().execute(
          () =>
            (window as any).servicesManager.getResource('StreamingService').views.enabledPlatforms,
        ),
        [],
        'The fallback must work without inventing an enabled platform',
      );
    }
  } finally {
    await focusMain();
    await getClient().execute(() => {
      (window as any).restoreLiveDockUser();
      delete (window as any).restoreLiveDockUser;
    });
  }
});
