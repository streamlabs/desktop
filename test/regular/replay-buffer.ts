import { readdir } from 'fs-extra';
import { ITestContext, test, useWebdriver } from '../helpers/webdriver';
import { sleep } from '../helpers/sleep';
import {
  setOutputResolution,
  setTemporaryRecordingPath,
  showSettingsWindow,
} from '../helpers/modules/settings/settings';
import {
  clickButton,
  clickCheckbox,
  clickTab,
  focusMain,
  isDisplayed,
} from '../helpers/modules/core';
import {
  saveReplayBuffer,
  startReplayBuffer,
  stopReplayBuffer,
} from '../helpers/modules/replay-buffer';
import { ExecutionContext } from 'ava';
import { useForm } from '../helpers/modules/forms';

// Matches filenames produced by the default OBS FilenameFormatting value
// ("%CCYY-%MM-%DD %hh-%mm-%ss"), e.g. "2024-01-15 10-23-45.mp4".
// A static name like "Replay.mp4" would not match.
const TIMESTAMP_FILENAME_RE = /\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}/;

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

async function recordHighlight(
  t: ExecutionContext<ITestContext>,
  tmpDir: string,
  numFiles: number,
  message: string,
) {
  // record a fragment
  await startReplayBuffer();
  await sleep(500);
  await saveReplayBuffer();
  await stopReplayBuffer();

  // Check that the replay-buffer file has been created
  await sleep(3000);
  const files = await readdir(tmpDir);
  t.is(files.length, numFiles, message);
}

async function toggleReplayBuffer(advanced: boolean = false) {
  await showSettingsWindow('Output', async () => {
    const { setDropdownInputValue } = useForm('Mode');

    if (advanced) {
      await setDropdownInputValue('Mode', 'Advanced');
      await clickTab('Replay Buffer');
    } else {
      await setDropdownInputValue('Mode', 'Simple');
    }

    await clickCheckbox('RecRB');
    await clickButton('Close');
    await focusMain();
  });
}

test('Replay Buffer filenames contain a timestamp', async t => {
  const tmpDir = await setTemporaryRecordingPath();
  await setOutputResolution('100x100');

  await startReplayBuffer();
  await sleep(500);
  await saveReplayBuffer();
  await stopReplayBuffer();

  await sleep(3000);
  const files = await readdir(tmpDir);
  t.is(files.length, 1, 'One replay file was saved');
  t.regex(files[0], TIMESTAMP_FILENAME_RE, `Filename "${files[0]}" should contain a timestamp`);
});

test('Replay Buffer', async t => {
  const tmpDir = await setTemporaryRecordingPath();
  await setOutputResolution('100x100');

  // Simple Replay Buffer
  await recordHighlight(t, tmpDir, 1, 'Simple Replay Buffer recorded highlight');

  // disable replay buffer
  await toggleReplayBuffer();

  // check Start Replay Buffer is not visible
  t.false(await isDisplayed('button .icon-replay-buffer'), 'Simple Replay Buffer stopped');

  // Advanced Replay Buffer
  await setTemporaryRecordingPath(true, tmpDir);
  await toggleReplayBuffer(true);
  await recordHighlight(t, tmpDir, 2, 'Advanced Replay Buffer recorded highlight');
  await toggleReplayBuffer(true);

  // check Start Replay Buffer is not visible
  t.false(await isDisplayed('button .icon-replay-buffer'), 'Advanced Replay Buffer stopped');

  // // Switch back to Simple Replay Buffer
  await toggleReplayBuffer();
  await recordHighlight(t, tmpDir, 3, 'Switches between Simple and Advanced Replay Buffer');
});
