import { TExecutionContext } from '.';
import { sleep } from '../sleep';

export async function dismissModal(t: TExecutionContext) {
  // await t.context.app.client.leftClick('.v--modal-background-click', 1, 1);
  await t.context.app.client.keys('Escape');

  // Wait for dismiss animation to play
  await sleep(500);
}
