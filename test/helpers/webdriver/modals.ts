import { TExecutionContext } from '.';
import { sleep } from '../sleep';

export async function dismissModal(t: TExecutionContext) {
  // Wait for appear animation to play
  await sleep(500);
  // For some reason, clicking to dismiss the modal isn't working on the latest
  // version of webdriverio, so we dismiss with the escape key instead
  await t.context.app.client.keys('Escape');

  // Wait for dismiss animation to play
  await sleep(500);
}
