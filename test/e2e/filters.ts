import { useWebdriver, test } from '../helpers/webdriver/index';
import { addFilter, openFiltersWindow, removeFilter } from '../helpers/modules/filters';
import { addSource } from '../helpers/modules/sources';
import { focusChild } from '../helpers/modules/core';

useWebdriver({ restartAppAfterEachTest: false });

test('Adding and removing a source filter', async t => {
  const app = t.context.app;
  const sourceName = 'Color Source';
  const filterName = 'Color Correction';

  await addSource('color_source', sourceName);
  await addFilter(sourceName, 'color_filter', filterName);
  await openFiltersWindow(sourceName);
  await focusChild();

  t.true(await app.client.$('[data-test="Form/Slider/opacity"]').isExisting());

  await removeFilter(sourceName, filterName);
  await openFiltersWindow(sourceName);
  await focusChild();

  t.false(await app.client.$('[data-test="Form/Slider/opacity"]').isExisting());
});
