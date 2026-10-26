import { test, useWebdriver } from '../../helpers/webdriver';
import { focusWindow, getClient, isDisplayed } from '../../helpers/modules/core';
import {
  removeCustomDestinations,
  showSettingsWindow,
} from '../../helpers/modules/settings/settings';
import { withUser } from '../../helpers/webdriver/user';

// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test(
  'Custom destination removal waits for each settings update',
  withUser('twitch', { prime: true }),
  async t => {
    t.true(await focusWindow('worker'));
    await getClient().execute(() => {
      (window as any).servicesManager.getResource('StreamSettingsService').setGoLiveSettings({
        customDestinations: Array.from({ length: 5 }, (_, index) => ({
          name: `Removal fixture ${index}`,
          url: 'rtmp://example.invalid/live',
          streamKey: 'synthetic-key',
          enabled: false,
        })),
      });
    });
    await showSettingsWindow('Stream');
    await getClient().$('span=Removal fixture 0').waitForDisplayed();
    t.true(await focusWindow('worker'));
    await getClient().execute(() => {
      const settings = (window as any).servicesManager.getResource('StreamSettingsService');
      const original = settings.setGoLiveSettings;
      const pending: Promise<unknown>[] = [];
      // Delay local settings writes so rapid clicks can reuse a stale list.
      settings.setGoLiveSettings = (value: unknown) => {
        const result = new Promise((resolve, reject) => {
          setTimeout(() => {
            Promise.resolve(original.call(settings, value)).then(resolve, reject);
          }, 750);
        });
        pending.push(result);
        return result;
      };
      (window as any).finishDestinationWrites = () =>
        Promise.all(pending).then(() => pending.length);
      (window as any).restoreDestinationWrites = () => {
        settings.setGoLiveSettings = original;
        delete (window as any).finishDestinationWrites;
        delete (window as any).restoreDestinationWrites;
      };
    });
    t.true(await focusWindow('child'));
    try {
      await removeCustomDestinations();
      t.true(await focusWindow('worker'));
      const writes = await getClient().executeAsync((done: Function) => {
        (window as any).finishDestinationWrites().then(done);
      });
      t.is(writes, 5, 'The delayed worker must receive each deletion');
      t.true(await focusWindow('child'));
      t.false(await isDisplayed('i.fa-trash'), 'All five destination removals should complete');
      t.true(await focusWindow('worker'));
      t.deepEqual(
        await getClient().execute(
          () =>
            (window as any).servicesManager.getResource('StreamingService').views.savedSettings
              .customDestinations,
        ),
        [],
      );
    } finally {
      await focusWindow('worker');
      await getClient().executeAsync((done: Function) => {
        (window as any).finishDestinationWrites().then(() => {
          (window as any).restoreDestinationWrites();
          done(true);
        });
      });
    }
  },
);
