import { test, TExecutionContext, useWebdriver } from '../helpers/webdriver';
import { logIn, withPoolUser } from '../helpers/webdriver/user';
import { sleep } from '../helpers/sleep';
import {
  click,
  clickIfDisplayed,
  clickWhenDisplayed,
  focusMain,
  isDisplayed,
  getNumElements,
  waitForDisplayed,
} from '../helpers/modules/core';
import { getApiClient } from '../helpers/api-client';
import { ScenesService } from '../../app/services/api/external-api/scenes';

/**
 * Testing default sources for onboarding and new users
 * @remark New users on their first login have special handling. To optimize testing,
 * some of the cases are tested within existing tests.
 *
 * CASE 1: Old user logged in during onboarding, no theme installed (Go through onboarding)
 * CASE 2: Old user logged in during onboarding, theme installed (Go through onboarding and install theme)
 * CASE 3: New user logged in during onboarding, no theme installed (Go through onboarding as a new user)
 * CASE 4: New user logged in during onboarding, theme installed (Go through onboarding as a new user and install theme)
 * CASE 5: No user logged in during onboarding, no theme installed, then log in new user (Login new user after onboarding skipped)
 * CASE 6: No user logged in during onboarding, theme installed, then log in new user (Login new user after onboarding skipped and theme installed)
 * CASE 7: No user logged in during onboarding, no theme installed, then log in an old user (Scene-collections cloud-backup) <- tested in the cloud-backup test
 */

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver({ skipOnboarding: false, noSync: true });

async function confirmDefaultSources(t: TExecutionContext, hasDefaultSources = true) {
  const api = await getApiClient();
  const scenesService = api.getResource<ScenesService>('ScenesService');
  const defaultSources = ['Game Capture', 'Webcam', 'Alert Box'];
  const numDefaultSources = defaultSources.length;

  const numSceneItems = scenesService.activeScene
    .getItems()
    .map(item => item.getModel())
    .reduce((sources, item) => {
      // only track number of sources that should be
      if (sources[item.sourceId] && defaultSources.includes(item.name)) {
        sources[item.sourceId] += 1;
      } else {
        sources[item.sourceId] = 1;
      }
      return sources;
    }, {} as { [sourceId: string]: number });

  if (hasDefaultSources) {
    // confirm this is a single output scene collection by confirming that each source
    // is only used by a single scene item. This is because dual output scene collection
    // scene items share a single source.
    for (const [sourceId, count] of Object.entries(numSceneItems)) {
      t.is(count, 1, `Scene has only once scene item with source ${sourceId}`);
    }

    t.is(Object.keys(numSceneItems).length, numDefaultSources, 'Scene has correct default sources');
  } else {
    // overlays installed during onboarding should have default sources more or less sources than the defaults
    const numDefaultSources = Object.keys(numSceneItems).filter(
      name => defaultSources.includes(name) && numSceneItems[name] > 1,
    ).length;

    t.not(Object.keys(numSceneItems).length, numDefaultSources, 'Scene has no default sources');
  }
}

/*
 * Helper function to go through the onboarding flow through the login step
 * @remark This function is a simplification of the `Go through onboarding` test
 * @param t - Test execution context
 * @param installTheme - Whether to install a theme during onboarding
 * @param fn - Function to run after onboarding is complete
 */
async function goThroughOnboarding(
  t: TExecutionContext,
  login = false,
  newUser = false,
  installTheme = false,
  fn: () => Promise<void>,
) {
  await focusMain();

  // TODO: This page is no longer shown in the new onboarding flow. We should remove this.
  if (!(await isDisplayed('h2=Live Streaming'))) return;
  await clickWhenDisplayed('a=Log In', { timeout: 5000 });

  // Complete login
  if (login) {
    await isDisplayed('button=Twitch');
    const user = await logIn(t, 'twitch', { prime: false }, false, true, newUser);
    await sleep(1000);

    // We seem to skip the login step after login internally
    await clickIfDisplayed('button=Skip');

    // Finish onboarding flow
    await withPoolUser(user, async () => {
      await finishOnboarding(installTheme);
      await fn();
    });
  } else {
    // skip login
    await clickIfDisplayed('button=Skip');
    await finishOnboarding(installTheme);
    await fn();
  }

  t.pass();
}

/*
 * Helper function to go through the onboarding flow from the login step to the end
 * @param installTheme - Whether to install a theme during onboarding
 */
async function finishOnboarding(installTheme = false) {
  // Skip hardware config
  await waitForDisplayed('h1=Set Up Your Mic & Webcam');
  await clickIfDisplayed('button=Skip');

  // Theme install
  if (installTheme) {
    await waitForDisplayed('h1=Add your first theme');
    await clickWhenDisplayed('button=Install');
    await waitForDisplayed('span=100%');
  } else {
    await waitForDisplayed('h1=Add your first theme');
    await clickIfDisplayed('button=Skip');
  }

  // Skip purchasing prime
  await clickWhenDisplayed('div[data-testid=choose-free-plan-btn]', { timeout: 60000 });

  await isDisplayed('span=Sources');
}

// CASE 1: Old user logged in during onboarding, no theme installed
test('Go through onboarding', async t => {
  await focusMain();

  if (!(await isDisplayed('h1=Welcome to Streamlabs Desktop'))) {
    t.fail('Onboarding welcome page not shown');
    return;
  }
  // Click on Login on the signup page, then wait for the auth screen to appear
  await clickWhenDisplayed('a=Log In', { timeout: 5000 });

  // Signup page
  t.true(await isDisplayed('h1=Log In'), 'Shows login page by default');
  t.true(
    await isDisplayed('button*=Log in with Streamlabs ID'),
    'Has a log in with Streamlabs ID button',
  );
  // "Or log in with a platform" is a <span>, not a <button>
  t.true(
    await isDisplayed('span=Or log in with a platform'),
    'Has an "Or log in with a platform" label',
  );

  t.true(await isDisplayed('button=Twitch'), 'Shows Twitch button');
  t.true(await isDisplayed('button=YouTube'), 'Shows YouTube button');
  t.true(await isDisplayed('button=Facebook'), 'Shows Facebook button');
  t.true(await isDisplayed('button=TikTok'), 'Shows TikTok button');
  t.true(await isDisplayed('button=Instagram'), 'Shows Instagram button');
  t.true(await isDisplayed('button=X'), 'Shows X (Twitter) button');
  t.true(await isDisplayed('button=Kick'), 'Shows Kick button');
  t.true(await isDisplayed('button=dlive'), 'Shows Dlive button');
  t.true(await isDisplayed('button=NimoTV'), 'Shows NimoTV button');

  t.true(await isDisplayed('button=Back'), 'Has a link to go back to Sign Up');

  // Complete login
  await waitForDisplayed('button=Twitch');
  const user = await logIn(t, 'twitch', { prime: false }, false, true);
  await sleep(1000);
  // We seem to skip the login step after login internally
  await clickIfDisplayed('button=Skip');

  // Finish onboarding flow
  await withPoolUser(user, async () => {
    await waitForDisplayed('h1=Connect Platforms');
    await clickIfDisplayed('button=Skip');

    await waitForDisplayed('h1=Choose Your Plan');
    await clickIfDisplayed('button=Skip');

    await waitForDisplayed('h1=Set Up Your Mic & Webcam');

    t.true(await isDisplayed('span=Sources'), 'Sources selector is visible');

    // Confirm sources and dual output status
    t.is(
      await getNumElements('div[data-role=source]'),
      0,
      'Old user onboarded without theme has no sources',
    );
    t.true(await isDisplayed('i[data-testid=dual-output-inactive]'), 'Dual output not enabled');
  });

  t.pass();
});

// CASE 2: New user not logged in during onboarding, theme installed
// CASE 6: No user logged in during onboarding, theme installed, then log in new user
// NOTE: Skipped when running remotely but this test is functional
test.skip('Go through onboarding and install theme', async t => {
  const login = false;
  const newUser = true;
  const installTheme = true;

  await goThroughOnboarding(t, login, newUser, installTheme, async () => {
    // Confirm sources and dual output status
    t.not(await getNumElements('div[data-role=source]'), 0, 'Theme installed before login');
    t.true(await isDisplayed('i[data-testid=dual-output-inactive]'), 'Single output enabled');

    // login new user after onboarding
    await clickIfDisplayed('li[data-testid=nav-auth]');

    await isDisplayed('button=Log in with Twitch');
    await logIn(t, 'twitch', { prime: false }, false, false, true);
    await sleep(1000);

    // Confirm switched to scene with default sources and dual output status
    await confirmDefaultSources(t);
    t.true(await isDisplayed('i[data-testid=dual-output-inactive]'), 'Single output enabled.');
  });

  t.pass();
});

// CASE 3: New user logged in during onboarding, no theme installed
test('Go through onboarding as a new user', async t => {
  const login = true;
  const newUser = true;
  const installTheme = false;

  await goThroughOnboarding(t, login, newUser, installTheme, async () => {
    // Confirm sources and dual output status
    await confirmDefaultSources(t);
    t.true(await isDisplayed('i[data-testid=dual-output-inactive]'), 'Single output enabled.');
  });

  t.pass();
});

// CASE 4: New user logged in during onboarding, theme installed
// NOTE: Skipped when running remotely but this test is functional
test.skip('Go through onboarding as a new user and install theme', async t => {
  const login = true;
  const newUser = true;
  const installTheme = true;
  const hasDefaultSources = false;

  await goThroughOnboarding(t, login, newUser, installTheme, async () => {
    // Confirm sources and dual output status
    await confirmDefaultSources(t, hasDefaultSources);
    t.true(await isDisplayed('i[data-testid=dual-output-inactive]'), 'Single output enabled.');
  });

  t.pass();
});

// CASE 5: No user logged in during onboarding, no theme installed, then log in new user
test('Login new user after onboarding skipped', async t => {
  const login = false;
  const newUser = false;
  const installTheme = false;

  await goThroughOnboarding(t, login, newUser, installTheme, async () => {
    // login new user after onboarding
    await clickIfDisplayed('li[data-testid=nav-auth]');

    await isDisplayed('button=Log in with Twitch');
    await logIn(t, 'twitch', { prime: false }, false, false, true);
    await sleep(1000);

    // Confirm switched to scene with default sources and dual output status
    await confirmDefaultSources(t);
    t.true(await isDisplayed('i[data-testid=dual-output-inactive]'), 'Dual output not enabled.');
  });

  t.pass();
});

// TODO: refactor to updated onboarding flow and make specific assertions here once re-enabled
test.skip('Go through the onboarding and autoconfig', async t => {
  const app = t.context.app;
  await focusMain();

  if (!(await isDisplayed('h2=Live Streaming'))) return;

  await click('h2=Live Streaming');
  await click('button=Continue');

  // Click on Login on the signup page, then wait for the auth screen to appear
  await click('a=Login');
  // prettier-ignore
  await (await app.client.$('button=Log in with Twitch')).isExisting();

  await logIn(t, 'twitch', { prime: false }, false, true);
  await sleep(1000);

  // We seem to skip the login step after login internally
  await clickIfDisplayed('button=Skip');

  // Don't Import from OBS
  await clickIfDisplayed('div=Start Fresh');

  // Skip hardware config
  await waitForDisplayed('h1=Set up your mic & webcam');
  await clickIfDisplayed('button=Skip');

  // Skip picking a theme
  await waitForDisplayed('h1=Add an Overlay');
  await clickIfDisplayed('button=Skip');

  // Start auto config
  // temporarily disable auto config until migrate to new api
  // t.true(await (await app.client.$('button=Start')).isExisting());
  // await (await app.client.$('button=Start')).click();

  // Skip purchasing prime
  // TODO: is this timeout because of autoconfig?
  await waitForDisplayed('div[data-testid=choose-free-plan-btn]', { timeout: 60000 });
  await click('div[data-testid=choose-free-plan-btn]');

  await waitForDisplayed('span=Sources', { timeout: 60000 });

  // success?
  t.true(await (await app.client.$('span=Sources')).isDisplayed(), 'Sources selector is visible');
});
