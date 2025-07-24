import { logIn } from '../../helpers/modules/user';
import {
  chatIsVisible,
  goLive,
  scheduleStream,
  stopStream,
  submit,
  waitForStreamStart,
} from '../../helpers/modules/streaming';
import { test, useWebdriver } from '../../helpers/webdriver';
import * as moment from 'moment';
import { selectFirst, selectMatch } from '../../helpers/modules/forms/list';
import { click, focusChild, focusMain, select } from '../../helpers/modules/core';

useWebdriver();

test.skip('Streaming to a Facebook Page', async t => {
  await logIn('facebook', { multistream: false });
  await goLive({
    title: 'SLOBS Test Stream',
    // facebookGame: 'Fortnite',
    description: 'SLOBS Test Stream Description',
  });
  t.true(await chatIsVisible(), 'Chat should be visible');
  await stopStream();
  t.pass();
});

test.skip('Streaming to the scheduled event on Facebook page', async t => {
  await logIn('facebook', { multistream: false });
  const tomorrow = moment().add(1, 'day').toDate();

  await scheduleStream(tomorrow, {
    platform: 'Facebook',
    title: 'Test FB Scheduler',
    description: 'Description for a scheduled stream',
    destinationType: 'Share to a Page You Manage',
    pageId: selectFirst(),
  });

  await goLive({
    liveVideoId: selectMatch('Test FB Scheduler'),
  });
  t.pass();
});

// TODO: fix the test
test.skip('GoLive to a FB page from StreamScheduler', async t => {
  await logIn('facebook', { multistream: false });
  const tomorrow = moment().add(1, 'day').toDate();

  await scheduleStream(tomorrow, {
    platform: 'Facebook',
    title: 'Test FB Scheduler',
    description: 'Description for a scheduled stream',
    destinationType: 'Share to a Page You Manage',
    pageId: selectFirst(),
  });

  // open the modal
  await focusMain();
  await click('span=Test FB Scheduler');

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

// TODO: update expired permissions
test.skip('Streaming to a Facebook User`s group', async t => {
  await logIn('facebook', { hasFBGroup: true });
  await goLive({
    title: 'SLOBS Test Stream',
    // facebookGame: 'DOOM',
    description: 'SLOBS Test Stream Description',
    destinationType: 'group',
  });
  await stopStream();
  t.pass();
});

// TODO: update expired permissions
test.skip('Streaming to a Facebook User`s timeline', async t => {
  await logIn('facebook', { allowStreamingToFBTimeline: true });
  await goLive({
    title: 'SLOBS Test Stream',
    // facebookGame: 'DOOM',
    description: 'SLOBS Test Stream Description',
    destinationType: 'me',
  });
  await stopStream();
  t.pass();
});
