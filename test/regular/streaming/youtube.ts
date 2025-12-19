import { logIn } from '../../helpers/modules/user';
import { skipCheckingErrorsInLog, test, useWebdriver } from '../../helpers/webdriver';
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
  focusChild,
  focusMain,
  isDisplayed,
  select,
  waitForDisplayed,
} from '../../helpers/modules/core';
import * as moment from 'moment';
import { useForm } from '../../helpers/modules/forms';
import { ListInputController } from '../../helpers/modules/forms/list';
import { sleep } from '../../helpers/sleep';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Streaming to Youtube', async t => {
  await logIn('youtube', { multistream: false });
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
  await logIn('youtube', { multistream: false });
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
  await logIn('youtube', { multistream: false });
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
  await logIn('youtube', { multistream: false });

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
  // await sleep(300000);
  t.true(
    await isDisplayed('span=YouTube account not enabled for live streaming'),
    'The streaming-disabled message should be visible',
  );
  await prepareToGoLive();
  await clickGoLive();
  await focusChild();
  await waitForDisplayed('button=Enable Live Streaming');
});
