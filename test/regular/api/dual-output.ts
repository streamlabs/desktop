import { DualOutputService } from 'services/dual-output';
import { getApiClient } from '../../helpers/api-client';
import { test, useWebdriver, TExecutionContext } from '../../helpers/webdriver';
import { ScenesService, Scene, SceneItem } from 'services/scenes';
import { VideoSettingsService } from 'services/settings-v2/video';
import { SceneCollectionsService } from 'services/scene-collections';
import type { OverlaysPersistenceService } from 'services/scene-collections/overlays';
import { focusMain, focusWindow } from '../../helpers/modules/core';
import fs = require('fs');
import path = require('path');
import archiver = require('archiver');

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

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
      before.nodes,
      'valid folder hierarchy and full node order are preserved',
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
