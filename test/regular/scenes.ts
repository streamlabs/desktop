import { useWebdriver, test } from '../helpers/webdriver';
import { addSource, sourceIsExisting } from '../helpers/modules/sources';
import {
  addScene,
  clickRemoveScene,
  selectScene,
  openRenameWindow,
  openDuplicateWindow,
} from '../helpers/modules/scenes';
import { getApiClient } from '../helpers/api-client';
import { SceneCollectionsService } from 'app-services';
import { clickButton, focusMain, select, waitForDisplayed } from '../helpers/modules/core';
import { useForm } from '../helpers/modules/forms';
import { ScenesService } from '../../app/services/api/external-api/scenes';
import { VideoSettingsService } from 'services/settings-v2';

useWebdriver();

// Checks for the default audio sources
async function checkDefaultSources() {
  await focusMain();
  await waitForDisplayed('div=Mic/Aux');
  await waitForDisplayed('div=Desktop Audio');
}

test('The default scene', async t => {
  await focusMain();
  await waitForDisplayed('div=Scene');
  await checkDefaultSources();
  t.pass();
});

test('Adding and removing a scene', async t => {
  const sceneName = 'Coolest Scene Ever';

  await addScene(sceneName);

  await focusMain();
  await waitForDisplayed(`div=${sceneName}`);

  await selectScene(sceneName);
  await checkDefaultSources();
  await clickRemoveScene(sceneName);

  t.false(await (await select(`div=${sceneName}`)).isExisting());
});

test('Scene switching with sources', async t => {
  const sceneName = 'Coolest Scene Ever';
  const sourceName = 'Awesome Source';

  await addSource('Color Block', sourceName);

  await focusMain();
  t.true(await sourceIsExisting(sourceName));

  // Adding a new scene will make that scene active, so we can't see
  // the source we just added.
  await addScene(sceneName);
  await focusMain();
  t.false(await sourceIsExisting(sourceName));

  // Switch back to the default scene
  await selectScene('Scene');
  t.true(await sourceIsExisting(sourceName));
});

test('Restarting the app preserves the default sources', async t => {
  const client = await getApiClient();
  const sceneName = 'Coolest Scene Ever';
  const sceneCollectionsService = client.getResource<SceneCollectionsService>(
    'SceneCollectionsService',
  );

  await addScene(sceneName);

  await focusMain();
  await waitForDisplayed(`div=${sceneName}`);

  // reload config
  await sceneCollectionsService.load(sceneCollectionsService.collections[0].id);

  await focusMain();
  await selectScene(sceneName);
  await checkDefaultSources();
  t.pass();
});

test('Rename scene', async t => {
  const newSceneName = 'Scene2';
  await openRenameWindow('Scene');
  const { fillForm } = useForm('nameSceneForm');
  await fillForm({ sceneName: newSceneName });
  await clickButton('Done');
  await focusMain();
  await waitForDisplayed(`div=${newSceneName}`);
  t.pass();
});

test('Duplicate scene', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const videoSettingsService = client.getResource<VideoSettingsService>('VideoSettingsService');
  const sceneName = 'My Scene';
  await addScene(sceneName);
  const scene = scenesService.getScenes().find(candidate => candidate.name === sceneName)!;
  const childScene = scenesService.createScene('Nested crop source');
  const nestedItem = scene.addSource(childScene.id);
  const currentCanvas = videoSettingsService.baseResolutions.horizontal;
  const authoredCrop = {
    top: 101,
    right: 203,
    bottom: 305,
    left: 407,
    referenceWidth: currentCanvas.baseWidth * 2,
    referenceHeight: currentCanvas.baseHeight * 2,
  };
  nestedItem.setTransform({ crop: authoredCrop });
  scenesService.makeSceneActive(scene.id);

  await focusMain();
  await waitForDisplayed(`div=${sceneName}`);
  await openDuplicateWindow(sceneName);
  await clickButton('Done');
  await focusMain();
  await waitForDisplayed(`div=${sceneName} (1)`);

  const duplicate = scenesService
    .getScenes()
    .find(candidate => candidate.name === `${sceneName} (1)`)!;
  const copiedNestedItem = duplicate.getItems().find(item => item.sourceId === childScene.id)!;
  t.deepEqual(copiedNestedItem.getModel().transform.crop, {
    top: Math.trunc(authoredCrop.top / 2),
    right: Math.trunc(authoredCrop.right / 2),
    bottom: Math.trunc(authoredCrop.bottom / 2),
    left: Math.trunc(authoredCrop.left / 2),
  });
});
