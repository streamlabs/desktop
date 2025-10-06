import {
  clickGoLive,
  prepareToGoLive,
  stopStream,
  submit,
  switchAdvancedMode,
  waitForSettingsWindowLoaded,
  waitForStreamStart,
} from '../../helpers/modules/streaming';
import { fillForm, useForm } from '../../helpers/modules/forms';
import {
  click,
  clickButton,
  focusMain,
  isDisplayed,
  waitForDisplayed,
} from '../../helpers/modules/core';
import { logIn } from '../../helpers/modules/user';
import { releaseUserInPool, reserveUserFromPool, withUser } from '../../helpers/webdriver/user';
import { showSettingsWindow } from '../../helpers/modules/settings/settings';
import { test, TExecutionContext, useWebdriver } from '../../helpers/webdriver';
import { sleep } from '../../helpers/sleep';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

async function enableAllPlatforms() {
  for (const platform of ['twitch', 'youtube', 'trovo']) {
    await fillForm({ [platform]: true });
    await sleep(500);
    await waitForSettingsWindowLoaded();
  }
}

async function goLiveWithCloudShift(t: TExecutionContext, multistream: boolean) {
  await fillForm({ cloudShift: true });

  if (multistream) {
    await enableAllPlatforms();
    await waitForSettingsWindowLoaded();
    await fillForm({
      title: 'Test stream',
      description: 'Test stream description',
      twitchGame: 'Fortnite',
      kickGame: 'Fortnite',
    });
  } else {
    await fillForm({ twitch: true });
    await waitForSettingsWindowLoaded();
    await fillForm({ title: 'Test stream', game: 'Fortnite' });
  }

  await waitForSettingsWindowLoaded();
  await submit();
  await waitForDisplayed('span=Configure the Multistream service');
  await waitForStreamStart();
  await focusMain();

  if (multistream) {
    t.true(
      await isDisplayed('span.and-menu-title-content=Multistream'),
      'Multistream chat tab visible',
    );
  } else {
    t.false(
      await isDisplayed('span.and-menu-title-content=Multistream'),
      'Multistream chat tab not visible',
    );
  }

  await stopStream();
}

test(
  'Multistream default mode',
  withUser('twitch', { prime: true, multistream: true }),
  async t => {
    await prepareToGoLive();
    await clickGoLive();
    await waitForSettingsWindowLoaded();

    // no primary chat switcher if only one platform is enabled
    t.false(
      await isDisplayed('[data-name="primary-chat-switcher"]'),
      'No primary chat switcher if only one platform is enabled',
    );

    // TODO: this is to rule-out a race condition in platform switching, might not be needed and
    // can possibly revert back to fillForm with all platforms.
    await enableAllPlatforms();

    // shows primary chat switcher when multiple platforms are enabled
    t.true(
      await isDisplayed('[data-name="primary-chat-switcher"]'),
      'Shows primary chat switcher when multiple platforms are enabled',
    );

    // add settings
    await fillForm({
      title: 'Test stream',
      description: 'Test stream description',
      twitchGame: 'Fortnite',
      trovoGame: 'Doom',
    });

    await submit();
    await waitForDisplayed('span=Configure the Multistream service');
    await waitForDisplayed("h1=You're live!", { timeout: 60000 });
    await stopStream();
    t.pass();
  },
);

test(
  'Multistream advanced mode',
  withUser('twitch', { prime: true, multistream: true }),
  async t => {
    await prepareToGoLive();
    await clickGoLive();
    await waitForSettingsWindowLoaded();

    await enableAllPlatforms();

    await switchAdvancedMode();
    await waitForSettingsWindowLoaded();

    const twitchForm = useForm('twitch-settings');
    await twitchForm.fillForm({
      customEnabled: true,
      title: 'twitch title',
      twitchGame: 'Fortnite',
      // TODO: Re-enable after reauthing userpool
      // twitchTags: ['100%'],
    });

    const youtubeForm = useForm('youtube-settings');
    await youtubeForm.fillForm({
      customEnabled: true,
      title: 'youtube title',
      description: 'youtube description',
    });

    const trovoForm = useForm('trovo-settings');
    await trovoForm.fillForm({
      customEnabled: true,
      trovoGame: 'Doom',
      title: 'trovo title',
    });

    await submit();
    await waitForDisplayed('span=Configure the Multistream service');
    await waitForDisplayed("h1=You're live!", { timeout: 60000 });
    await stopStream();
    t.pass();
  },
);

test('Custom stream destinations', async t => {
  const loggedInUser = await logIn('twitch', { prime: true });

  // fetch a new stream key
  const user = await reserveUserFromPool(t, 'twitch');

  try {
    // add new destination
    await showSettingsWindow('Stream');
    await click('span=Add Destination');

    const { fillForm } = useForm();
    await fillForm({
      name: 'MyCustomDest',
      url: 'rtmp://live.twitch.tv/app/',
      streamKey: user.streamKey,
    });
    await clickButton('Save');
    t.true(await isDisplayed('span=MyCustomDest'), 'New destination should be created');

    // update destinations
    await click('i.fa-pen');
    await fillForm({
      name: 'MyCustomDestUpdated',
    });
    await clickButton('Save');

    t.true(await isDisplayed('span=MyCustomDestUpdated'), 'Destination should be updated');

    await click('span=Add Destination');
    await fillForm({
      name: 'MyCustomDest',
      url: 'rtmp://live.twitch.tv/app/',
      streamKey: user.streamKey,
    });
    await clickButton('Save');

    // add 3 more destinations (up to 5)
    for (let i = 0; i < 3; i++) {
      await click('span=Add Destination');
      await fillForm({
        name: `MyCustomDest${i}`,
        url: 'rtmp://live.twitch.tv/app/',
        streamKey: user.streamKey,
      });
      await clickButton('Save');
    }

    t.false(await isDisplayed('span=Add Destination'), 'Do not allow more than 5 custom dest');

    // open the GoLiveWindow and check destinations
    await prepareToGoLive();
    await clickGoLive();
    await waitForSettingsWindowLoaded();
    t.true(await isDisplayed('span=MyCustomDest'), 'Destination is available');
    await click('span=MyCustomDest'); // switch the destination on

    // try to stream
    await fillForm({
      title: 'Test stream',
      twitchGame: 'Fortnite',
    });
    await waitForSettingsWindowLoaded();
    await submit();
    await waitForDisplayed('span=Configure the Multistream service');
    await waitForDisplayed("h1=You're live!", { timeout: 60000 });
    await waitForStreamStart();
    await stopStream();

    // delete existing destinations
    await showSettingsWindow('Stream');
    for (let i = 0; i < 5; i++) {
      await click('i.fa-trash');
    }
    t.false(await isDisplayed('i.fa-trash'), 'Destinations should be removed');
  } finally {
    await releaseUserInPool(user);
    await releaseUserInPool(loggedInUser);
  }
});

// TODO: enable after merge
test.skip('Cloud Shift', withUser('twitch', { prime: true, multistream: true }), async t => {
  await prepareToGoLive();
  await clickGoLive();
  await waitForSettingsWindowLoaded();

  // Single stream cloud shift
  await goLiveWithCloudShift(t, false);

  // Multistream cloud shift
  await goLiveWithCloudShift(t, true);

  t.pass();
});
