import { click, useMainWindow, waitForDisplayed } from './core';
import { sleep } from '../sleep';
import { TExecutionContext } from '../webdriver';
import { readdir } from 'fs-extra';

export async function startReplayBuffer() {
  // not a react hook
  // eslint-disable-next-line react-hooks/rules-of-hooks
  await useMainWindow(async () => {
    await click('button .icon-replay-buffer');
    await waitForDisplayed('button .fa.fa-stop');
  });
}

export async function saveReplayBuffer() {
  // not a react hook
  // eslint-disable-next-line react-hooks/rules-of-hooks
  await useMainWindow(async () => {
    await click('button .icon-save');
    await sleep(5000); // saving takes some time
  });
}

export async function stopReplayBuffer() {
  // not a react hook
  // eslint-disable-next-line react-hooks/rules-of-hooks
  await useMainWindow(async () => {
    await click('button .fa.fa-stop');
    await waitForDisplayed('button .icon-replay-buffer', { timeout: 15000 });
  });
}

/**
 * Run a function and validate that a file was created
 */
export async function useFileValidation(
  t: TExecutionContext,
  numFiles: number,
  tmpDir: string,
  message: string,
  fn: (any?: any) => Promise<any>,
) {
  await fn();
  await sleep(300);
  const files = await readdir(tmpDir);
  t.is(files.length, numFiles, `${message}. Expected ${numFiles} and retrieved ${files.length}`);
}
