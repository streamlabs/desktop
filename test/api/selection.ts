import { useWebdriver, test, afterAppStart } from '../helpers/webdriver';
import { getApiClient } from '../helpers/api-client';
import { ScenesService, Scene, SceneItemNode } from 'services/scenes';
import { SelectionService } from 'services/selection';
import { SceneBuilder } from '../helpers/scene-builder';

useWebdriver({ restartAppAfterEachTest: false });

let sceneBuilder: SceneBuilder;
let scene: Scene;
let getNode: (name: string) => SceneItemNode;
let getNodeId: (name: string) => string;
let selectionService: SelectionService;

afterAppStart(async t => {
  const client = await getApiClient();
  selectionService = client.getResource('SelectionService');
  sceneBuilder = new SceneBuilder(client);
  scene = sceneBuilder.scene;
  getNode = name => scene.getNodeByName(name);
  getNodeId = name => scene.getNodeByName(name).id;
});

test('Selection', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const selection = client.getResource<SelectionService>('SelectionService');
  const scene = scenesService.activeScene;
  selection.selectAll();
  const numPresetItems = selection.getSize();
  selection.reset();

  const color1 = scene.createAndAddSource('Color1', 'color_source');
  const color2 = scene.createAndAddSource('Color2', 'color_source');
  const color3 = scene.createAndAddSource('Color3', 'color_source');

  selection.select(color2.sceneItemId);

  t.true(!selection.isSelected(color1.sceneItemId));
  t.true(selection.isSelected(color2.sceneItemId));
  t.true(!selection.isSelected(color3.sceneItemId));

  selection.add(color3.sceneItemId);

  t.true(!selection.isSelected(color1.sceneItemId));
  t.true(selection.isSelected(color2.sceneItemId));
  t.true(selection.isSelected(color3.sceneItemId));

  selection.deselect(color3.sceneItemId);

  t.true(!selection.isSelected(color1.sceneItemId));
  t.true(selection.isSelected(color2.sceneItemId));
  t.true(!selection.isSelected(color3.sceneItemId));

  selection.invert();

  t.true(selection.isSelected(color1.sceneItemId));
  t.true(!selection.isSelected(color2.sceneItemId));
  t.true(selection.isSelected(color3.sceneItemId));

  selection.reset();

  t.is(selection.getSize(), 0);

  selection.selectAll();

  t.is(selection.getSize(), numPresetItems + 3);
});

test('Selection actions', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const selection = client.getResource<SelectionService>('SelectionService');
  const scene = scenesService.activeScene;

  let [color1, color2, color3] = scene.getItems();

  selection.select([color1.sceneItemId, color2.sceneItemId]);

  selection.setSettings({ visible: false });

  [color1, color2, color3] = scene.getItems();

  t.is(color1.visible, false);
  t.is(color2.visible, false);
  t.is(color3.visible, true);
});

test('Invalid selection', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const selection = client.getResource<SelectionService>('SelectionService');
  const anotherScene = scenesService.createScene('Another scene');
  const colorFromAnotherScene = anotherScene.createAndAddSource('MyColor', 'color_source');
  const [colorSource] = scenesService.activeScene.getItems();

  // invalid ids must be ignored
  selection.select([colorSource.sceneItemId, 'this_is_an_invalid_id']);
  t.deepEqual(selection.getIds(), [colorSource.sceneItemId]);

  // ids must be only from active scene
  selection.select([colorSource.sceneItemId, colorFromAnotherScene.sceneItemId]);
  t.deepEqual(selection.getIds(), [colorSource.sceneItemId]);
});

test('Place after', async t => {
  sceneBuilder.build(`
    Item1:
    Folder1
      Item2:
      Item3:
    Item4:
  `);

  selectionService.select([getNodeId('Item1'), getNodeId('Folder1')]);
  selectionService.placeAfter(getNodeId('Item4'));

  t.true(
    sceneBuilder.isEqualTo(`
    Item4:
    Item1:
    Folder1
      Item2:
      Item3:
  `),
  );
});

test('Place after folder with deep nesting', async t => {
  sceneBuilder.build(`
    Folder1
      Item1:
      Folder2
        Item2:
    Item4:
  `);

  selectionService.select(getNodeId('Folder1'));
  selectionService.placeAfter(getNodeId('Item4'));

  t.true(
    sceneBuilder.isEqualTo(`
    Item4:
    Folder1
      Item1:
      Folder2
        Item2:
  `),
  );
});

test('Place before', async t => {
  sceneBuilder.build(`
    Item1:
    Item2:
    Folder1
      Item3:
      Item4:
  `);

  selectionService.select([getNodeId('Item2'), getNodeId('Folder1')]);
  selectionService.placeBefore(getNodeId('Item1'));

  t.true(
    sceneBuilder.isEqualTo(`
    Item2:
    Folder1
      Item3:
      Item4:
    Item1:
  `),
  );
});

test('Set parent', async t => {
  sceneBuilder.build(`
    Folder1
    Folder2
      Item1:
      Item2:
    Item3:
  `);

  selectionService.select([getNodeId('Folder2'), getNodeId('Item3')]);
  selectionService.setParent(getNodeId('Folder1'));

  t.true(
    sceneBuilder.isEqualTo(`
    Folder1
      Folder2
        Item1:
        Item2:
      Item3:
  `),
  );
});
