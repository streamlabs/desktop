import { logIn } from '../../helpers/modules/user';
import {
  skipCheckingErrorsInLog,
  test,
  TExecutionContext,
  useWebdriver,
} from '../../helpers/webdriver';
import {
  chatIsVisible,
  clickGoLive,
  goLive,
  prepareToGoLive,
  scheduleStream,
  stopStream,
  submit,
  waitForSettingsWindowLoaded,
  waitForStreamStart,
} from '../../helpers/modules/streaming';

import {
  click,
  closeWindow,
  focusChild,
  focusMain,
  isDisplayed,
  select,
  waitForDisplayed,
} from '../../helpers/modules/core';
import * as moment from 'moment';
import { assertFormContains, fillForm, readFields, useForm } from '../../helpers/modules/forms';
import { ListInputController } from '../../helpers/modules/forms/list';
import { logOut } from '../../helpers/webdriver/user';
import { toggleDualOutputMode } from '../../helpers/modules/dual-output';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

// Some accounts in the user pool may not be enabled for live streaming or need to be reauthed
async function logInYouTubeEnabledAccount(
  t: TExecutionContext,
  retries: number = 3,
): Promise<boolean | void> {
  // only exclude multistream accounts on the first attempt to expand the user pool on later attempts
  const multistream = retries === 3 ? false : undefined;
  if (retries === 0) {
    t.fail(
      'No YouTube accounts with live streaming enabled are currently available in the user pool',
    );
    return;
  }

  await logIn('youtube', { multistream, streamingIsDisabled: false, notStreamable: false });
  await prepareToGoLive();
  await clickGoLive();

  const isEnabled = await isDisplayed('div[data-name="youtube-settings"]', { timeout: 5000 });
  if (!isEnabled) {
    await logOut(t);
    // try again to get an account that has streaming enabled
    return await logInYouTubeEnabledAccount(t, retries - 1);
  }

  await closeWindow('child');

  // return true if we had a retry so that we can skip checking errors in the log for account reasons
  const retried = retries !== 3;

  if (retried) {
    skipCheckingErrorsInLog();
  }

  return retried;
}

test('Streaming to Youtube', async t => {
  await logInYouTubeEnabledAccount(t);
  t.false(await chatIsVisible(), 'Chat should not be visible for YT before stream starts');

  await goLive({
    title: 'SLOBS Test Stream',
    description: 'SLOBS Test Stream Description',
  });

  t.true(await chatIsVisible(), 'Chat should be visible');
  await stopStream();

  await toggleDualOutputMode();
  await clickGoLive();
  await waitForSettingsWindowLoaded();
  await fillForm({
    youtubeDisplay: 'both',
  });
  await waitForSettingsWindowLoaded();
  await submit();
  await waitForStreamStart();
  await stopStream();

  t.pass('Streamed to YouTube single output and dual stream successfully');
});

// TODO flaky
test.skip('Streaming to the scheduled event on Youtube', async t => {
  await logInYouTubeEnabledAccount(t);
  const tomorrow = moment().add(1, 'day').toDate();
  await scheduleStream(tomorrow, { platform: 'YouTube', title: 'Test YT Scheduler' });
  await prepareToGoLive();
  await clickGoLive();
  await focusChild();
  const { getInput } = useForm('youtube-settings');
  const broadcastIdInput = await getInput<ListInputController<string>>('broadcastId');
  t.true(
    await broadcastIdInput.hasOption('Test YT Scheduler'),
    'Scheduled event should be visible in the broadcast selector',
  );

  await goLive({
    broadcastId: 'Test YT Scheduler',
  });
});

// TODO: Fix this test, which is blocked by limited YouTube test accounts and needing to update the
// selectors in the `scheduleStream` helper function.
test.skip('Youtube scheduled event keeps its own title and description', async t => {
  await logInYouTubeEnabledAccount(t);

  const now = Date.now();
  const scheduledTitle = `Scheduled YT Event ${now}`;
  const scheduledDescription = `Scheduled YT Description ${now}`;
  const commonTitle = `Common Title ${now}`;
  const commonDescription = `Common Description ${now}`;

  const tomorrow = moment().add(1, 'day').toDate();
  // TODO: Fix the selectors in `scheduleStream` in order to enable this test.
  await scheduleStream(tomorrow, {
    platform: 'YouTube',
    title: scheduledTitle,
    description: scheduledDescription,
  });

  await prepareToGoLive();
  await clickGoLive();
  await waitForSettingsWindowLoaded();

  // Fill the shared fields with values the scheduled event does not have, so the assertion below
  // can tell "the scheduled values won" apart from "there was nothing to overwrite". Without this
  // the shared fields still hold whatever the last stream used, which may coincide.
  await fillForm({ title: commonTitle, description: commonDescription });
  await waitForSettingsWindowLoaded();

  // Selecting the event refetches its settings from YouTube, which must replace the shared values
  // for YouTube - the event already has a title and description of its own.
  await fillForm({ broadcastId: scheduledTitle });
  await waitForSettingsWindowLoaded();

  // That refetch has no loading flag of its own, so poll YouTube's own title until it stops showing
  // the shared value. A timeout here is not the failure: the assertion that follows reports
  // whichever value the field was actually left holding.
  const $youtubeTitle = await select(
    '[data-role="form"][data-name="youtube-settings"] [data-role="input"][data-name="title"]',
  );
  try {
    await $youtubeTitle.waitUntil(async () => (await $youtubeTitle.getValue()) !== commonTitle, {
      timeout: 15000,
    });
  } catch (e: unknown) {
    // Reported by the assertion below, which names both the expected and the actual value.
  }

  const { assertFormContains } = useForm('youtube-settings');
  await assertFormContains({ title: scheduledTitle, description: scheduledDescription });

  t.pass();
});

test.skip('Streaming to YouTube scheduled stream', async t => {
  await logInYouTubeEnabledAccount(t);
  await prepareToGoLive();

  // Fill a default Title and Description to confirm that the schedule stream title and
  // description update correctly
  // TODO: Re-enable when more YouTube accounts added to user pool
  // await clickGoLive();
  // await waitForSettingsWindowLoaded();
  // await fillForm({ title: 'Default Title', description: 'Default Description' });
  // await waitForSettingsWindowLoaded();
  // await submit();
  // await waitForStreamStart();
  // await stopStream();

  // Schedule stream
  const tomorrow = moment().add(1, 'day').toDate();
  await scheduleStream(tomorrow, { platform: 'YouTube', title: 'Test YT Scheduler' });

  // Open the modal
  await focusMain();
  await click('span=Test YT Scheduler');

  // click GoLive
  const $modal = await select('.ant-modal-content');
  const modalFields = await readFields();

  // Try to start the scheduled stream
  await clickGoLive();

  // confirm settings
  await waitForSettingsWindowLoaded();
  // TODO: Assert that the form contains the previous stream title and description after
  // more YouTube accounts are added to the user pool
  // await assertFormContains({ title: 'Default Title', description: 'Default Description' });
  await assertFormContains({ title: '' });

  // TODO: Re-enable when more YouTube accounts added to user pool
  // await submit();
  // await waitForStreamStart();
  // await stopStream();
  t.pass();
});

test('Start stream twice to the same YT event', async t => {
  await logInYouTubeEnabledAccount(t);

  // create event via scheduling form
  const now = Date.now();
  await goLive({
    title: `Youtube Test Stream ${now}`,
    description: 'SLOBS Test Stream Description',
    enableAutoStop: false,
  });
  await stopStream();

  await goLive({
    broadcastId: `Youtube Test Stream ${now}`,
    enableAutoStop: true,
  });
  await stopStream();
  t.pass();
});

test('Youtube streaming is disabled', async t => {
  skipCheckingErrorsInLog();
  await logIn('youtube', { streamingIsDisabled: true, notStreamable: true });

  t.true(
    await isDisplayed('span=YouTube account not enabled for live streaming'),
    'The streaming-disabled message should be visible',
  );
  await prepareToGoLive();
  await clickGoLive();
  await focusChild();
  await waitForDisplayed('button=Enable Live Streaming');
});
