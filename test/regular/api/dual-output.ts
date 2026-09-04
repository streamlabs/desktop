import { DualOutputService } from 'services/dual-output';
import { getApiClient } from '../../helpers/api-client';
import { test, useWebdriver, TExecutionContext } from '../../helpers/webdriver';
import { ScenesService, Scene, SceneItem } from 'services/scenes';
import { VideoSettingsService } from 'services/settings-v2/video';
import { EditorCommandsService } from 'services/editor-commands';
import { SceneCollectionsService } from 'services/scene-collections';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

function confirmNodeOrder(
  t: TExecutionContext,
  scene: Scene,
  horizontalNames: string[],
  verticalNames: string[],
) {
  const nodes = scene.getNodes();

  t.deepEqual(
    nodes.map(node => `${node.display}:${node.name}`),
    horizontalNames
      .map(name => `horizontal:${name}`)
      .concat(verticalNames.map(name => `vertical:${name}`)),
    'Scene nodes are grouped by display and preserve each display z-order',
  );
}

function confirmHistoryDepth(
  t: TExecutionContext,
  editorCommandsService: EditorCommandsService,
  undoDepth: number,
  redoDepth: number,
) {
  t.is(editorCommandsService.state.undoMetadata.length, undoDepth, 'Undo history depth is correct');
  t.is(editorCommandsService.state.redoMetadata.length, redoDepth, 'Redo history depth is correct');
}

function confirmDualOutputSources(t: TExecutionContext, scene: Scene) {
  const numSceneItems = scene
    .getItems()
    .map(item => item.getModel())
    .reduce((sources, item) => {
      // only track number of sources that should be
      if (sources[item.sourceId]) {
        sources[item.sourceId] += 1;
      } else {
        sources[item.sourceId] = 1;
      }
      return sources;
    }, {} as { [sourceId: string]: number });

  // dual output scene collections should have and even number of scene items
  // because a dual output scene item scene item is a pair of horizontal and vertical
  // nodes that share a single source.
  for (const [sourceId, count] of Object.entries(numSceneItems)) {
    t.is(count % 2, 0, `Scene does not have dual output source ${sourceId}`);
  }
}

function confirmVerticalSceneItem(
  t: TExecutionContext,
  scene: Scene,
  horizontalSceneItem: SceneItem,
  verticalSceneItemId: string,
) {
  const verticalSceneItem = scene.getItem(verticalSceneItemId);
  t.is(
    verticalSceneItem?.display,
    'vertical',
    `Vertical scene item ${verticalSceneItem.id} display is correct`,
  );

  t.is(
    verticalSceneItem?.sourceId,
    horizontalSceneItem.sourceId,
    `Vertical scene item ${verticalSceneItem.id} and horizontal scene item ${horizontalSceneItem.id} share the same source`,
  );
}

test('Convert single output collection to dual output', async (t: TExecutionContext) => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const videoSettingsService = client.getResource<VideoSettingsService>('VideoSettingsService');
  const dualOutputService = client.getResource<DualOutputService>('DualOutputService');
  const scene = scenesService.createScene('Scene1');
  scene.createAndAddSource('Item1', 'color_source');
  scene.createAndAddSource('Item2', 'color_source');
  scene.createAndAddSource('Item3', 'color_source');
  const folder = scene.createFolder('Folder');
  const folderItem1 = scene.createAndAddSource('Folder Item1', 'color_source');
  folderItem1.setParent(folder.id);
  const folderItem2 = scene.createAndAddSource('Folder Item2', 'color_source');
  folderItem2.setParent(folder.id);
  const singleOutputOrder = scene.getNodes().map(node => node.name);

  // single output
  const horizontalContext = videoSettingsService.contexts.horizontal;
  scene.getItems().forEach(sceneItem => {
    t.is(sceneItem?.display, 'horizontal');
    t.deepEqual(sceneItem?.output, horizontalContext);
  });
  const singleOutputLength = scene.getItems().length;

  dualOutputService.collectionHandled.subscribe(() => void 0);

  // dual output
  dualOutputService.convertSingleOutputToDualOutputCollection();

  const sceneNodeMaps = (await client.fetchNextEvent()).data;
  t.not(sceneNodeMaps, null, 'Dual output scene collection has node maps.');

  const nodeMap = sceneNodeMaps[scene.id];
  const verticalContext = videoSettingsService.contexts.vertical;
  const sceneItems = scene.getItems();

  // confirm dual output collection length is double the single output collection length
  const dualOutputLength = sceneItems.length;
  t.is(singleOutputLength * 2, dualOutputLength);

  confirmNodeOrder(t, scene, singleOutputOrder, singleOutputOrder);
  t.deepEqual(
    scene
      .getFolder(nodeMap[folder.id])
      .getNodes()
      .map(node => node.name),
    folder.getNodes().map(node => node.name),
    'Nested sibling z-order is preserved in the vertical folder',
  );

  // confirm that converting the single output collection to a dual output collection did not add sources
  confirmDualOutputSources(t, scene);

  // confirm scene items are in node map, have the correct source, and the correct video context
  sceneItems.forEach(sceneItem => {
    if (sceneItem?.display === 'horizontal') {
      const verticalNodeId = nodeMap[sceneItem.id];
      t.truthy(verticalNodeId, `Vertical node id exists for horizontal scene item ${sceneItem.id}`);

      // confirm properties for vertical scene item
      confirmVerticalSceneItem(t, scene, sceneItem, verticalNodeId);

      // confirm video context for horizontal scene item
      t.deepEqual(
        sceneItem?.output,
        horizontalContext,
        `Horizontal scene item ${sceneItem.id} has correct video context`,
      );
    } else {
      const horizontalNodeId = Object.keys(nodeMap).find(
        nodeId => nodeMap[nodeId] === sceneItem.id,
      );
      t.truthy(
        horizontalNodeId,
        `Horizontal node id exists for vertical scene item ${sceneItem.id}`,
      );

      // confirm video context for vertical scene item
      t.deepEqual(
        sceneItem?.output,
        verticalContext,
        `Vertical scene item ${sceneItem.id} has correct video context`,
      );
    }
  });
});

test('New source is top-most in both displays for an inactive scene', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const dualOutputService = client.getResource<DualOutputService>('DualOutputService');
  const sceneCollectionsService = client.getResource<SceneCollectionsService>(
    'SceneCollectionsService',
  );
  const editorCommandsService = client.getResource<EditorCommandsService>('EditorCommandsService');

  const targetScene = scenesService.createScene('Target Scene');
  targetScene.createAndAddSource('Item1', 'color_source');
  targetScene.createAndAddSource('Item2', 'color_source');
  targetScene.createAndAddSource('Item3', 'color_source');

  // Use a different active scene with a different node count. The old implementation
  // incorrectly used the active scene to place a partner created in the target scene.
  const activeScene = scenesService.createScene('Active Scene');
  activeScene.createAndAddSource('Other Item', 'color_source');
  activeScene.createAndAddSource('Other Item 2', 'color_source');
  activeScene.makeActive();

  // A collection retains its node maps while Dual Output is disabled. Creating a
  // source in that state still creates both nodes before the vertical canvas is shown.
  dualOutputService.convertSingleOutputToDualOutputCollection();

  editorCommandsService.executeCommand(
    'CreateNewItemCommand',
    targetScene.id,
    'Newest Item',
    'color_source',
    {},
    { sourceAddOptions: {} },
  );
  confirmHistoryDepth(t, editorCommandsService, 1, 0);

  const expectedOrder = ['Newest Item', 'Item3', 'Item2', 'Item1'];
  confirmNodeOrder(t, targetScene, expectedOrder, expectedOrder);

  // Enabling Dual Output must not change which item is top-most.
  dualOutputService.toggleDualOutputMode(true);
  confirmNodeOrder(t, targetScene, expectedOrder, expectedOrder);

  const createdNodeIds = targetScene
    .getNodes()
    .filter(node => node.name === 'Newest Item')
    .map(node => node.id);
  t.is(createdNodeIds.length, 2);
  t.is(
    sceneCollectionsService.sceneNodeMaps[targetScene.id][createdNodeIds[0]],
    createdNodeIds[1],
    'The new horizontal and vertical items are paired in the node map',
  );

  // One undo/redo must remove and restore the complete horizontal/vertical pair.
  editorCommandsService.undo();
  confirmHistoryDepth(t, editorCommandsService, 0, 1);
  confirmNodeOrder(t, targetScene, ['Item3', 'Item2', 'Item1'], ['Item3', 'Item2', 'Item1']);
  t.false(
    Object.prototype.hasOwnProperty.call(
      sceneCollectionsService.sceneNodeMaps[targetScene.id],
      createdNodeIds[0],
    ),
    'Undo removes the item pair from the node map',
  );

  editorCommandsService.redo();
  confirmHistoryDepth(t, editorCommandsService, 1, 0);
  confirmNodeOrder(t, targetScene, expectedOrder, expectedOrder);
  t.deepEqual(
    targetScene
      .getNodes()
      .filter(node => node.name === 'Newest Item')
      .map(node => node.id),
    createdNodeIds,
    'Redo reuses both scene node ids',
  );
  t.is(
    sceneCollectionsService.sceneNodeMaps[targetScene.id][createdNodeIds[0]],
    createdNodeIds[1],
    'Redo restores the item pair in the node map',
  );
});

test('Paired folder grouping remains atomic and ordered', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const dualOutputService = client.getResource<DualOutputService>('DualOutputService');
  const sceneCollectionsService = client.getResource<SceneCollectionsService>(
    'SceneCollectionsService',
  );
  const editorCommandsService = client.getResource<EditorCommandsService>('EditorCommandsService');
  const scene = scenesService.createScene('Folder Scene');
  scene.createAndAddSource('Item1', 'color_source');
  scene.createAndAddSource('Item2', 'color_source');
  scene.createAndAddSource('Item3', 'color_source');
  dualOutputService.convertSingleOutputToDualOutputCollection();

  const selectedNodeIds = scene
    .getNodes()
    .filter(node => node.name === 'Item3')
    .map(node => node.id);
  const selection = scene.getSelection(selectedNodeIds);
  const serializedSelection = {
    _type: 'HELPER',
    resourceId: (selection as any).resourceId,
  } as any;

  editorCommandsService.executeCommand(
    'CreateFolderCommand',
    scene.id,
    'Newest Folder',
    serializedSelection,
  );
  confirmHistoryDepth(t, editorCommandsService, 1, 0);

  const folders = scene.getFolders().filter(folder => folder.name === 'Newest Folder');
  t.is(folders.length, 2);
  const horizontalFolder = folders.find(folder => folder.display === 'horizontal');
  const verticalFolder = folders.find(folder => folder.display === 'vertical');
  t.truthy(horizontalFolder);
  t.truthy(verticalFolder);
  t.is(
    sceneCollectionsService.sceneNodeMaps[scene.id][horizontalFolder.id],
    verticalFolder.id,
    'Horizontal and vertical folders are paired in the node map',
  );
  t.deepEqual(
    horizontalFolder.getNodes().map(node => `${node.display}:${node.name}`),
    ['horizontal:Item3'],
  );
  t.deepEqual(
    verticalFolder.getNodes().map(node => `${node.display}:${node.name}`),
    ['vertical:Item3'],
  );
  confirmNodeOrder(
    t,
    scene,
    ['Newest Folder', 'Item3', 'Item2', 'Item1'],
    ['Newest Folder', 'Item3', 'Item2', 'Item1'],
  );

  const folderIds = [horizontalFolder.id, verticalFolder.id];

  // This deliberately uses one undo and one redo: the paired folder and both
  // display-specific grouping operations belong to one editor command.
  editorCommandsService.undo();
  confirmHistoryDepth(t, editorCommandsService, 0, 1);
  t.is(scene.getFolders().filter(folder => folder.name === 'Newest Folder').length, 0);
  confirmNodeOrder(t, scene, ['Item3', 'Item2', 'Item1'], ['Item3', 'Item2', 'Item1']);
  t.false(
    Object.prototype.hasOwnProperty.call(
      sceneCollectionsService.sceneNodeMaps[scene.id],
      horizontalFolder.id,
    ),
    'Undo removes the folder pair from the node map',
  );

  editorCommandsService.redo();
  confirmHistoryDepth(t, editorCommandsService, 1, 0);
  t.deepEqual(
    scene
      .getFolders()
      .filter(folder => folder.name === 'Newest Folder')
      .map(folder => folder.id),
    folderIds,
    'Redo reuses both folder ids',
  );
  const restoredHorizontalFolder = scene.getFolder(horizontalFolder.id);
  const restoredVerticalFolder = scene.getFolder(verticalFolder.id);
  t.deepEqual(
    restoredHorizontalFolder.getNodes().map(node => `${node.display}:${node.name}`),
    ['horizontal:Item3'],
  );
  t.deepEqual(
    restoredVerticalFolder.getNodes().map(node => `${node.display}:${node.name}`),
    ['vertical:Item3'],
  );
  t.is(
    sceneCollectionsService.sceneNodeMaps[scene.id][horizontalFolder.id],
    verticalFolder.id,
    'Redo restores the folder pair in the node map',
  );
  confirmNodeOrder(
    t,
    scene,
    ['Newest Folder', 'Item3', 'Item2', 'Item1'],
    ['Newest Folder', 'Item3', 'Item2', 'Item1'],
  );
});
