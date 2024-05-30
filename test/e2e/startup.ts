import { TExecutionContext, test, useWebdriver } from '../helpers/webdriver/index';
import { focusChild, focusMain, getFocusedWindowId } from '../helpers/modules/core';

useWebdriver();

test('Main and child window visibility', async (t: TExecutionContext) => {
  const app = t.context.app;
  await focusMain();
  t.true((await getFocusedWindowId()) === 'main');
  await focusChild();
  t.true((await getFocusedWindowId()) === 'child');
});
