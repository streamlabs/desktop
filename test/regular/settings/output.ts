import { test, useWebdriver } from '../../helpers/webdriver';
import { setFormDropdown } from '../../helpers/webdriver/forms';
import { focusChild, focusMain } from '../../helpers/modules/core';
import { useForm } from '../../helpers/modules/forms';

useWebdriver();

test('Populates simple output mode settings', async t => {
  const { app } = t.context;

  await focusMain();
  await (await app.client.$('.side-nav .icon-settings')).click();

  await focusChild();
  await (await app.client.$('li=Output')).click();

  await setFormDropdown('Mode', 'Simple');

  await (await app.client.$('[data-name="Streaming-Section"]')).click();

  // Video Bitrate
  const videoBitrate = await (await app.client.$('[data-title="Video Bitrate"]')).getValue();
  t.is(parseInt(videoBitrate, 10), 2500);

  // TODO: Selector needs to be fixed i think?
  // Audio Bitrates dropdown
  // await (await app.client.$('[data-name=ABitrate]')).click();
  // const audioBitrates = await app.client.execute(() => {
  //   return Array.from(
  //     document.querySelectorAll('.ant-select-dropdown div[role="listbox"] div[role="option"]'),
  //   ).map(el => parseInt(el.textContent, 10));
  // });

  // t.true(audioBitrates.length > 0, 'Audio bitrates exists');

  // Test that we can switch encoders and all options are present
  for (const encoder of [
    'Software (x264)', // CI doesn't have hardware support
  ]) {
    await t.notThrowsAsync(
      setFormDropdown('Encoder', encoder),
      `${encoder} was not found as an option`,
    );
  }

  // TODO: Fix
  // await (await app.client.$('[data-name="Replay Buffer-Section"]')).click();

  // const { getInput } = useForm();
  // We can enable replay buffer
  // await t.notThrowsAsync(async () => await (await getInput('[data-name="RecRB"]')).setValue(true));
});
