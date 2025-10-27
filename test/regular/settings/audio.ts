import { test, useWebdriver } from '../../helpers/webdriver';
import { assertOptions } from '../../helpers/webdriver/assertions';
import { showSettingsWindow } from '../../helpers/modules/settings/settings';
import { focusMain } from '../../helpers/modules/core';
import { assertFormContains } from '../../helpers/modules/forms';

useWebdriver();

test('Populates audio settings', async t => {
  await showSettingsWindow('Audio');

  await assertFormContains(
    {
      'Sample Rate (requires a restart)': '44.1khz',
      'Channels (requires a restart)': 'Stereo',
    },
    'title',
  );

  /*
   * Since this is hardware-specific (and devices look disabled on AppVeyor), all we can test is
   * that we have two audio devices and 3 mic/aux.
   */
  const { app } = t.context;
  t.true(await (await app.client.$('label=Desktop Audio Device 1')).isExisting());
  t.true(await (await app.client.$('label=Desktop Audio Device 2')).isExisting());

  t.true(await (await app.client.$('label=Mic/Auxiliary Device 1')).isExisting());
  t.true(await (await app.client.$('label=Mic/Auxiliary Device 2')).isExisting());
  t.true(await (await app.client.$('label=Mic/Auxiliary Device 3')).isExisting());

  // Test that we're displaying mixer settings in the footer
  await (await app.client.$('button=Done')).click();
  await focusMain();
  t.true(await (await app.client.$('.source-name=Desktop Audio')).isExisting());
  t.true(await (await app.client.$('.source-name*=Mic')).isExisting());
  t.true(await (await app.client.$('.volmeter-container')).isExisting());
});
