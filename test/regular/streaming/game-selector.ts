import { test, useWebdriver } from '../../helpers/webdriver';
import { click, focusChild, focusMain, focusWindow, getClient } from '../../helpers/modules/core';
import { submit } from '../../helpers/modules/streaming';

// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Twitch category selection submits the selected ID when search labels are duplicated', async t => {
  const client = getClient();
  try {
    // Keep the real Go Live form and category selector, with synthetic account/API responses.
    for (const windowName of ['worker', 'child']) {
      t.true(await focusWindow(windowName));
      await client.execute(() => {
        const manager = (window as any).servicesManager;
        const user = manager.getResource('UserService');
        const twitch = manager.getResource('TwitchService');
        const originalState = Object.getOwnPropertyDescriptor(user, 'state');
        const originalFetchGame = twitch.fetchGame;
        const originalSearchGames = twitch.searchGames;
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
        twitch.fetchGame = () => Promise.resolve(undefined);
        twitch.searchGames = () =>
          Promise.resolve([
            { id: '111', name: 'Same category' },
            { id: '222', name: 'Same category' },
          ]);
        (window as any).restoreGameSelectorFixture = () => {
          twitch.fetchGame = originalFetchGame;
          twitch.searchGames = originalSearchGames;
          if (originalState) Object.defineProperty(user, 'state', originalState);
          else delete user.state;
        };
      });
    }

    t.true(await focusWindow('worker'));
    await client.execute(() => {
      const manager = (window as any).servicesManager;
      const streaming = manager.getResource('StreamingService');
      const twitch = manager.getResource('TwitchService');
      const originalGoLive = streaming.goLive;
      const originalPrepopulate = twitch.prepopulateInfo;
      // Capture the real form submission without starting an output or contacting Twitch.
      (window as any).gameSelectorSubmissions = [];
      streaming.goLive = (settings: any) => {
        (window as any).gameSelectorSubmissions.push(settings.platforms.twitch);
        return Promise.resolve();
      };
      twitch.prepopulateInfo = () => Promise.resolve();
      twitch.UPDATE_STREAM_SETTINGS({
        title: 'Category selection regression',
        game: 'Initial category',
        gameId: '333',
        gameName: 'Initial category',
      });
      manager.getResource('StreamSettingsService').setSettings({
        protectedModeEnabled: false,
        streamType: 'rtmp_custom',
        server: 'rtmp://example.invalid/live',
        key: 'synthetic-key',
      });
      (window as any).restoreGameSelectorSubmission = () => {
        streaming.goLive = originalGoLive;
        twitch.prepopulateInfo = originalPrepopulate;
      };
      streaming.showGoLiveWindow();
    });

    await focusChild();
    await client.$('button=Confirm & Go Live').waitForDisplayed({ timeout: 10000 });
    const search = await client.$('[data-name="twitchGame"] input');
    await search.setValue('Same category');
    const secondOption = '[data-option-list="twitchGame"][data-option-value="222"]';
    await client.$(secondOption).waitForClickable({ timeout: 10000 });
    t.is(
      (await client.$$('[data-option-list="twitchGame"][data-option-label="Same category"]'))
        .length,
      2,
      'The search results must contain two distinct IDs with the same label',
    );
    await click(secondOption);
    await submit();

    t.true(await focusWindow('worker'));
    await client.waitUntil(
      () => client.execute(() => (window as any).gameSelectorSubmissions.length > 0),
      { timeout: 10000, timeoutMsg: 'The Go Live form did not submit the selected category' },
    );
    const result = await client.execute(() => {
      const submissions = (window as any).gameSelectorSubmissions;
      const { game, gameId, gameName } = submissions[0];
      return {
        submissions: submissions.length,
        game,
        gameId,
        gameName,
        savedId: (window as any).servicesManager.getResource('TwitchService').state.settings.gameId,
      };
    });
    t.deepEqual(result, {
      submissions: 1,
      game: '222',
      gameId: '222',
      gameName: 'Same category',
      savedId: '222',
    });
  } finally {
    await focusWindow('worker');
    await client.execute(() => {
      (window as any).servicesManager.getResource('WindowsService').closeChildWindow();
      (window as any).restoreGameSelectorSubmission?.();
      delete (window as any).restoreGameSelectorSubmission;
      delete (window as any).gameSelectorSubmissions;
    });
    for (const windowName of ['worker', 'child']) {
      await focusWindow(windowName);
      await client.execute(() => {
        (window as any).restoreGameSelectorFixture?.();
        delete (window as any).restoreGameSelectorFixture;
      });
    }
    await focusMain();
  }
});
