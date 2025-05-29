import { test, useWebdriver } from '../../helpers/webdriver';
import { clickCheckbox, getNumElements, select } from '../../helpers/modules/core';
import { showSettingsWindow } from '../../helpers/modules/settings/settings';
import { useForm } from '../../helpers/modules/forms';
import { ListInputController } from '../../helpers/modules/forms/list';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Populates simple output mode settings', async t => {
  await showSettingsWindow('Output');
  const { fillForm } = useForm('Mode');

  await fillForm({ Mode: 'Simple' });

  // Video Bitrate
  const videoBitrate = await (await select('[data-title="Video Bitrate"]')).getValue();
  t.is(parseInt(videoBitrate, 10), 2500, 'Video Bitrate is correct default');

  const { getInput, getInputListValues, assertFormContains } = useForm('Streaming');

  // Audio Bitrates dropdown
  const audioBitrates: { label: string; value: string }[] = await getInputListValues('ABitrate');

  audioBitrates.forEach(async (el: { label: string; value: string }) => {
    const text = el.value;
    t.true(parseInt(text, 10) > 0, 'Audio bitrate option is a number');
  });
  t.true((await getNumElements('div[data-option-list="ABitrate"')) > 0, 'Audio bitrates exist');

  // Test that we can switch encoders and all options are present
  const encoders: ListInputController<{ label: string; value: string }> = await getInput(
    'StreamEncoder',
  );
  t.true((await encoders.getOptions()).length > 0, 'Encoders exist');

  assertFormContains({ StreamEncoder: 'Software (x264)' });

  // We can enable replay buffer
  await clickCheckbox('RecRB');
});
