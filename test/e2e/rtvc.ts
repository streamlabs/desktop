import { click, focusChild, focusMain } from '../helpers/modules/core';
import { addScene } from '../helpers/modules/scenes';
import {
  addExistingSource,
  addSource,
  clickAddSource,
  clickRemoveSource,
  selectSource,
  sourceIsExisting,
  waitForSourceExist,
} from '../helpers/modules/sources';
import { test, useWebdriver } from '../helpers/webdriver/index';

// chromedriverのlogを有効にしないと、なぜかソース追加でフリーズしてしまう
useWebdriver({ chromeDriverLogging: true });

const sourceType = 'nair-rtvc-source';

test('rtvc Adding and removing source', async t => {
  const sourceName = `Example ${sourceType}`;
  await addSource(sourceType, sourceName);

  await focusMain();

  t.true(await sourceIsExisting(sourceName));

  await selectSource(sourceName);
  await clickRemoveSource();

  await waitForSourceExist(sourceName, true);
});

test('rtvc Check conditions that can be added', async t => {
  const client = t.context.app.client;

  const sourceName = `Example ${sourceType}`;

  // add rtvc source
  await addSource(sourceType, sourceName);
  await focusMain();
  t.true(await sourceIsExisting(sourceName));

  // can not add more rtvc source
  await focusMain();
  await clickAddSource();
  await focusChild();
  await click(`[data-test="${sourceType}"`);
  t.true((await client.$('[data-test="AddSource"]').getAttribute('disabled')) === 'true');
  // can add other source
  await click(`[data-test="image_source"`);
  t.true((await client.$('[data-test="AddSource"]').getAttribute('disabled')) === null);
  // close
  await click('[data-test="titlebar-close"]');

  // when other scene, can add rtvc source
  await focusMain();
  await addScene('s2');
  await addExistingSource(sourceType, sourceName);
  await focusMain();
  t.true(await sourceIsExisting(sourceName));
});
