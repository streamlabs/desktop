import { click, useMainWindow, waitForDisplayed } from './core';
import { sleep } from '../sleep';

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
