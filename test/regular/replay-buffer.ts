import { readdir } from 'fs-extra';
import { ITestContext, test, useWebdriver } from '../helpers/webdriver';
import { sleep } from '../helpers/sleep';
import {
  setOutputResolution,
  setTemporaryRecordingPath,
  showSettingsWindow,
} from '../helpers/modules/settings/settings';
import { click, clickButton, focusMain, isDisplayed, select } from '../helpers/modules/core';
import {
  saveReplayBuffer,
  startReplayBuffer,
  stopReplayBuffer,
} from '../helpers/modules/replay-buffer';
import { ExecutionContext } from 'ava';
import { setFormDropdown } from '../helpers/webdriver/forms';

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
  await saveReplayBuffer();
  await stopReplayBuffer();

  // Check that the replay-buffer file has been created
  await sleep(3000);
  const files = await readdir(tmpDir);
  t.is(files.length, numFiles, message);
}

async function toggleReplayBuffer(advanced: boolean = false) {
  await showSettingsWindow('Output', async () => {
    if (advanced) {
      await setFormDropdown('Output Mode', 'Advanced');
      await clickButton('Replay Buffer');
      await click(await select('div[data-name="RecRB"]'));
    } else {
      await setFormDropdown('Output Mode', 'Simple');
      await click('label=Enable Replay Buffer');
    }

    await sleep(3000);
    await clickButton('Done');
    await focusMain();
  });
}

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
