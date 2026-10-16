import { test, useWebdriver } from '../../helpers/webdriver';
import { click, clickButton, focusMain, focusWindow, getClient } from '../../helpers/modules/core';

// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

async function prepareThemes() {
  await focusWindow('worker');
  await getClient().execute(() => {
    const manager = (window as any).servicesManager;
    const onboarding = manager.getResource('OnboardingService');
    const collections = manager.getResource('SceneCollectionsService');
    const originalFetch = onboarding.fetchThemeData;
    const originalInstall = collections.installOverlay;
    const fixture = {
      pending: [] as {
        id: string;
        resolve: (value: any) => void;
        reject: (error: Error) => void;
      }[],
      requested: [] as string[],
      installed: [] as { url: string; name: string }[],
      restore() {
        onboarding.fetchThemeData = originalFetch;
        collections.installOverlay = originalInstall;
      },
    };
    onboarding.fetchThemeData = (id: string) => {
      fixture.requested.push(id);
      return new Promise((resolve, reject) => fixture.pending.push({ id, resolve, reject }));
    };
    collections.installOverlay = (url: string, name: string) => {
      fixture.installed.push({ url, name });
      return Promise.resolve();
    };
    (window as any).__themesFixture = fixture;
  });
  await focusMain();
  await getClient().execute(() => {
    const errors: string[] = [];
    const onError = (event: ErrorEvent) => errors.push(event.message);
    const onRejection = (event: PromiseRejectionEvent) => errors.push(String(event.reason));
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    (window as any).__themesErrors = {
      errors,
      restore() {
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onRejection);
      },
    };
  });
}

async function openThemes() {
  await focusWindow('worker');
  await getClient().execute(() => {
    (window as any).servicesManager.getResource('OnboardingV2Service').initalizeView({
      startingStep: { name: 'Themes', isSkippable: true },
      isSingleton: true,
    });
  });
  await getClient().waitUntil(
    () => getClient().execute(() => (window as any).__themesFixture.pending.length === 7),
    { timeout: 10000, timeoutMsg: 'The free overlay metadata requests were not started' },
  );
  await focusMain();
  await getClient().$('h1=Choose Your Overlay').waitForDisplayed({ timeout: 10000 });
}

async function settleRequests(fail = false) {
  await focusWindow('worker');
  await getClient().waitUntil(
    () => getClient().execute(() => (window as any).__themesFixture.pending.length === 7),
    { timeout: 10000, timeoutMsg: 'The overlay metadata requests were not ready to settle' },
  );
  await getClient().execute((rejectOne: boolean) => {
    // Resolve in reverse order to verify that carousel previews still match their themes.
    const pending = (window as any).__themesFixture.pending.splice(0).reverse();
    pending.forEach(({ id, resolve, reject }: any, index: number) => {
      if (rejectOne && index === 0) {
        reject(new Error('Synthetic overlay metadata failure'));
        return;
      }
      const image = `data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7#${id}`;
      resolve({
        data: {
          id: Number(id),
          name: `Overlay ${id}`,
          preview_images: [image],
          custom_images: { start: image },
          overlay_type: 'static',
          designer: { name: 'Test designer', avatar: image },
        },
      });
    });
  }, fail);
  await focusMain();
}

async function cleanup() {
  await focusWindow('worker');
  await getClient().execute(() => {
    const onboarding = (window as any).servicesManager.getResource('OnboardingV2Service');
    if (onboarding.state.showOnboarding) onboarding.closeOnboarding();
    (window as any).__themesFixture?.restore();
    delete (window as any).__themesFixture;
  });
  await focusMain();
  await getClient().execute(() => {
    (window as any).__themesErrors?.restore();
    delete (window as any).__themesErrors;
  });
}

test('Onboarding themes handle metadata failure and recover on retry', async t => {
  const client = getClient();
  await prepareThemes();
  try {
    await openThemes();
    await settleRequests(true);
    const error = await client.$('[role="alert"]');
    await error.waitForDisplayed({ timeout: 10000 });
    t.is(await error.getText(), 'Unable to load overlays. Please try again.');
    t.is((await client.$$('.ant-carousel')).length, 0);
    t.deepEqual(await client.execute(() => (window as any).__themesErrors.errors), []);

    await clickButton('Retry');
    await client.$('[role="alert"]').waitForExist({ reverse: true, timeout: 10000 });
    t.is(
      (await client.$$('.ant-carousel')).length,
      0,
      'Do not render missing metadata during retry',
    );
    await settleRequests();
    await client.$('.ant-carousel').waitForDisplayed({ timeout: 10000 });
    const previews = await client.execute(() => ({
      names: Array.from(document.querySelectorAll('.slick-slide:not(.slick-cloned) h1')).map(
        el => el.textContent,
      ),
      thumbnails: Array.from(document.querySelectorAll('.slick-dots img')).map(
        el => (el as HTMLImageElement).src.split('#')[1],
      ),
    }));
    const ids = ['515', '1142', '2574', '2592', '2624', '2979', '3216'];
    t.deepEqual(
      previews.names,
      ids.map(id => `Overlay ${id}`),
    );
    t.deepEqual(previews.thumbnails, ids);

    await click('.slick-slide.slick-active:not(.slick-cloned) button');
    await client.$('h1=Choose Your Overlay').waitForDisplayed({ reverse: true, timeout: 10000 });
    t.deepEqual(await client.execute(() => (window as any).__themesErrors.errors), []);
    await focusWindow('worker');
    const result = await client.execute(() => {
      const fixture = (window as any).__themesFixture;
      return { requested: fixture.requested, installed: fixture.installed };
    });
    t.deepEqual(result.requested, [...ids, ...ids]);
    t.is(result.installed.length, 1);
    t.is(result.installed[0].name, 'Overlay 515');
    t.true(result.installed[0].url.endsWith('/45547fa.overlay'));
  } finally {
    await cleanup();
  }
});

test('Onboarding themes handle rejection after closing and allow finishing after failure', async t => {
  const client = getClient();
  await prepareThemes();
  try {
    await openThemes();
    await clickButton('Finish');
    await client.$('h1=Choose Your Overlay').waitForDisplayed({ reverse: true, timeout: 10000 });
    await settleRequests(true);
    // A new mount must handle its own failure even after the previous request rejected late.
    await openThemes();
    await settleRequests(true);
    await client.$('[role="alert"]').waitForDisplayed({ timeout: 10000 });
    await clickButton('Finish');
    await client.$('h1=Choose Your Overlay').waitForDisplayed({ reverse: true, timeout: 10000 });
    t.deepEqual(await client.execute(() => (window as any).__themesErrors.errors), []);
  } finally {
    await cleanup();
  }
});
