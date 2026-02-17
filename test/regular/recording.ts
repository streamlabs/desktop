import { readdir } from 'fs-extra';
import { test, useWebdriver } from '../helpers/webdriver';
import { sleep } from '../helpers/sleep';
import {
  clickGoLive,
  prepareToGoLive,
  startRecording,
  stopRecording,
  stopStream,
  submit,
  waitForSettingsWindowLoaded,
  waitForStreamStart,
} from '../helpers/modules/streaming';
import {
  setOutputResolution,
  setTemporaryRecordingPath,
  showSettingsWindow,
} from '../helpers/modules/settings/settings';
import {
  clickButton,
  clickTab,
  clickToggle,
  clickWhenDisplayed,
  focusMain,
  waitForDisplayed,
} from '../helpers/modules/core';
import { logIn } from '../helpers/webdriver/user';
import { toggleDualOutputMode } from '../helpers/modules/dual-output';
import { showPage } from '../helpers/modules/navigation';
import { useForm, fillForm } from '../helpers/modules/forms';
import { validateRecordingFiles, testRecordingQualities } from '../helpers/modules/recording';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

/**
 * Iterate over all formats and record a 0.5s video in each.
 * @param advanced - whether to use advanced settings
 * @returns number of formats
 */
async function createRecordingFiles(advanced: boolean = false): Promise<number> {
  const formats = advanced
    ? ['flv', 'mp4', 'mov', 'mkv', 'mpegts', 'hls']
    : ['flv', 'mp4', 'mov', 'mkv', 'mpegts'];

  // Record 0.5s video in every format
  for (const format of formats) {
    await showSettingsWindow('Output', async () => {
      if (advanced) {
        await clickTab('Recording');
      }

      const { setDropdownInputValue } = useForm('Recording');
      await setDropdownInputValue('RecFormat', format);
      await clickButton('Close');
    });

    await focusMain();
    await startRecording();
    await sleep(500);
    await stopRecording();

    // in advanced mode, it may take a little longer to save the recording
    if (advanced) {
      await sleep(1000);
    }

    // Confirm notification has been shown and navigate to the recording history
    await focusMain();
    await clickWhenDisplayed('span=A new Recording has been completed. Click for more info');
    await waitForDisplayed('h1=Recordings', { timeout: 1000 });
    await sleep(500);
    await showPage('Editor');
  }

  return Promise.resolve(formats.length);
}

/**
 * Recording with one context active (horizontal, simple)
 */
test('Recording', async t => {
  // low resolution reduces CPU usage
  await setOutputResolution('100x100');

  // Simple Recording
  const tmpDir = await setTemporaryRecordingPath();
  const numRecordingQualities = await testRecordingQualities(t, tmpDir);
  const numSimpleFormats = await createRecordingFiles();
  await validateRecordingFiles(t, tmpDir, numRecordingQualities + numSimpleFormats);

  // Advanced Recording
  await setTemporaryRecordingPath(true, tmpDir);
  const numAdvancedFormats = await createRecordingFiles(true);
  await validateRecordingFiles(
    t,
    tmpDir,
    numRecordingQualities + numSimpleFormats + numAdvancedFormats,
    true,
  );

  // Switches between Advanced and Simple Recording
  // Note: The recording path for Simple Recording should have persisted from before
  await showSettingsWindow('Output', async () => {
    const { setDropdownInputValue } = useForm('Mode');
    await setDropdownInputValue('Mode', 'Simple');
    await clickButton('Close');
  });

  await focusMain();
  await startRecording();
  // Record for 2s to prevent the recording from accidentally having the same key
  await sleep(2000);
  await stopRecording();
  await clickWhenDisplayed('span=A new Recording has been completed. Click for more info');
  await validateRecordingFiles(
    t,
    tmpDir,
    numRecordingQualities + numSimpleFormats + numAdvancedFormats + 1,
    true,
  );

  t.pass();
});

/**
 * Recording with two contexts active (horizontal and vertical)
 * should produce no different results than with one context.
 */
test('Recording with two contexts active', async t => {
  await logIn(t);
  await toggleDualOutputMode();

  // low resolution reduces CPU usage
  await setOutputResolution('100x100');
  const tmpDir = await setTemporaryRecordingPath(true);

  const numFiles = await createRecordingFiles(true);
  await validateRecordingFiles(t, tmpDir, numFiles, true);
});

test('Recording from Go Live window', async t => {
  const user = await logIn(t);
  await setOutputResolution('100x100');
  const tmpDir = await setTemporaryRecordingPath();
  await prepareToGoLive();

  await clickGoLive();
  await waitForSettingsWindowLoaded();

  if (user.type === 'twitch') {
    await fillForm({
      twitchGame: 'Fortnite',
    });
  }

  await clickToggle('recording-toggle');

  await submit();
  await waitForStreamStart();
  await focusMain();
  await stopRecording();
  await stopStream();

  const files = await readdir(tmpDir);
  t.is(files.length, 1, `Files that were created:\n${files.join('\n')}`);
});

// test('Recording with Streaming and Replay Buffer', async t => {
//   const user = await logIn(t);
//   await setOutputResolution('100x100');
//   const tmpDir = await setTemporaryRecordingPath();
//   let expectedFileCount = 0;

//   // Helper function to enable/disable replay buffer
//   const toggleReplayBuffer = async (enabled: boolean) => {
//     await showSettingsWindow('Output', async () => {
//       const { setCheckboxValue } = useForm('ReplayBuffer');
//       await setCheckboxValue('ReplayBuffer', enabled);
//       await clickButton('Close');
//     });
//     await focusMain();
//   };

//   // Helper function to save replay buffer
//   const saveReplayBuffer = async () => {
//     // Simulate hotkey or UI action to save replay buffer
//     await clickButton('Save Replay');
//     await sleep(500);
//   };

//   // Case 1: Start stream with recording
//   await prepareToGoLive();
//   await clickGoLive();
//   await waitForSettingsWindowLoaded();

//   if (user.type === 'twitch') {
//     await fillForm({
//       twitchGame: 'Fortnite',
//     });
//   }

//   await clickToggle('recording-toggle');
//   await submit();
//   await waitForStreamStart();
//   await focusMain();
//   await sleep(2000); // Record for 2s
//   await stopRecording();
//   await stopStream();
//   expectedFileCount++;

//   // Case 2: Start stream with recording and replay buffer
//   await toggleReplayBuffer(true);
//   await prepareToGoLive();
//   await clickGoLive();
//   await waitForSettingsWindowLoaded();

//   if (user.type === 'twitch') {
//     await fillForm({
//       twitchGame: 'Fortnite',
//     });
//   }

//   await clickToggle('recording-toggle');
//   await submit();
//   await waitForStreamStart();
//   await focusMain();
//   await sleep(2000);
//   await saveReplayBuffer(); // Save a replay clip
//   expectedFileCount++;
//   await stopRecording();
//   await stopStream();
//   expectedFileCount++;

//   // Case 3: Continue recording after stream end
//   await prepareToGoLive();
//   await clickGoLive();
//   await waitForSettingsWindowLoaded();

//   if (user.type === 'twitch') {
//     await fillForm({
//       twitchGame: 'Fortnite',
//     });
//   }

//   await clickToggle('recording-toggle');
//   await submit();
//   await waitForStreamStart();
//   await focusMain();
//   await sleep(1000);
//   await stopStream(); // Stop stream but keep recording
//   await sleep(2000); // Continue recording for 2 more seconds
//   await stopRecording();
//   expectedFileCount++;

//   // Case 4: Continue replay buffer after stream end
//   await prepareToGoLive();
//   await clickGoLive();
//   await waitForSettingsWindowLoaded();

//   if (user.type === 'twitch') {
//     await fillForm({
//       twitchGame: 'Fortnite',
//     });
//   }

//   await submit();
//   await waitForStreamStart();
//   await focusMain();
//   await sleep(1000);
//   await stopStream(); // Stop stream but keep replay buffer
//   await sleep(1000);
//   await saveReplayBuffer(); // Save replay after stream ends
//   expectedFileCount++;

//   // Case 5: Toggle on recording while streaming
//   await prepareToGoLive();
//   await clickGoLive();
//   await waitForSettingsWindowLoaded();

//   if (user.type === 'twitch') {
//     await fillForm({
//       twitchGame: 'Fortnite',
//     });
//   }

//   await submit();
//   await waitForStreamStart();
//   await focusMain();
//   await sleep(1000);
//   await startRecording(); // Start recording after stream started
//   await sleep(2000);
//   await stopRecording();
//   await stopStream();
//   expectedFileCount++;

//   // Case 6: Toggle on recording while replay buffer active
//   await toggleReplayBuffer(true);
//   await focusMain();
//   await sleep(1000); // Let replay buffer start
//   await startRecording(); // Start recording with replay buffer active
//   await sleep(2000);
//   await saveReplayBuffer(); // Save replay while recording
//   expectedFileCount++;
//   await stopRecording();
//   expectedFileCount++;

//   // Case 7: Single output mode (already tested above, but let's be explicit)
//   await toggleReplayBuffer(false);
//   await showSettingsWindow('Output', async () => {
//     const { setDropdownInputValue } = useForm('Mode');
//     await setDropdownInputValue('Mode', 'Simple');
//     await clickButton('Close');
//   });

//   await prepareToGoLive();
//   await clickGoLive();
//   await waitForSettingsWindowLoaded();

//   if (user.type === 'twitch') {
//     await fillForm({
//       twitchGame: 'Fortnite',
//     });
//   }

//   await clickToggle('recording-toggle');
//   await submit();
//   await waitForStreamStart();
//   await focusMain();
//   await sleep(2000);
//   await stopRecording();
//   await stopStream();
//   expectedFileCount++;

//   // Case 8: Dual output mode
//   await toggleDualOutputMode();
//   await toggleReplayBuffer(true);

//   await prepareToGoLive();
//   await clickGoLive();
//   await waitForSettingsWindowLoaded();

//   if (user.type === 'twitch') {
//     await fillForm({
//       twitchGame: 'Fortnite',
//     });
//   }

//   await clickToggle('recording-toggle');
//   await submit();
//   await waitForStreamStart();
//   await focusMain();
//   await sleep(2000);
//   await saveReplayBuffer();
//   expectedFileCount++;
//   await stopRecording();
//   await stopStream();
//   expectedFileCount++;

//   // Additional case: Start replay buffer while recording
//   await toggleDualOutputMode(); // Return to single output
//   await startRecording();
//   await sleep(1000);
//   await toggleReplayBuffer(true);
//   await sleep(1000);
//   await saveReplayBuffer();
//   expectedFileCount++;
//   await stopRecording();
//   expectedFileCount++;

//   // Additional case: Start replay buffer while streaming
//   await toggleReplayBuffer(false);
//   await prepareToGoLive();
//   await clickGoLive();
//   await waitForSettingsWindowLoaded();

//   if (user.type === 'twitch') {
//     await fillForm({
//       twitchGame: 'Fortnite',
//     });
//   }

//   await submit();
//   await waitForStreamStart();
//   await focusMain();
//   await sleep(1000);
//   await toggleReplayBuffer(true);
//   await sleep(1000);
//   await saveReplayBuffer();
//   expectedFileCount++;
//   await stopStream();

//   // Additional case: Multiple replay saves during one session
//   await toggleReplayBuffer(true);
//   await startRecording();
//   await sleep(1000);
//   await saveReplayBuffer(); // First replay save
//   expectedFileCount++;
//   await sleep(1000);
//   await saveReplayBuffer(); // Second replay save
//   expectedFileCount++;
//   await stopRecording();
//   expectedFileCount++;

//   // Validate all files were created
//   await validateRecordingFiles(t, tmpDir, expectedFileCount, true);

//   // Clean up - disable replay buffer
//   await toggleReplayBuffer(false);

//   t.pass();
// });
