import { useWebdriver, test, afterAppStart } from '../../helpers/webdriver';
import { getApiClient } from '../../helpers/api-client';
import { SceneBuilder } from '../../helpers/scene-builder';
import { Scene, SceneNode } from 'services/api/external-api/scenes';

useWebdriver({ restartAppAfterEachTest: false });

let sceneBuilder: SceneBuilder;
let scene: Scene;
let getNode: (name: string) => SceneNode;
let getNodeId: (name: string) => string;

afterAppStart(async t => {
  const client = await getApiClient();
  sceneBuilder = new SceneBuilder(client);
  scene = sceneBuilder.scene;
  getNode = name => scene.getNodeByName(name);
  getNodeId = name => scene.getNodeByName(name).id;
});

test('Place after and place before', async t => {
  sceneBuilder.build(`
    Folder1
    Item1:
    Item2:
    Folder2
  `);

  getNode('Item1').placeBefore(getNodeId('Folder1'));
  getNode('Item2').placeAfter(getNodeId('Folder2'));

  t.true(
    sceneBuilder.isEqualTo(`
    Item1:
    Folder1
    Folder2
    Item2:
  `),
  );
});

test('Place item after non-empty folder', async t => {
  sceneBuilder.build(`
    Item1:
    Item2:
    Folder1
      Item3:
      Item4:
    Folder2
  `);

  getNode('Item1').placeAfter(getNodeId('Folder1'));
  getNode('Item2').setParent(getNodeId('Folder1'));
  getNode('Item2').placeAfter(getNodeId('Folder1'));

  t.true(
    sceneBuilder.isEqualTo(`
    Folder1
      Item2:
      Item3:
      Item4:
    Item1:
    Folder2
  `),
  );
});

test('Move a folder with deep nesting', async t => {
  sceneBuilder.build(`
    Folder1
      Item1
      Folder3
        item4:
        Folder4
          item5:
    Folder2
  `);

  getNode('Folder1').setParent(getNodeId('Folder2'));

  t.true(
    sceneBuilder.isEqualTo(`
    Folder2
      Folder1
        Item1
        Folder3
          item4:
          Folder4
            item5:
  `),
  );
});

test('Remove non-empty folder', async t => {
  sceneBuilder.build(`
    Folder1
      Item1
      Folder3
        item4:
        Folder4
          item5:
    Folder2
  `);

  getNode('Folder1').remove();

  t.true(
    sceneBuilder.isEqualTo(`
    Folder2
  `),
  );
});

test('Try to insert a folder inside itself', async t => {
  sceneBuilder.build(`
    Folder1
      Folder2
  `);

  getNode('Folder1').setParent(getNodeId('Folder2'));

  t.true(
    sceneBuilder.isEqualTo(`
    Folder1
      Folder2
  `),
  );
});

test('Move multiple items', async t => {
  sceneBuilder.build(`
    Folder1
      Item1
    Folder2
      Item2
    Folder3
  `);

  const selection = scene.getSelection([getNodeId('Item1'), getNodeId('Item2')]);
  selection.placeAfter(getNodeId('Folder3'));

  t.true(
    sceneBuilder.isEqualTo(`
    Folder1
    Folder2
    Folder3
    Item1
    Item2
  `),
  );
});

test('Place before the first item of a folder', async t => {
  sceneBuilder.build(`
    Item1:
    Folder1
      Item2:
      Item3:
  `);

  getNode('Item1').placeBefore(getNodeId('Item2'));

  t.true(
    sceneBuilder.isEqualTo(`
    Folder1
      Item1:
      Item2:
      Item3:
  `),
  );
  // A folder is followed directly by everything in it
  t.deepEqual(
    scene.getNodes().map(node => node.id),
    ['Folder1', 'Item1', 'Item2', 'Item3'].map(getNodeId),
  );
});

test('Place before an item that follows a non-empty folder', async t => {
  sceneBuilder.build(`
    Item1:
    Folder1
      Folder2
        Item2:
      Item3:
  `);

  getNode('Item1').placeBefore(getNodeId('Item3'));

  t.true(
    sceneBuilder.isEqualTo(`
    Folder1
      Folder2
        Item2:
      Item1:
      Item3:
  `),
  );
  // A folder is followed directly by everything in it
  t.deepEqual(
    scene.getNodes().map(node => node.id),
    ['Folder1', 'Folder2', 'Item2', 'Item1', 'Item3'].map(getNodeId),
  );
});

test('Place before the node that follows the folder of the moved node', async t => {
  sceneBuilder.build(`
    Folder1
      Item1:
    Item2:
  `);

  getNode('Item1').placeBefore(getNodeId('Item2'));

  t.true(
    sceneBuilder.isEqualTo(`
    Folder1
    Item1:
    Item2:
  `),
  );
  // A folder is followed directly by everything in it
  t.deepEqual(
    scene.getNodes().map(node => node.id),
    ['Folder1', 'Item1', 'Item2'].map(getNodeId),
  );
});

test('Next item of the first node', async t => {
  sceneBuilder.build(`
    Item1:
    Item2:
  `);

  t.is(getNode('Item1').getNextItem().name, 'Item2');
});
