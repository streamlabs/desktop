import { test, useWebdriver } from '../../helpers/webdriver';
import { closeWindow, focusChild, getClient } from '../../helpers/modules/core';
import { showSettingsWindow } from '../../helpers/modules/settings/settings';

// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Settings navigation waits for delayed categories before selecting Stream', async t => {
  await focusChild();
  const client = getClient();
  await client.execute(() => {
    const fixture = { delayed: false, released: false, restore: () => {} };
    const observer = new MutationObserver(() => {
      const items = Array.from(
        document.querySelectorAll('[data-name="settings-nav-item"]'),
      ) as HTMLElement[];
      if (!items.length) return;
      observer.disconnect();
      fixture.delayed = true;
      items.forEach(item => {
        item.style.visibility = 'hidden';
      });
      // Settings can become interactive after the shared click helper's three-second deadline.
      const timer = window.setTimeout(() => {
        items.forEach(item => {
          item.style.visibility = '';
        });
        fixture.released = true;
      }, 6000);
      fixture.restore = () => {
        window.clearTimeout(timer);
        items.forEach(item => {
          item.style.visibility = '';
        });
      };
    });
    observer.observe(document.body, { childList: true, subtree: true });
    (window as any).__settingsWindowFixture = {
      state: fixture,
      restore() {
        observer.disconnect();
        fixture.restore();
      },
    };
  });

  try {
    await showSettingsWindow('Stream', async () => {
      await client.waitUntil(
        () =>
          client.execute(
            () =>
              (window as any).servicesManager.getResource('NavigationService').state
                .currentSettingsTab === 'Stream',
          ),
        { timeout: 10000, timeoutMsg: 'Settings did not select the Stream category' },
      );
      t.deepEqual(
        await client.execute(() => {
          const fixture = (window as any).__settingsWindowFixture.state;
          return { delayed: fixture.delayed, released: fixture.released };
        }),
        { delayed: true, released: true },
      );
    });
  } finally {
    await focusChild();
    await client.execute(() => {
      (window as any).__settingsWindowFixture.restore();
      delete (window as any).__settingsWindowFixture;
    });
    await closeWindow('child');
  }
});
