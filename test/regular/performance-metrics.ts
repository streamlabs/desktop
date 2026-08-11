import { useWebdriver, test } from '../helpers/webdriver';
import { click, focusChild, select, waitForDisplayed } from '../helpers/modules/core';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Performance metrics', async t => {
  await click('.metrics-icon');
  await focusChild();
  await waitForDisplayed('h2=Live Stats');
  const $cpu = await select('[role=metric-cpu]');

  // By default, the CPU usage is set to 0 to prevent NaN values on app start
  // Wait until the CPU usage is updated to a value greater than 0
  await $cpu.waitUntil(async () => parseFloat(await $cpu.getText()) > 0, {
    timeout: 10000,
    timeoutMsg: 'CPU usage should be greater than 0',
  });
  const cpuUsage = parseFloat(await $cpu.getText());
  t.true(cpuUsage > 0, 'CPU usage should be greater than 0');
});
