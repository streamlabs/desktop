import { test, TExecutionContext, useWebdriver } from '../../helpers/webdriver';
import { logIn, withUser } from '../../helpers/webdriver/user';
import {
  goLive,
  stopRecording,
  stopStream,
  validateRecordingFiles,
  waitForStreamStart,
  waitForStreamStop,
} from '../../helpers/modules/streaming';
import {
  showSettingsWindow,
  setTemporaryRecordingPath,
} from '../../helpers/modules/settings/settings';
import {
  click,
  clickButton,
  clickCheckbox,
  clickWhenDisplayed,
  focusMain,
  isDisplayed,
} from '../../helpers/modules/core';
import { assertFormContains, readFields, useForm } from '../../helpers/modules/forms';
import { sleep } from '../../helpers/sleep';
import { recordHighlight } from '../../helpers/modules/replay-buffer';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Populates stream settings after go live', async t => {
  await logIn(t);
  await goLive();
  await stopStream();
  await showSettingsWindow('Stream');
  await click('a=Stream to custom ingest');

  await assertFormContains(
    {
      'Stream Type': 'Streaming Services',
      Service: 'Twitch',
      Server: 'Auto (Recommended)',
    },
    'title',
  );

  t.pass();
});

test('Populates stream key after go live', async t => {
  const user = await logIn(t);

  // make sure all required fields are filled for platforms
  if (user.type === 'twitch') {
    await goLive({
      title: 'Test title',
      twitchGame: 'Fortnite',
    });
  } else {
    await goLive();
  }

  await waitForStreamStart();
  await stopStream();
  await waitForStreamStop();
  await showSettingsWindow('Stream');
  await click('a=Stream to custom ingest');

  // Check that is a somewhat valid Twitch stream key
  const formData = (await readFields()) as { key: string };
  const streamKey = formData.key;
  t.true(streamKey.startsWith('live_'));
  t.true(streamKey.length > 40);
});

test(
  'Streaming with Recording and Replay Buffer',
  withUser('twitch'),
  async (t: TExecutionContext) => {
    const tmpDir = await setTemporaryRecordingPath();

    // Simple Mode

    // Streaming + Recording
    await showSettingsWindow('General', async () => {
      await clickCheckbox('RecordWhenStreaming');
      await clickButton('Done');
    });

    await goLive({
      title: 'Test title',
      twitchGame: 'Fortnite',
    });

    await waitForStreamStart();
    await focusMain();
    await isDisplayed('.record-button.active');

    // Record for 2 seconds
    await sleep(2000);
    await stopRecording();
    await clickWhenDisplayed('span=A new Recording has been completed. Click for more info');
    await validateRecordingFiles(t, tmpDir, 1);

    await stopStream();
    await waitForStreamStop();

    // Streaming + Replay Buffer
    await showSettingsWindow('General', async () => {
      await clickCheckbox('RecordWhenStreaming');
      await clickCheckbox('ReplayBufferWhileStreaming');
      await clickButton('Done');
    });

    await goLive();
    await waitForStreamStart();
    await focusMain();
    t.false(await isDisplayed('.record-button.active'));
    await isDisplayed('button .fa.fa-stop');
    await recordHighlight(t, tmpDir, 2, 'Streaming with Replay Buffer highlight', false);

    await stopStream();
    await waitForStreamStop();

    await showSettingsWindow('Output', async () => {
      const { setDropdownInputValue } = useForm('Recording');
      await setDropdownInputValue('RecFormat', 'mov');
      await clickButton('Done');
    });

    // Streaming + Recording + Replay Buffer
    await showSettingsWindow('General', async () => {
      await clickCheckbox('RecordWhenStreaming');
      await clickButton('Done');
    });

    await goLive();
    await waitForStreamStart();
    await focusMain();
    await isDisplayed('.record-button.active');
    await isDisplayed('button .fa.fa-stop');
    await stopRecording();
    await clickWhenDisplayed('span=A new Recording has been completed. Click for more info');
    await sleep(1000);
    await recordHighlight(
      t,
      tmpDir,
      3,
      'Streaming with Recording and Replay Buffer highlight',
      false,
    );

    await stopStream();
    await waitForStreamStop();
  },
);
