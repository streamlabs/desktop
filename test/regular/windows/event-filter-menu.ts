import { test, useWebdriver } from '../../helpers/webdriver';
import { logIn } from '../../helpers/webdriver/user';
import { getApiClient } from '../../helpers/api-client';
import { clickButton, focusChild, focusMain } from '../../helpers/modules/core';
import { sleep } from '../../helpers/sleep';
import {
  clickLastText,
  clickText,
  getWindowsService,
  isTextDisplayed,
  waitForChildWindowState,
  waitForText,
} from '../../helpers/modules/widgets-ui';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

interface IFilter {
  name: string;
  value: boolean | number;
}

// Minimal shape of the RecentEventsService.
// The window is normally opened by the filter button of the Recent Events panel.
interface IRecentEventsApi {
  showFilterMenu(): void;
  filters: {
    main: Record<string, IFilter>;
    sub: Record<string, IFilter>;
    resub: Record<string, IFilter>;
    minMonths: Record<string, IFilter>;
  };
}

async function getRecentEvents() {
  const api = await getApiClient();
  return api.getResource<IRecentEventsApi>('RecentEventsService');
}

async function waitForFilterValue(read: () => boolean | number | undefined, expected: unknown) {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    if (read() === expected) return true;
    await sleep(250);
  }
  return false;
}

/**
 * The filters come from the backend after the login, wait for them
 */
async function waitForFilters(recentEvents: IRecentEventsApi) {
  const started = Date.now();
  while (Date.now() - started < 40000) {
    if (Object.keys(recentEvents.filters.main).length) return true;
    await sleep(500);
  }
  return false;
}

async function openFilterMenu(recentEvents: IRecentEventsApi) {
  recentEvents.showFilterMenu();
  await focusChild();
  await waitForText('Done');
}

test('Event filter menu toggles event filters', async t => {
  if (!(await logIn(t, 'twitch'))) return;

  const recentEvents = await getRecentEvents();
  t.true(await waitForFilters(recentEvents), 'filters are loaded');
  await openFilterMenu(recentEvents);
  t.true(await waitForChildWindowState('EventFilterMenu', true), 'filter window is shown');

  // general filters
  t.true(await isTextDisplayed('Donations'));
  t.true(await isTextDisplayed('Follows'));
  t.true(await isTextDisplayed('Bits'));
  t.true(await isTextDisplayed('Raids'));

  // a general filter can be toggled off and on again
  const donation = () => recentEvents.filters.main.donation.value;
  const initial = donation();
  await clickText('Donations');
  t.true(await waitForFilterValue(donation, !initial), 'donation filter toggled');
  await clickText('Donations');
  t.true(await waitForFilterValue(donation, initial), 'donation filter restored');

  // twitch has sub and resub sections
  t.true(await isTextDisplayed('Subs'));
  t.true(await isTextDisplayed('Resubs'));

  await clickButton('Done');
  t.true(await waitForChildWindowState('EventFilterMenu', false), 'filter window is closed');
  await focusMain();
});

test('Event filter menu sub filters are shown only while subs are enabled', async t => {
  if (!(await logIn(t, 'twitch'))) return;

  const recentEvents = await getRecentEvents();
  t.true(await waitForFilters(recentEvents), 'filters are loaded');
  await openFilterMenu(recentEvents);

  const subs = () => recentEvents.filters.sub.subscription.value;
  const initial = subs();

  // make sure subs are enabled to see the sub-options
  if (!initial) {
    await clickLastText('Subs');
    t.true(await waitForFilterValue(subs, true));
  }
  t.true(await isTextDisplayed('Gifted'));
  t.true(await isTextDisplayed('Prime'));

  // disabling subs hides the options
  await clickLastText('Subs');
  t.true(await waitForFilterValue(subs, false));
  await t.context.app.client.waitUntil(async () => !(await isTextDisplayed('Gifted')), {
    timeoutMsg: 'Sub options are still shown after disabling subs',
  });

  // restore
  if (initial) {
    await clickLastText('Subs');
    t.true(await waitForFilterValue(subs, true));
  }

  await clickButton('Done');
  t.true(await waitForChildWindowState('EventFilterMenu', false));
  await focusMain();
});

test('Event filter menu closes with the window service', async t => {
  if (!(await logIn(t, 'twitch'))) return;

  const recentEvents = await getRecentEvents();
  await waitForFilters(recentEvents);
  await openFilterMenu(recentEvents);
  t.true(await waitForChildWindowState('EventFilterMenu', true));

  const windows = await getWindowsService();
  await windows.closeChildWindow();
  t.true(await waitForChildWindowState('EventFilterMenu', false));
});
