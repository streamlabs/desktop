import { IPlatformAuth } from 'services/platforms';
import type { UserService } from 'services/user';
import { getApiClient } from '../helpers/api-client';
import { click, focusMain } from '../helpers/modules/core';
import { test, useWebdriver } from '../helpers/webdriver/index';

useWebdriver({ skipOnboarding: false });

test('Startup first time / login', async t => {
  const client = t.context.app.client;
  await focusMain();

  const platform: IPlatformAuth = {
    apiToken: '',
    platform: {
      type: 'niconico',
      username: 'exampleuser',
      token: 'SomeToken',
      id: 'SomeId',
    },
  };

  // Wait for the auth screen to appear
  t.true(await client.$('[data-test="Connect"] [data-test="NiconicoSignup"]').isExisting());
  t.true(await client.$('[data-test="Connect"] [data-test="Skip"]').isExisting());

  const api = await getApiClient();
  const isOnboardingTest = true;
  await api.getResource<UserService>('UserService').testingFakeAuth(platform, isOnboardingTest);

  // This will only show up if OBS is installed
  if (await client.$('[data-test="ObsImport"]').isExisting()) {
    await click('[data-test="ObsImport"] [data-test="Skip"]');
  }

  t.true(await client.$('[data-test="Studio"]').isExisting());
});

test('Startup first time / skip', async t => {
  const client = t.context.app.client;
  await focusMain();

  // Wait for the auth screen to appear
  t.true(await client.$('[data-test="Connect"] [data-test="NiconicoSignup"]').isExisting());
  t.true(await client.$('[data-test="Connect"] [data-test="Skip"]').isExisting());
  await click('[data-test="Connect"] [data-test="Skip"]');

  // This will only show up if OBS is installed
  if (await client.$('[data-test="ObsImport"]').isExisting()) {
    await click('[data-test="ObsImport"] [data-test="Skip"]');
  }

  t.true(await client.$('[data-test="Studio"]').isExisting());
});
