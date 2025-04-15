import { useWebdriver, test } from '../../helpers/webdriver';
import { getApiClient } from '../../helpers/api-client';
import { SceneBuilder } from '../../helpers/scene-builder';
import { ScenesService } from '../../../app/services/api/external-api/scenes';
import { VideoService, DualOutputService } from 'app-services';

const path = require('path');

useWebdriver({ restartAppAfterEachTest: false });

test('The default scene exists', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const scenes = scenesService.getScenes();

  t.true(scenes.length === 1);
});

test('Creating, fetching and removing scenes', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');

  const scene2 = scenesService.createScene('Scene2');

  t.is(scene2.name, 'Scene2');

  let scenes = scenesService.getScenes();
  let scenesNames = scenes.map(scene => scene.name);

  t.deepEqual(scenesNames, ['Scene', 'Scene2']);

  scenesService.removeScene(scenes[1].id);
  scenes = scenesService.getScenes();
  scenesNames = scenes.map(scene => scene.name);

  t.deepEqual(scenesNames, ['Scene']);

  // check the correct error message on removed item
  let gotError = false;
  try {
    scene2.remove();
  } catch (e) {
    gotError = true;
  }
  t.true(gotError);
});

test('Switching between scenes', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const scene = scenesService.getScenes().find(scene => scene.name === 'Scene');
  const scene2 = scenesService.createScene('Scene2');

  t.is(scene.id, scenesService.activeSceneId);

  scenesService.makeSceneActive(scene2.id);

  t.is(scene2.id, scenesService.activeSceneId);

  scene2.remove();

  t.is(scene.id, scenesService.activeSceneId);
});

test('Creating, fetching and removing scene-items', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const scene = scenesService.getScenes().find(scene => scene.name === 'Scene');
  const image1 = scene.createAndAddSource('Image1', 'image_source');
  const image2 = scene.createAndAddSource('Image2', 'image_source');
  t.is(image1['name'], 'Image1');

  let items = scene.getItems().map(item => item.getModel());
  let itemsNames = items.map(item => item.name);
  t.deepEqual(itemsNames, ['Image2', 'Image1']);

  scene.removeItem(image2.sceneItemId);
  items = scene.getItems().map(item => item.getModel());

  // special check for the Streamdeck
  t.falsy(items[0]['childrenIds'], 'Scene Items must not have children');

  itemsNames = items.map(item => item.name);
  t.deepEqual(itemsNames, ['Image1']);
});

test.skip('Scenes events', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');

  scenesService.sceneSwitched.subscribe(() => void 0);
  scenesService.sceneAdded.subscribe(() => void 0);
  scenesService.sceneRemoved.subscribe(() => void 0);
  scenesService.itemAdded.subscribe(() => void 0);
  scenesService.itemRemoved.subscribe(() => void 0);
  scenesService.itemUpdated.subscribe(() => void 0);

  const scene2 = scenesService.createScene('Scene2');
  let event = await client.fetchNextEvent();
  setTimeout(() => {}, 500);

  t.is(event.data.name, 'Scene2');

  const scene3 = scenesService.createScene('Scene3');
  setTimeout(() => {}, 500);
  await client.fetchNextEvent();

  scenesService.makeSceneActive(scene2.id);
  setTimeout(() => {}, 500);
  event = await client.fetchNextEvent();
  t.is(event.data.name, 'Scene2');

  scene3.remove();
  setTimeout(() => {}, 500);
  event = await client.fetchNextEvent();
  t.is(event.data.name, 'Scene3');

  const image = scene2.createAndAddSource('image', 'image_source');
  setTimeout(() => {}, 500);
  event = await client.fetchNextEvent();
  t.is(event.data.sceneItemId, image.sceneItemId);

  image.setVisibility(false);
  setTimeout(() => {}, 500);
  event = await client.fetchNextEvent();
  t.is(event.data.visible, false);
  t.is(event.data.name, 'image');
  t.truthy(event.data.resourceId); // the remote control app requires `resourceId` to be in the event

  image.remove();
  setTimeout(() => {}, 500);
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
  let errorIsThrew = false;
  try {
    sceneA.addSource(sceneC.id);
  } catch (e) {
    errorIsThrew = true;
  }
  t.true(errorIsThrew);
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
  const dataDir = path.resolve(__dirname, '..', '..', '..', '..', 'test', 'data', 'sources-files');

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

test('Try to make a not existing scene active', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const sceneHasBeenSwitched = scenesService.makeSceneActive('This id does not exist');
  t.false(sceneHasBeenSwitched);
});

test('Scene.getNestedItems()', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const scene1 = scenesService.createScene('Scene1');
  const scene2 = scenesService.createScene('Scene2');

  const scene1Item1 = scene1.createAndAddSource('Item1', 'color_source');
  const scene1Item2 = scene1.addSource(scene2.getSource().id);
  const scene2Item1 = scene2.createAndAddSource('Item1', 'color_source');

  const nestedItems = scene1.getNestedItems();
  const nestedItemIds = nestedItems.map(item => item.id).sort();
  const expectedItemIds = [scene1Item1, scene1Item2, scene2Item1].map(item => item.id).sort();

  scene1.remove();
  scene2.remove();

  t.is(nestedItems.length, 3);
  t.deepEqual(nestedItemIds, expectedItemIds);
});

test('SceneNode.getNextNode()', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const scene = scenesService.createScene('Scene1');
  const sceneNode1 = scene.createAndAddSource('Item1', 'color_source');
  const sceneNode2 = scene.createAndAddSource('Item2', 'color_source');
  const sceneNode3 = scene.createAndAddSource('Item3', 'color_source');
  let nextSceneNode = sceneNode2.getNextNode();
  t.is(nextSceneNode.nodeId, sceneNode1.nodeId);

  nextSceneNode = sceneNode3.getNextNode();
  t.is(nextSceneNode.nodeId, sceneNode2.nodeId);
});
