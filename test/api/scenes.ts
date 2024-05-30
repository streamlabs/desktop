import { useWebdriver, test } from '../helpers/webdriver';
import { getApiClient } from '../helpers/api-client';
import { ScenesService } from 'services/scenes';
import { SceneBuilder } from '../helpers/scene-builder';
import { DefaultSceneName } from '../helpers/modules/scenes';
const path = require('path');

useWebdriver({ restartAppAfterEachTest: false });

test('The default scene exists', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const scenes = scenesService.getScenes();

  t.true(scenes.length === 2);
});

test('Creating, fetching and removing scenes', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  t.is(scenesService.getScenes().length, 2);
  const scenesBefore = scenesService.getScenes().map(s => s.name);

  const scene2 = scenesService.createScene('Scene2');

  t.is(scene2.name, 'Scene2');

  let scenes = scenesService
    .getScenes()
    .filter(scene => [...scenesBefore, 'Scene2'].includes(scene.name));
  let scenesNames = scenes.map(scene => scene.name);

  t.deepEqual(scenesNames, [...scenesBefore, 'Scene2']);

  scenesService.removeScene(scenes[scenes.length - 1].id);
  scenes = scenesService
    .getScenes()
    .filter(scene => [...scenesBefore, 'Scene2'].includes(scene.name));
  scenesNames = scenes.map(scene => scene.name);

  t.deepEqual(scenesNames, scenesBefore);
});

test('Switching between scenes', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  t.is(scenesService.getScenes().length, 2);

  const beforeActiveSceneId = scenesService.activeSceneId;

  const scene2 = scenesService.createScene('Scene2');

  t.is(beforeActiveSceneId, scenesService.activeSceneId);

  scenesService.makeSceneActive(scene2.id);

  t.is(scene2.id, scenesService.activeSceneId);

  scene2.remove();

  t.is(beforeActiveSceneId, scenesService.activeSceneId);
});

test('Creating, fetching and removing scene-items', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');

  const scene = scenesService.getSceneByName(DefaultSceneName);
  const presetItemIds = scene.getItems().map(item => item.id);
  const image1 = scene.createAndAddSource('Image1', 'image_source');
  const image2 = scene.createAndAddSource('Image2', 'image_source');
  t.is(image1['name'], 'Image1');

  let items = scene.getItems().filter(i => !presetItemIds.includes(i.id));
  let itemsNames = items.map(item => item['name']);
  t.deepEqual(itemsNames, ['Image2', 'Image1']);

  scene.removeItem(image2.sceneItemId);
  items = scene.getItems().filter(i => !presetItemIds.includes(i.id));
  itemsNames = items.map(item => item['name']);
  t.deepEqual(itemsNames, ['Image1']);
});

test('Scenes events', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  let event: Dictionary<any>;

  scenesService.sceneSwitched.subscribe(() => void 0);
  scenesService.sceneAdded.subscribe(() => void 0);
  scenesService.sceneRemoved.subscribe(() => void 0);
  scenesService.itemAdded.subscribe(() => void 0);
  scenesService.itemRemoved.subscribe(() => void 0);
  scenesService.itemUpdated.subscribe(() => void 0);

  const scene2 = scenesService.createScene('Scene2');
  event = await client.fetchNextEvent();

  t.is(event.data.name, 'Scene2');

  const scene3 = scenesService.createScene('Scene3');
  await client.fetchNextEvent();

  scenesService.makeSceneActive(scene2.id);
  event = await client.fetchNextEvent();
  t.is(event.data.name, 'Scene2');

  scene3.remove();
  event = await client.fetchNextEvent();
  t.is(event.data.name, 'Scene3');

  const image = scene2.createAndAddSource('image', 'image_source');
  event = await client.fetchNextEvent();
  t.is(event.data.sceneItemId, image.sceneItemId);

  image.setVisibility(false);
  event = await client.fetchNextEvent();

  // 待てば通せるようだがsleepでは別エラーになるので
  image.setVisibility(false);
  event = await client.fetchNextEvent();
  t.is(event.data.visible, false);

  image.remove();
  event = await client.fetchNextEvent();
  t.is(event.data.sceneItemId, image.sceneItemId);
});

test('Creating nested scenes', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');

  const sceneA = scenesService.createScene('SceneA');
  const sceneB = scenesService.createScene('SceneB');
  const sceneC = scenesService.createScene('SceneC');

  sceneA.addSource(sceneB.id);
  let sceneAItems = sceneA.getItems();
  let itemsANames = sceneAItems.map(item => item['name']);

  t.deepEqual(itemsANames, ['SceneB']);

  sceneC.addSource(sceneA.id);
  const sceneCItems = sceneC.getItems();
  const itemsCNames = sceneCItems.map(item => item['name']);

  t.deepEqual(itemsCNames, ['SceneA']);

  // Unable to add a source when the scene you are trying to add already contains your current scene
  sceneA.addSource(sceneC.id);
  sceneAItems = sceneA.getItems();
  itemsANames = sceneAItems.map(item => item['name']);

  t.deepEqual(itemsANames, ['SceneB']);
});

test('SceneItem.setSettings()', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const scene = scenesService.activeScene;

  const sceneItem = scene.createAndAddSource('MyColorSource', 'color_source');

  sceneItem.setTransform({ rotation: 90 });

  t.is(sceneItem.getModel().transform.rotation, 90);

  // rotation must be between 0 and 360
  sceneItem.setTransform({ rotation: 360 + 90 });
  t.is(sceneItem.getModel().transform.rotation, 90);

  sceneItem.setTransform({
    crop: {
      top: 1.2,
      bottom: 5.6,
      left: 7.1,
      right: 10,
    },
  });

  // crop values must be rounded
  t.deepEqual(sceneItem.getModel().transform.crop, {
    top: 1,
    bottom: 6,
    left: 7,
    right: 10,
  });
});

test('SceneItem.resetTransform()', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const scene = scenesService.activeScene;

  const sceneItem = scene.createAndAddSource('MyColorSource', 'color_source');

  sceneItem.setTransform({
    position: { x: 100, y: 100 },
    scale: { x: 100, y: 100 },
    crop: { top: 100, right: 100, bottom: 100, left: 100 },
    rotation: 100,
  });

  sceneItem.resetTransform();

  t.deepEqual(sceneItem.getModel().transform, {
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    crop: { top: 0, right: 0, bottom: 0, left: 0 },
    rotation: 0,
  });
});

test('SceneItem.addFile()', async t => {
  const dataDir = path.resolve(__dirname, '..', '..', '..', 'test', 'data', 'sources-files');

  const client = await getApiClient();
  const sceneBuilder = new SceneBuilder(client);
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const scene = scenesService.activeScene;

  scene.clear();
  scene.addFile(dataDir);

  t.true(
    sceneBuilder.isEqualTo(`
    sources-files
      html
        hello.html: browser_source
      images
        moon.png: image_source
        sun.png: image_source
      media
        alertbox.mp4: ffmpeg_source
        chatbox.mp4: ffmpeg_source
      text
        hello.txt: text_gdiplus
  `),
  );
});
