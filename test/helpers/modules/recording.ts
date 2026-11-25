import { click, clickWhenDisplayed, focusMain, waitForDisplayed } from './core';

export async function startRecording() {
  await click('.record-button');
  await waitForDisplayed('.record-button.active');
}

export async function stopRecording() {
  await click('.record-button');
  await waitForDisplayed('.record-button:not(.active)', { timeout: 15000 });
}

/**
 * Open recording history once the completion notice reaches the notification queue.
 */
export async function openRecordingHistoryFromNotification() {
  await focusMain();
  // Audio and replay-buffer notices can each occupy the notification area for eight seconds.
  await clickWhenDisplayed('span=A new Recording has been completed. Click for more info', {
    timeout: 20000,
  });
  await waitForDisplayed('h1=Recordings', { timeout: 10000 });
}
