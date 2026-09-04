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

test('Collection load repairs persisted vertical z-order', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const dualOutputService = client.getResource<DualOutputService>('DualOutputService');
  const sceneCollectionsService = client.getResource<SceneCollectionsService>(
    'SceneCollectionsService',
  );
  const collectionId = sceneCollectionsService.activeCollection.id;
  const scene = scenesService.createScene('Load Repair Scene');
  const item1 = scene.createAndAddSource('Item1', 'color_source');
  scene.createAndAddSource('Item2', 'color_source');
  const folder = scene.createFolder('Folder');
  const nestedFolder = scene.createFolder('Nested Folder');
  nestedFolder.setParent(folder.id);
  const folderItem1 = scene.createAndAddSource('Folder Item1', 'color_source');
  folderItem1.setParent(nestedFolder.id);
  const folderItem2 = scene.createAndAddSource('Folder Item2', 'color_source');
  folderItem2.setParent(nestedFolder.id);
  const item3 = scene.createAndAddSource('Item3', 'color_source');

  dualOutputService.convertSingleOutputToDualOutputCollection();

  const nodeMap = sceneCollectionsService.sceneNodeMaps[scene.id];
  const expectedNodeMap = { ...nodeMap };
  const expectedOrder = [
    'Item3',
    'Folder',
    'Nested Folder',
    'Folder Item2',
    'Folder Item1',
    'Item2',
    'Item1',
  ];

  // Recreate the persisted shape produced by the old insertion code: the
  // horizontal item is top-most, while its vertical partner is at the bottom.
  scene.getNode(nodeMap[item3.id]).placeAfter(nodeMap[item1.id]);
  scene.getNode(nodeMap[folderItem2.id]).placeAfter(nodeMap[folderItem1.id]);
  confirmNodeOrder(t, scene, expectedOrder, [
    'Folder',
    'Nested Folder',
    'Folder Item1',
    'Folder Item2',
    'Item2',
    'Item1',
    'Item3',
  ]);

  // Switching away persists the bad order. Loading the collection exercises
  // the normal validateDualOutputCollection path rather than calling the
  // validator directly from the test.
  const otherCollection = await sceneCollectionsService.create({
    name: 'Load Repair Other Collection',
  });
  await sceneCollectionsService.load(collectionId);

  const restoredScene = (scenesService as any).getScene(scene.id) as Scene;
  confirmNodeOrder(t, restoredScene, expectedOrder, expectedOrder);

  const restoredNodeMap = sceneCollectionsService.sceneNodeMaps[scene.id];
  t.deepEqual(
    restoredNodeMap,
    expectedNodeMap,
    'Collection load repairs only order and preserves every existing node pair',
  );
  const restoredVerticalFolder = restoredScene.getFolder(restoredNodeMap[nestedFolder.id]);
  t.is(
    restoredVerticalFolder.parentId,
    restoredNodeMap[folder.id],
    'Collection load preserves the mirrored nested-folder relationship',
  );
  t.deepEqual(
    restoredVerticalFolder.getNodes().map(node => node.name),
    ['Folder Item2', 'Folder Item1'],
    'Collection load restores nested vertical sibling z-order from the horizontal folder',
  );

  // Switching away saves the repaired order. A second load verifies that the
  // repair is durable and idempotent through the normal persistence path.
  await sceneCollectionsService.load(otherCollection.id);
  await sceneCollectionsService.load(collectionId);
  const reloadedScene = (scenesService as any).getScene(scene.id) as Scene;
  confirmNodeOrder(t, reloadedScene, expectedOrder, expectedOrder);
});

test('Collection load does not normalize order with a malformed node map', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const dualOutputService = client.getResource<DualOutputService>('DualOutputService');
  const sceneCollectionsService = client.getResource<SceneCollectionsService>(
    'SceneCollectionsService',
  );
  const collectionId = sceneCollectionsService.activeCollection.id;
  const scene = scenesService.createScene('Malformed Map Scene');
  const item1 = scene.createAndAddSource('Item1', 'color_source');
  const item2 = scene.createAndAddSource('Item2', 'color_source');
  const folder = scene.createFolder('Folder');
  const folderItem = scene.createAndAddSource('Folder Item', 'color_source');
  folderItem.setParent(folder.id);

  dualOutputService.convertSingleOutputToDualOutputCollection();

  const nodeMap = sceneCollectionsService.sceneNodeMaps[scene.id];
  const verticalFolderId = nodeMap[folder.id];
  const verticalFolderItemId = nodeMap[folderItem.id];

  // Keep the map complete and bijective, but swap a folder and item partner.
  // Existing collection validation intentionally leaves these present nodes in
  // place; z-order normalization must decline to infer an order from this map.
  sceneCollectionsService.createNodeMapEntry(scene.id, folder.id, verticalFolderItemId);
  sceneCollectionsService.createNodeMapEntry(scene.id, folderItem.id, verticalFolderId);

  scene.getNode(nodeMap[item2.id]).placeAfter(nodeMap[item1.id]);
  const malformedOrder = scene.getNodes().map(node => node.id);

  await sceneCollectionsService.create({ name: 'Malformed Map Other Collection' });
  await sceneCollectionsService.load(collectionId);

  const restoredScene = (scenesService as any).getScene(scene.id) as Scene;
  t.deepEqual(
    restoredScene.getNodes().map(node => node.id),
    malformedOrder,
    'Load leaves z-order untouched when pair types make the node map unsafe to normalize',
  );
  t.is(
    sceneCollectionsService.sceneNodeMaps[scene.id][folder.id],
    verticalFolderItemId,
    'Existing validation semantics leave the malformed folder mapping intact',
  );
  t.is(
    sceneCollectionsService.sceneNodeMaps[scene.id][folderItem.id],
    verticalFolderId,
    'Existing validation semantics leave the malformed item mapping intact',
  );
});

test('Collection load does not normalize an unmirrored folder hierarchy', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const dualOutputService = client.getResource<DualOutputService>('DualOutputService');
  const sceneCollectionsService = client.getResource<SceneCollectionsService>(
    'SceneCollectionsService',
  );
  const collectionId = sceneCollectionsService.activeCollection.id;
  const scene = scenesService.createScene('Unmirrored Folder Scene');
  scene.createAndAddSource('Root Item', 'color_source');
  const folder = scene.createFolder('Folder');
  const folderItem = scene.createAndAddSource('Folder Item', 'color_source');
  folderItem.setParent(folder.id);

  dualOutputService.convertSingleOutputToDualOutputCollection();

  const nodeMap = sceneCollectionsService.sceneNodeMaps[scene.id];
  const verticalFolderItem = scene.getNode(nodeMap[folderItem.id]);
  verticalFolderItem.detachParent();

  const horizontalNodeIds = scene
    .getNodes()
    .filter(node => node.display === 'horizontal')
    .map(node => node.id);
  const verticalNodeIds = scene
    .getNodes()
    .filter(node => node.display === 'vertical')
    .map(node => node.id);
  scene.setNodesOrder(verticalNodeIds.concat(horizontalNodeIds));
  const unsafeOrder = scene.getNodes().map(node => node.id);

  await sceneCollectionsService.create({ name: 'Unmirrored Folder Other Collection' });
  await sceneCollectionsService.load(collectionId);

  const restoredScene = (scenesService as any).getScene(scene.id) as Scene;
  t.deepEqual(
    restoredScene.getNodes().map(node => node.id),
    unsafeOrder,
    'Load leaves z-order untouched when mapped folder relationships are not mirrored',
  );
  t.is(
    restoredScene.getNode(nodeMap[folderItem.id]).parentId,
    '',
    'Load does not infer or mutate a malformed vertical parent relationship',
  );
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

async function confirmSingleDisplayFolderGrouping(
  t: TExecutionContext,
  selectedDisplay: 'horizontal' | 'vertical',
) {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const dualOutputService = client.getResource<DualOutputService>('DualOutputService');
  const sceneCollectionsService = client.getResource<SceneCollectionsService>(
    'SceneCollectionsService',
  );
  const editorCommandsService = client.getResource<EditorCommandsService>('EditorCommandsService');
  const collectionId = sceneCollectionsService.activeCollection.id;
  const scene = scenesService.createScene(`${selectedDisplay} Folder Scene`);
  const item1 = scene.createAndAddSource('Item1', 'color_source');
  const item2 = scene.createAndAddSource('Item2', 'color_source');
  const item3 = scene.createAndAddSource('Item3', 'color_source');
  dualOutputService.convertSingleOutputToDualOutputCollection();
  dualOutputService.toggleDualOutputMode(true);
  dualOutputService.toggleDisplay(selectedDisplay === 'horizontal', 'horizontal');
  dualOutputService.toggleDisplay(selectedDisplay === 'vertical', 'vertical');

  const selectedNodeIds = scene
    .getSourceSelectorNodes()
    .filter(node => node.name === 'Item3' || node.name === 'Item2')
    .map(node => node.id);
  t.is(selectedNodeIds.length, 2, `Selection contains only ${selectedDisplay} nodes`);
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
    ['horizontal:Item3', 'horizontal:Item2'],
  );
  t.deepEqual(
    verticalFolder.getNodes().map(node => `${node.display}:${node.name}`),
    ['vertical:Item3', 'vertical:Item2'],
  );
  [item3, item2].forEach(item => {
    t.is(scene.getNode(item.id).parentId, horizontalFolder.id);
    t.is(
      scene.getNode(sceneCollectionsService.sceneNodeMaps[scene.id][item.id]).parentId,
      verticalFolder.id,
    );
  });
  t.is(scene.getNode(item1.id).parentId, '');
  t.is(scene.getNode(sceneCollectionsService.sceneNodeMaps[scene.id][item1.id]).parentId, '');
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
    ['horizontal:Item3', 'horizontal:Item2'],
  );
  t.deepEqual(
    restoredVerticalFolder.getNodes().map(node => `${node.display}:${node.name}`),
    ['vertical:Item3', 'vertical:Item2'],
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

  // A valid mirrored hierarchy allows collection-load validation to repair
  // persisted vertical sibling order.
  const restoredNodeMap = sceneCollectionsService.sceneNodeMaps[scene.id];
  scene.getNode(restoredNodeMap[item3.id]).placeAfter(restoredNodeMap[item2.id]);
  t.deepEqual(
    restoredVerticalFolder.getNodes().map(node => node.name),
    ['Item2', 'Item3'],
    'Vertical sibling order is deliberately corrupted before reload',
  );

  dualOutputService.toggleDualOutputMode(false);
  await sceneCollectionsService.create({ name: `${selectedDisplay} Folder Other Collection` });
  await sceneCollectionsService.load(collectionId);

  const reloadedScene = (scenesService as any).getScene(scene.id) as Scene;
  const reloadedNodeMap = sceneCollectionsService.sceneNodeMaps[scene.id];
  const reloadedHorizontalFolder = reloadedScene.getFolder(horizontalFolder.id);
  const reloadedVerticalFolder = reloadedScene.getFolder(verticalFolder.id);
  t.deepEqual(
    reloadedHorizontalFolder.getNodes().map(node => `${node.display}:${node.name}`),
    ['horizontal:Item3', 'horizontal:Item2'],
  );
  t.deepEqual(
    reloadedVerticalFolder.getNodes().map(node => `${node.display}:${node.name}`),
    ['vertical:Item3', 'vertical:Item2'],
    'Collection load accepts the mirrored hierarchy and repairs vertical sibling order',
  );
  [item3, item2].forEach(item => {
    t.is(reloadedScene.getNode(item.id).parentId, reloadedHorizontalFolder.id);
    t.is(reloadedScene.getNode(reloadedNodeMap[item.id]).parentId, reloadedVerticalFolder.id);
  });
}

test('Horizontal-only folder grouping remains mirrored, atomic, and ordered', async t => {
  await confirmSingleDisplayFolderGrouping(t, 'horizontal');
});

test('Vertical-only folder grouping remains mirrored, atomic, and ordered', async t => {
  await confirmSingleDisplayFolderGrouping(t, 'vertical');
});
