import { test, useWebdriver } from '../../helpers/webdriver';
import { closeWindow, focusChild, focusMain, getClient } from '../../helpers/modules/core';
import { addSource, clickRemoveSource } from '../../helpers/modules/sources';
import { getApiClient } from '../../helpers/api-client';
import { SourcesService } from '../../../app/services/api/external-api/sources';

// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Source creation waits for a delayed naming form and still creates a new source', async t => {
  await focusChild();
  const client = getClient();
  await client.execute(() => {
    const fixture = { delayed: false, released: false, observer: null as MutationObserver | null };
    (window as any).__sourceDialogFixture = fixture;
    fixture.observer = new MutationObserver(() => {
      const form = document.querySelector('[data-name="addNewSourceForm"]') as HTMLElement;
      if (!form) return;
      fixture.observer.disconnect();
      fixture.delayed = true;
      form.style.visibility = 'hidden';
      setTimeout(() => {
        form.style.visibility = '';
        fixture.released = true;
      }, 750);
    });
    fixture.observer.observe(document.body, { childList: true, subtree: true });
  });

  const names = ['Delayed naming source', 'Second new source'];
  const sources = (await getApiClient()).getResource<SourcesService>('SourcesService');
  try {
    await addSource('Color Block', names[0]);
    await focusChild();
    t.deepEqual(
      await client.execute(() => {
        const fixture = (window as any).__sourceDialogFixture;
        return { delayed: fixture.delayed, released: fixture.released };
      }),
      { delayed: true, released: true },
    );

    // With one source present the dialog offers reuse; the helper must choose new instead.
    await addSource('Color Block', names[1]);
    const first = sources.getSourcesByName(names[0])[0];
    const second = sources.getSourcesByName(names[1])[0];
    t.is(first.type, 'color_source');
    t.is(second.type, 'color_source');
    t.not(first.sourceId, second.sourceId);
  } finally {
    await closeWindow('child');
    await focusMain();
    for (const name of names.slice().reverse()) {
      if (sources.getSourcesByName(name).length) await clickRemoveSource(name);
    }
    await focusChild();
    await client.execute(() => {
      (window as any).__sourceDialogFixture?.observer.disconnect();
      delete (window as any).__sourceDialogFixture;
    });
  }
});
