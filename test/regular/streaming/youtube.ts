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
import { useForm } from '../../helpers/modules/forms';
import { ListInputController } from '../../helpers/modules/forms/list';
import { logOut } from '../../helpers/webdriver/user';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

// Some accounts in the user pool may not be enabled for live streaming or need to be reauthed
async function logInYouTubeEnabledAccount(
  t: TExecutionContext,
  retries: number = 3,
): Promise<void> {
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

// TODO flaky
test.skip('GoLive from StreamScheduler', async t => {
  await logInYouTubeEnabledAccount(t);
  await prepareToGoLive();

  // schedule stream
  const tomorrow = moment().add(1, 'day').toDate();
  await scheduleStream(tomorrow, { platform: 'YouTube', title: 'Test YT Scheduler' });

  // open the modal
  await focusMain();
  await click('span=Test YT Scheduler');

  // click GoLive
  const $modal = await select('.ant-modal-content');
  const $goLiveBtn = await $modal.$('button=Go Live');
  await click($goLiveBtn);

  // confirm settings
  await focusChild();
  await submit();
  await waitForStreamStart();
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
