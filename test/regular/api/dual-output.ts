import { DualOutputService } from 'services/dual-output';
import { getApiClient } from '../../helpers/api-client';
import { test, useWebdriver, TExecutionContext } from '../../helpers/webdriver';
import { ScenesService, Scene, SceneItem } from 'services/scenes';
import { VideoSettingsService } from 'services/settings-v2/video';
import { SceneCollectionsService } from 'services/scene-collections';
import type { OverlaysPersistenceService } from 'services/scene-collections/overlays';
import { SelectionService } from 'services/api/external-api/selection';
import { click, focusMain, focusWindow, waitForDisplayed } from '../../helpers/modules/core';
import { EditorCommandsService } from 'services/editor-commands';
import fs = require('fs');
import path = require('path');
import archiver = require('archiver');

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

testSelectionAfterDisablingDualOutput(false);
testSelectionAfterDisablingDualOutput(true);

async function setDualOutputMode(status: boolean) {
  const client = await getApiClient();
  // The RPC fallback exposes this private method; its loading-mode decorator returns a promise.
  const dualOutput = client.getResource<{
    setDualOutputMode(status: boolean, skipShowVideoSettings: boolean): Promise<void>;
  }>('DualOutputService');

  // Exercise the normal mode transition without requiring a provider login.
  await dualOutput.setDualOutputMode(status, true);
  await focusMain();
}

function testSelectionAfterDisablingDualOutput(horizontalVisible: boolean) {
  test(`Selection after disabling dual output with horizontal ${
    horizontalVisible ? 'visible' : 'hidden'
  }`, async t => {
    const client = await getApiClient();
    const scenesService = client.getResource<ScenesService>('ScenesService');
    const dualOutputService = client.getResource<DualOutputService>('DualOutputService');
    const selection = client.getResource<SelectionService>('SelectionService');
    const scene = scenesService.createScene('Selection transition');
    scenesService.makeSceneActive(scene.id);
    const horizontalItem = scene.createAndAddSource('Selection target', 'color_source');
    horizontalItem.fitToScreen();

    await setDualOutputMode(true);
    dualOutputService.toggleDisplay(horizontalVisible, 'horizontal');
    const verticalItem = scene.getItems().find(item => item.display === 'vertical');
    t.truthy(verticalItem, 'Dual output created a vertical partner');
    t.deepEqual(
      scene.getSourceSelectorNodes().map(node => node.id),
      [horizontalVisible ? horizontalItem.id : verticalItem.id],
      'Dual output source rows follow the visible displays',
    );

    await setDualOutputMode(false);
    await waitForDisplayed('#horizontal-display');
    t.deepEqual(
      scene.getSourceSelectorNodes().map(node => node.id),
      [horizontalItem.id],
      'Single output source rows always use horizontal items',
    );

    await click('[data-name="Selection target"]');
    t.deepEqual(selection.getIds(), [horizontalItem.id], 'List selects only the visible item');

    selection.reset();
    await t.context.app.client.waitUntil(async () => {
      const selectedRows = await t.context.app.client.$$(
        '.ant-tree-node-selected [data-name="Selection target"]',
      );
      return selectedRows.length === 0;
    });
    await click('#horizontal-display');
    await waitForDisplayed('.ant-tree-node-selected [data-name="Selection target"]');
    t.deepEqual(selection.getIds(), [horizontalItem.id], 'Canvas selection highlights the list');

    await setDualOutputMode(true);
    t.is(
      dualOutputService.state.videoSettings.activeDisplays.horizontal,
      horizontalVisible,
      'The saved horizontal display preference is preserved',
    );
    t.deepEqual(
      scene.getSourceSelectorNodes().map(node => node.id),
      [horizontalVisible ? horizontalItem.id : verticalItem.id],
      'Re-enabling dual output restores the corresponding source rows',
    );
  });
}

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

interface IFolderSceneSnapshot {
  nodes: { id: string; parentId: string; display: string; type: string }[];
  items: {
    id: string;
    sourceId: string;
    settings: Omit<ReturnType<SceneItem['getSettings']>, 'output'>;
    nativeVisible: boolean;
  }[];
  nodeMap: Dictionary<string>;
  nativeOrder: number[];
  itemOrder: number[];
}

// Native objects and repair methods belong to the worker. Keep callbacks synchronous
// and return only plain snapshots so WebDriver never serializes native handles.
async function snapshotFolderScene(
  t: TExecutionContext,
  sceneId: string,
): Promise<IFolderSceneSnapshot> {
  t.true(await focusWindow('worker'), 'worker window is available');
  try {
    return await t.context.app.client.execute(id => {
      const manager = (window as any).servicesManager;
      const scenes = manager.getResource('ScenesService') as ScenesService;
      const collections = manager.getResource('SceneCollectionsService') as SceneCollectionsService;
      const scene = scenes.views.getScene(id);
      return {
        nodes: scene.getNodes().map(node => ({
          id: node.id,
          parentId: node.parentId,
          display: node.display,
          type: node.sceneNodeType,
        })),
        items: scene.getItems().map(item => {
          const settings = Object.assign({}, item.getSettings());
          delete settings.output;
          return {
            id: item.id,
            sourceId: item.sourceId,
            settings,
            nativeVisible: item.getObsSceneItem().visible,
          };
        }),
        nodeMap: Object.assign({}, collections.sceneNodeMaps[id]),
        nativeOrder: scene
          .getObsScene()
          .getItems()
          .map(item => item.id)
          .reverse(),
        itemOrder: scene.getItems().map(item => item.obsSceneItemId),
      };
    }, sceneId);
  } finally {
    await focusMain();
  }
}

async function createFolderRepairScene(
  t: TExecutionContext,
  corrupted: boolean,
  horizontalFirst = false,
) {
  t.true(await focusWindow('worker'), 'worker window is available');
  try {
    return await t.context.app.client.execute(
      (isCorrupted, isHorizontalFirst) => {
        const manager = (window as any).servicesManager;
        const scenes = manager.getResource('ScenesService') as ScenesService;
        const collections = manager.getResource(
          'SceneCollectionsService',
        ) as SceneCollectionsService;
        const video = manager.getResource('VideoSettingsService') as VideoSettingsService;
        video.validateVideoContext();
        const scene = scenes.createScene('Paired folder repair');

        for (const display of ['horizontal', 'vertical'] as const) {
          const prefix = display === 'horizontal' ? 'h' : 'v';
          const folder = scene.createFolder('Social Media', { id: `${prefix}-root`, display });
          const nested = scene.createFolder('Icons', { id: `${prefix}-nested`, display });
          nested.setParent(folder.id);
        }

        for (const [index, name] of ['a', 'b', 'c'].entries()) {
          const horizontal = scene.createAndAddSource(
            `Horizontal ${name}`,
            'color_source',
            { width: 160, height: 100 },
            { id: `h-${name}`, display: 'horizontal', select: false },
          );
          const verticalOptions = { id: `v-${name}`, display: 'vertical' as const, select: false };
          // Overlay slots initially create separate sources. Previously saved broken
          // collections already share a source, so they bypass source replacement.
          const vertical = isCorrupted
            ? scene.addSource(horizontal.sourceId, verticalOptions)
            : scene.createAndAddSource(
                `Vertical ${name}`,
                'color_source',
                { width: 160, height: 100 },
                verticalOptions,
              );
          horizontal.setParent(index === 0 ? 'h-root' : 'h-nested');
          vertical.setParent(`${isCorrupted ? 'h' : 'v'}-${index === 0 ? 'root' : 'nested'}`);
          horizontal.setTransform({ position: { x: 500 + index * 180, y: 400 } });
          vertical.setSettings({
            transform: {
              position: { x: 30 + index * 150, y: 70 + index * 230 },
              scale: { x: 0.75 + index * 0.25, y: 1.25 },
              rotation: index * 15,
              crop: { top: index, bottom: 2, left: 3, right: index + 4 },
            },
            visible: index === 1,
            locked: index === 0,
          });
        }

        const horizontalOrder = ['h-root', 'h-a', 'h-nested', 'h-b', 'h-c'];
        const verticalOrder = ['v-root', 'v-a', 'v-nested', 'v-b', 'v-c'];
        const validOrder = isHorizontalFirst
          ? horizontalOrder.concat(verticalOrder)
          : verticalOrder.concat(horizontalOrder);
        scene.setNodesOrder(
          isCorrupted
            ? ['h-root', 'h-a', 'v-a', 'h-nested', 'h-b', 'v-b', 'h-c', 'v-c', 'v-root', 'v-nested']
            : validOrder,
        );
        horizontalOrder.forEach(id =>
          collections.createNodeMapEntry(scene.id, id, id.replace('h-', 'v-')),
        );
        return scene.id;
      },
      corrupted,
      horizontalFirst,
    );
  } finally {
    await focusMain();
  }
}

async function validateFolderScene(t: TExecutionContext, sceneId: string) {
  t.true(await focusWindow('worker'), 'worker window is available');
  try {
    await t.context.app.client.execute(id => {
      const service = (window as any).servicesManager.getResource(
        'DualOutputService',
      ) as DualOutputService;
      service.validateSceneNodes(id);
    }, sceneId);
  } finally {
    await focusMain();
  }
}

function confirmRepairedFolders(t: TExecutionContext, snapshot: IFolderSceneSnapshot) {
  t.deepEqual(
    snapshot.nodes.map(node => node.display),
    Array(5).fill('horizontal').concat(Array(5).fill('vertical')),
    'repaired folders use the canonical horizontal-before-vertical order',
  );
  for (const [prefix, display] of [
    ['h', 'horizontal'],
    ['v', 'vertical'],
  ]) {
    t.deepEqual(
      snapshot.nodes.filter(node => node.display === display),
      [
        { id: `${prefix}-root`, parentId: '', display, type: 'folder' },
        { id: `${prefix}-a`, parentId: `${prefix}-root`, display, type: 'item' },
        { id: `${prefix}-nested`, parentId: `${prefix}-root`, display, type: 'folder' },
        { id: `${prefix}-b`, parentId: `${prefix}-nested`, display, type: 'item' },
        { id: `${prefix}-c`, parentId: `${prefix}-nested`, display, type: 'item' },
      ],
      `${display} hierarchy and sibling order are intact`,
    );
  }
  for (const name of ['a', 'b', 'c']) {
    t.is(
      snapshot.items.find(item => item.id === `v-${name}`).sourceId,
      snapshot.items.find(item => item.id === `h-${name}`).sourceId,
      `${name} partners share their source`,
    );
  }
  t.deepEqual(
    snapshot.nativeOrder,
    snapshot.itemOrder,
    'native stacking matches Desktop item order',
  );
}

function confirmPreservedItemSettings(
  t: TExecutionContext,
  before: IFolderSceneSnapshot,
  after: IFolderSceneSnapshot,
) {
  t.deepEqual(after.nodeMap, before.nodeMap, 'repair preserves all paired node IDs');
  for (const original of before.items) {
    const item = after.items.find(candidate => candidate.id === original.id);
    const { transform: actualTransform, ...actualFlags } = item.settings;
    const { transform: expectedTransform, ...expectedFlags } = original.settings;
    t.deepEqual(actualFlags, expectedFlags, `${original.id} keeps authored flags`);
    const { position: actualPosition, scale: actualScale, ...actualRest } = actualTransform;
    const { position: expectedPosition, scale: expectedScale, ...expectedRest } = expectedTransform;
    t.deepEqual(actualRest, expectedRest, `${original.id} keeps rotation and crop`);
    // Public transforms are absolute pixels; native normalized coordinates can
    // accumulate float rounding on collection reload.
    for (const axis of ['x', 'y'] as const) {
      t.true(
        Math.abs(actualPosition[axis] - expectedPosition[axis]) < 0.001,
        `${original.id} keeps its ${axis} position`,
      );
      t.true(
        Math.abs(actualScale[axis] - expectedScale[axis]) < 0.0001,
        `${original.id} keeps its ${axis} scale`,
      );
    }
    t.is(item.nativeVisible, original.nativeVisible, `${original.id} keeps native visibility`);
    if (original.id.startsWith('h-')) {
      t.is(item.sourceId, original.sourceId, 'horizontal source is retained');
    }
  }
}

for (const horizontalFirst of [true, false]) {
  test(`Source reconciliation preserves paired nested folders and authored vertical settings (${
    horizontalFirst ? 'horizontal' : 'vertical'
  } first)`, async t => {
    const sceneId = await createFolderRepairScene(t, false, horizontalFirst);
    const before = await snapshotFolderScene(t, sceneId);
    for (const name of ['a', 'b', 'c']) {
      t.not(
        before.items.find(item => item.id === `h-${name}`).sourceId,
        before.items.find(item => item.id === `v-${name}`).sourceId,
        'fixture has the separate sources created by overlay import',
      );
    }

    await validateFolderScene(t, sceneId);
    const after = await snapshotFolderScene(t, sceneId);
    t.deepEqual(
      after.nodes,
      before.nodes
        .filter(node => node.display === 'horizontal')
        .concat(before.nodes.filter(node => node.display === 'vertical')),
      'valid folder hierarchy and per-display order are preserved in canonical display order',
    );
    confirmRepairedFolders(t, after);
    confirmPreservedItemSettings(t, before, after);

    await validateFolderScene(t, sceneId);
    t.deepEqual(await snapshotFolderScene(t, sceneId), after, 'validation is idempotent');
  });
}

test('Ambiguous paired folders reject repair without changing nodes or leaving loading active', async t => {
  const sceneId = await createFolderRepairScene(t, true);
  t.true(await focusWindow('worker'), 'worker window is available');
  try {
    await t.context.app.client.execute(id => {
      const manager = (window as any).servicesManager;
      const scenes = manager.getResource('ScenesService') as ScenesService;
      const collections = manager.getResource('SceneCollectionsService') as SceneCollectionsService;
      const scene = scenes.views.getScene(id);
      scene.createFolder('Ambiguous horizontal folder', {
        id: 'h-ambiguous',
        display: 'horizontal',
      });
      collections.createNodeMapEntry(id, 'h-ambiguous', 'v-root');
    }, sceneId);
  } finally {
    await focusMain();
  }
  const before = await snapshotFolderScene(t, sceneId);

  t.true(await focusWindow('worker'), 'worker window is available');
  try {
    const result = await t.context.app.client.execute(id => {
      const service = (window as any).servicesManager.getResource(
        'DualOutputService',
      ) as DualOutputService;
      let message = '';
      try {
        service.validateSceneNodes(id);
      } catch (error: unknown) {
        message = (error as Error).message;
      }
      return { message, isLoading: service.state.isLoading };
    }, sceneId);
    t.regex(result.message, /invalid paired folder/, 'repair reports the ambiguous folder pair');
    t.false(result.isLoading, 'failed repair releases the collection loading state');
  } finally {
    await focusMain();
  }
  t.deepEqual(await snapshotFolderScene(t, sceneId), before, 'rejected repair preserves the scene');
});

test('Saved misplaced vertical children are repaired and folder visibility survives reload', async t => {
  const sceneId = await createFolderRepairScene(t, true);
  const before = await snapshotFolderScene(t, sceneId);
  t.false(
    before.nodes.some(node => node.parentId === 'v-nested'),
    'fixture has an empty vertical folder',
  );

  const client = await getApiClient();
  const collections = client.getResource<SceneCollectionsService>('SceneCollectionsService');
  await collections.save();
  await collections.load(collections.activeCollection.id);
  const repaired = await snapshotFolderScene(t, sceneId);
  confirmRepairedFolders(t, repaired);
  confirmPreservedItemSettings(t, before, repaired);

  await collections.save();
  await collections.load(collections.activeCollection.id);
  const reloaded = await snapshotFolderScene(t, sceneId);
  t.deepEqual(reloaded.nodes, repaired.nodes, 'repaired folder membership persists on reload');
  confirmRepairedFolders(t, reloaded);
  confirmPreservedItemSettings(t, repaired, reloaded);

  t.true(await focusWindow('worker'), 'worker window is available');
  try {
    await t.context.app.client.execute(id => {
      const scenes = (window as any).servicesManager.getResource('ScenesService') as ScenesService;
      const scene = scenes.views.getScene(id);
      scene.getFolder('v-nested').getSelection().setVisibility(false);
    }, sceneId);
  } finally {
    await focusMain();
  }
  const hidden = await snapshotFolderScene(t, sceneId);
  t.deepEqual(
    hidden.items.filter(item => item.id.startsWith('h-')),
    reloaded.items.filter(item => item.id.startsWith('h-')),
    'vertical folder toggle leaves horizontal items unchanged',
  );
  for (const id of ['v-b', 'v-c']) {
    const item = hidden.items.find(candidate => candidate.id === id);
    t.false(item.settings.visible, `${id} is hidden by the vertical folder toggle`);
    t.false(item.nativeVisible, `${id} is hidden in OBS`);
  }

  t.true(await focusWindow('worker'), 'worker window is available');
  try {
    await t.context.app.client.execute(id => {
      const scenes = (window as any).servicesManager.getResource('ScenesService') as ScenesService;
      scenes.views.getScene(id).getFolder('v-root').getSelection().setVisibility(true);
    }, sceneId);
  } finally {
    await focusMain();
  }
  const shown = await snapshotFolderScene(t, sceneId);
  for (const item of shown.items.filter(item => item.id.startsWith('v-'))) {
    t.true(item.settings.visible, 'parent folder shows all nested vertical items');
    t.true(item.nativeVisible, 'parent folder updates native visibility');
  }
  t.true(
    shown.items.find(item => item.id === 'v-a').settings.locked,
    'visibility preserves the lock',
  );
});

test('Importing a local dual output overlay preserves its paired nested folders', async t => {
  const client = await getApiClient();
  const video = client.getResource<VideoSettingsService>('VideoSettingsService');
  const sceneId = 'paired-folder-overlay-scene';
  const nodeMap: Dictionary<string> = {};
  const slots: any[] = [];
  for (const display of ['horizontal', 'vertical'] as const) {
    const prefix = display === 'horizontal' ? 'h' : 'v';
    slots.push(
      {
        id: `${prefix}-root`,
        name: 'Social Media',
        sceneNodeType: 'folder',
        display,
        childrenIds: [`${prefix}-a`, `${prefix}-nested`],
      },
      {
        id: `${prefix}-a`,
        name: `Icon A ${display}`,
        sceneNodeType: 'item',
        display,
        x: 0.125,
        y: 0.25,
        scaleX: 1 / video.baseWidth,
        scaleY: 1 / video.baseHeight,
        visible: display === 'horizontal',
        locked: true,
        content: { nodeType: 'ImageNode', schemaVersion: 1, filename: 'sun.png' },
      },
      {
        id: `${prefix}-nested`,
        name: 'Icons',
        sceneNodeType: 'folder',
        display,
        childrenIds: [`${prefix}-b`, `${prefix}-c`],
      },
    );
    for (const name of ['b', 'c']) {
      slots.push({
        id: `${prefix}-${name}`,
        name: `Icon ${name} ${display}`,
        sceneNodeType: 'item',
        display,
        x: name === 'b' ? 0.25 : 0.375,
        y: 0.5,
        scaleX: 0.75 / video.baseWidth,
        scaleY: 0.75 / video.baseHeight,
        visible: display === 'horizontal',
        locked: false,
        content: { nodeType: 'ImageNode', schemaVersion: 1, filename: 'sun.png' },
      });
    }
  }
  for (const name of ['root', 'a', 'nested', 'b', 'c']) nodeMap[`h-${name}`] = `v-${name}`;
  const config = {
    nodeType: 'RootNode',
    schemaVersion: 2,
    nodeMap: { nodeType: 'NodeMapNode', schemaVersion: 1, sceneNodeMaps: { [sceneId]: nodeMap } },
    scenes: {
      nodeType: 'ScenesNode',
      schemaVersion: 2,
      items: [
        {
          name: 'Social Media',
          sceneId,
          slots: { nodeType: 'SlotsNode', schemaVersion: 1, items: slots.reverse() },
        },
      ],
    },
  };
  // Use a stored archive to exercise scene import without the legacy ZIP inflater.
  // Assets are local, so the test needs no downloads, fonts, or user assets.
  const overlayPath = path.join(t.context.cacheDir, 'paired-folders.overlay');
  const archive = archiver('zip', { store: true });
  const output = fs.createWriteStream(overlayPath);
  await new Promise<void>((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    archive.append(JSON.stringify(config), { name: 'config.json' });
    archive.file(path.resolve('test/data/sources-files/images/sun.png'), { name: 'sun.png' });
    archive.finalize();
  });

  // Import into the test collection, then run the validation normally triggered by
  // collectionSwitched. Keep the existing active scene during asynchronous extraction.
  t.true(await focusWindow('worker'), 'worker window is available');
  try {
    await t.context.app.client.execute(filePath => {
      const manager = (window as any).servicesManager;
      const overlays = manager.getResource(
        'OverlaysPersistenceService',
      ) as OverlaysPersistenceService;
      const dualOutput = manager.getResource('DualOutputService') as DualOutputService;
      return overlays.loadOverlay(filePath).then(() => {
        dualOutput.validateDualOutputCollection();
      });
    }, overlayPath);
  } finally {
    await focusMain();
  }
  const imported = await snapshotFolderScene(t, sceneId);
  confirmRepairedFolders(t, imported);
  t.deepEqual(imported.nodeMap, nodeMap, 'import preserves the overlay partner IDs');
  for (const item of imported.items) {
    t.is(
      item.settings.visible,
      item.id.startsWith('h-'),
      'import preserves per-display visibility',
    );
    t.is(item.settings.locked, item.id.endsWith('-a'), 'import preserves per-item locks');
  }
  const vertical = imported.items.find(item => item.id === 'v-a');
  t.deepEqual(vertical.settings.transform.position, {
    x: video.baseWidth * 0.125,
    y: video.baseHeight * 0.25,
  });
  t.deepEqual(vertical.settings.transform.scale, { x: 1, y: 1 });
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

test('Dual output validation does not normalize a non-contiguous folder hierarchy', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const dualOutputService = client.getResource<DualOutputService>('DualOutputService');
  const sceneCollectionsService = client.getResource<SceneCollectionsService>(
    'SceneCollectionsService',
  );
  const scene = scenesService.createScene('Non-contiguous Folder Scene');
  const rootItem = scene.createAndAddSource('Root Item', 'color_source');
  const folder = scene.createFolder('Folder');
  const folderItem1 = scene.createAndAddSource('Folder Item1', 'color_source');
  folderItem1.setParent(folder.id);
  const folderItem2 = scene.createAndAddSource('Folder Item2', 'color_source');
  folderItem2.setParent(folder.id);

  dualOutputService.convertSingleOutputToDualOutputCollection();

  const nodeMap = sceneCollectionsService.sceneNodeMaps[scene.id];
  const horizontalNodeIds = [folder.id, folderItem1.id, rootItem.id, folderItem2.id];
  const verticalNodeIds = [folder.id, folderItem1.id, folderItem2.id, rootItem.id].map(
    nodeId => nodeMap[nodeId],
  );

  // Root Item closes Folder's subtree before Folder Item2 tries to re-enter it.
  // Keep the mapped parents valid so the preorder check is the only reason to
  // reject normalization.
  scene.setNodesOrder(horizontalNodeIds.concat(verticalNodeIds));
  const unsafeOrder = scene.getNodes().map(node => node.id);

  dualOutputService.validateDualOutputCollection();

  t.deepEqual(
    scene.getNodes().map(node => node.id),
    unsafeOrder,
    'Validation leaves z-order untouched when a closed folder subtree is reopened',
  );
  t.is(
    scene.getNode(folderItem2.id).parentId,
    folder.id,
    'Validation does not mutate the malformed horizontal hierarchy',
  );
  t.is(
    scene.getNode(nodeMap[folderItem2.id]).parentId,
    nodeMap[folder.id],
    'The rejected hierarchy still has mirrored vertical parents',
  );
});

test('Dual output validation does not normalize a child-before-parent hierarchy', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const dualOutputService = client.getResource<DualOutputService>('DualOutputService');
  const sceneCollectionsService = client.getResource<SceneCollectionsService>(
    'SceneCollectionsService',
  );
  const scene = scenesService.createScene('Child Before Parent Scene');
  const rootItem = scene.createAndAddSource('Root Item', 'color_source');
  const folder = scene.createFolder('Folder');
  const folderItem = scene.createAndAddSource('Folder Item', 'color_source');
  folderItem.setParent(folder.id);

  dualOutputService.convertSingleOutputToDualOutputCollection();

  const nodeMap = sceneCollectionsService.sceneNodeMaps[scene.id];
  const horizontalNodeIds = [folderItem.id, folder.id, rootItem.id];
  const verticalNodeIds = [folder.id, folderItem.id, rootItem.id].map(nodeId => nodeMap[nodeId]);

  scene.setNodesOrder(horizontalNodeIds.concat(verticalNodeIds));
  const unsafeOrder = scene.getNodes().map(node => node.id);

  dualOutputService.validateDualOutputCollection();

  t.deepEqual(
    scene.getNodes().map(node => node.id),
    unsafeOrder,
    'Validation leaves z-order untouched when a child precedes its parent folder',
  );
  t.is(
    scene.getNode(folderItem.id).parentId,
    folder.id,
    'Validation does not mutate the child-before-parent hierarchy',
  );
  t.is(
    scene.getNode(nodeMap[folderItem.id]).parentId,
    nodeMap[folder.id],
    'The rejected hierarchy still has mirrored vertical parents',
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
