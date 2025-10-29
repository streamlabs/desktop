import {
  click,
  clickButton,
  clickCheckbox,
  clickTab,
  focusMain,
  useMainWindow,
  waitForDisplayed,
} from './core';
import { sleep } from '../sleep';
import { ExecutionContext } from 'ava';
import { ITestContext } from '../webdriver';
import { readdir } from 'fs-extra';
import { showSettingsWindow } from './settings/settings';
import { useForm } from './forms';

export async function startReplayBuffer() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  await useMainWindow(async () => {
    await click('button .icon-replay-buffer');
    await waitForDisplayed('button .fa.fa-stop');
  });
}

export async function saveReplayBuffer() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  await useMainWindow(async () => {
    await click('button .icon-save');
    await sleep(5000); // saving takes some time
  });
}

export async function stopReplayBuffer() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  await useMainWindow(async () => {
    await click('button .fa.fa-stop');
    await waitForDisplayed('button .icon-replay-buffer', { timeout: 15000 });
  });
}

export async function recordHighlight(
  t: ExecutionContext<ITestContext>,
  tmpDir: string,
  numFiles: number,
  message: string,
  start: boolean = true,
) {
  // record a fragment
  if (start) {
    await startReplayBuffer();
  }
  await saveReplayBuffer();
  await stopReplayBuffer();

  // Check that the replay-buffer file has been created
  await sleep(3000);
  const files = await readdir(tmpDir);
  t.is(files.length, numFiles, message);
}

export async function toggleReplayBuffer(advanced: boolean = false) {
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
