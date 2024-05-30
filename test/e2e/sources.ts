import { focusChild, focusMain } from '../helpers/modules/core';
import {
  addSource,
  clickRemoveSource,
  clickSourceProperties,
  openRenameWindow,
  selectSource,
  sourceIsExisting,
  waitForSourceExist,
} from '../helpers/modules/sources';
import { test, useWebdriver } from '../helpers/webdriver/index';

useWebdriver();

const sourceTypes = [
  'dshow_input',
  'wasapi_output_capture',
  'wasapi_input_capture',
  'game_capture',
  'window_capture',
  'monitor_capture',
  'image_source',
  'slideshow',
  'ffmpeg_source',
  'text_gdiplus',
  'color_source',
  'browser_source',
];

test('Adding and removing some sources', async t => {
  for (const sourceType of sourceTypes) {
    const sourceName = `Example ${sourceType}`;

    await addSource(sourceType, sourceName);
    await focusMain();

    t.true(await sourceIsExisting(sourceName));

    await selectSource(sourceName);
    await clickRemoveSource();

    await waitForSourceExist(sourceName, true);
  }
});

test('Viewing source properties', async t => {
  const client = t.context.app.client;
  const sourceName = 'Cool Color Source';

  await addSource('color_source', sourceName);

  await focusMain();
  await selectSource(sourceName);
  await clickSourceProperties();

  await focusChild();
  t.true(await client.$('[data-test="Form/Color/color"]').isExisting());
});

test('Rename source', async t => {
  const client = t.context.app.client;
  const sourceName = 'MyColorSource1';
  const newSourceName = 'MyColorSource2';

  await addSource('color_source', sourceName);

  await openRenameWindow(sourceName);
  await client.$('input').setValue(newSourceName);
  await client.$('[data-test="Done"]').click();

  await focusMain();
  t.true(await sourceIsExisting(newSourceName));
});
