import { TExecutionContext, test, useWebdriver } from '../helpers/webdriver/index';
import { addSource, sourceIsExisting } from '../helpers/modules/sources';
import {
  addScene,
  clickRemoveScene,
  selectScene,
  openRenameWindow,
  openDuplicateWindow,
  sceneIsExisting,
  DefaultSceneName,
} from '../helpers/modules/scenes';
import { getApiClient } from '../helpers/api-client';
import { click, focusMain, waitForDisplayed } from '../helpers/modules/core';
import { SceneCollectionsService } from 'services/scene-collections';
import { setInputValue } from '../helpers/modules/forms/form';

useWebdriver();

// Checks for the default audio sources
async function checkDefaultSources() {
  await focusMain();
  await waitForDisplayed('[data-test="Mixer"] [data-test-source-type="wasapi_output_capture"]');
  await waitForDisplayed('[data-test="Mixer"] [data-test-source-type="wasapi_input_capture"]');
}

test('The default scene', async (t: TExecutionContext) => {
  await focusMain();
  t.true(await sceneIsExisting(DefaultSceneName));
  await checkDefaultSources();
  t.pass();
});

test('Adding and removing a scene', async (t: TExecutionContext) => {
  const sceneName = 'Coolest Scene Ever';

  await addScene(sceneName);

  await focusMain();
  await new Promise(x => {
    setTimeout(x, 0);
  });
  t.true(await sceneIsExisting(sceneName));

  await selectScene(sceneName);
  await checkDefaultSources();
  await clickRemoveScene();

  t.false(await sceneIsExisting(sceneName));
});

test('Scene switching with sources', async (t: TExecutionContext) => {
  const sceneName = 'Coolest Scene Ever';
  const sourceName = 'Awesome Source';

  await addSource('color_source', sourceName);

  await focusMain();
  t.true(await sourceIsExisting(sourceName));

  // Adding a new scene will make that scene active, so we can't see
  // the source we just added.
  await addScene(sceneName);
  await focusMain();
  t.false(await sourceIsExisting(sourceName));

  // Switch back to the default scene
  await selectScene(DefaultSceneName);
  t.true(await sourceIsExisting(sourceName));
});

test('Restarting the app preserves the default sources', async (t: TExecutionContext) => {
  const client = await getApiClient();
  const sceneName = 'Coolest Scene Ever';
  const sceneCollectionsService =
    client.getResource<SceneCollectionsService>('SceneCollectionsService');

  await addScene(sceneName);

  await focusMain();
  t.true(await sceneIsExisting(sceneName));

  // reload config
  await sceneCollectionsService.load(sceneCollectionsService.collections[0].id);

  await focusMain();
  await selectScene(sceneName);
  await checkDefaultSources();
  t.pass();
});

test('Rename scene', async t => {
  const newSceneName = 'Scene2';

  await openRenameWindow(DefaultSceneName);
  await setInputValue('input', newSceneName);
  await click('[data-test="Done"]');

  await focusMain();

  t.true(await sceneIsExisting(newSceneName));
  t.pass();
});

test('Duplicate scene', async t => {
  const sceneName = 'My Scene';
  await addScene(sceneName);
  await focusMain();
  t.true(await sceneIsExisting(sceneName));
  await openDuplicateWindow(sceneName);
  await click('[data-test="Done"]');
  await focusMain();
  t.true(await sceneIsExisting(`${sceneName} (1)`));
  t.pass();
});
