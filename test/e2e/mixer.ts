import { focusMain } from '../helpers/modules/core';
import { addScene } from '../helpers/modules/scenes';
import {
  addExistingSource,
  addSource,
  clickRemoveSource,
  selectSource,
} from '../helpers/modules/sources';
import { test, useWebdriver } from '../helpers/webdriver';

useWebdriver();

test('Adding and removing a AudioSource', async t => {
  const client = t.context.app.client;

  await addSource('ffmpeg_source', 'Source With Audio');
  await addSource('color_source', 'Source Without Audio');
  await focusMain();

  t.true(await client.$('.mixer-panel').$('div=Source With Audio').isExisting());
  t.false(await client.$('.mixer-panel').$('div=Source Without Audio').isExisting());

  await selectSource('Source With Audio');
  await clickRemoveSource();

  await client
    .$('.mixer-panel')
    .$('div=Source With Audio')
    .waitForExist({ timeout: 5000, reverse: true });
});

test('Nested scenes should provide audio sources to mixer', async t => {
  const client = t.context.app.client;

  await addScene('1st Scene');
  await addSource('ffmpeg_source', 'Nested Media Source');
  await focusMain();

  await addScene('2nd Scene');
  await addSource('ffmpeg_source', 'Simple Media Source');
  await addExistingSource('scene', '1st Scene');

  await focusMain();
  t.true(await client.$('.mixer-panel').$('div=Simple Media Source').isExisting());
  t.true(await client.$('.mixer-panel').$('div=Nested Media Source').isExisting());
});
