import { DualOutputService } from 'services/dual-output';
import { getApiClient } from '../../helpers/api-client';
import { test, useWebdriver, TExecutionContext } from '../../helpers/webdriver';
import { ScenesService, Scene, SceneItem } from 'services/scenes';
import { VideoSettingsService } from 'services/settings-v2/video';
import { SelectionService } from 'services/api/external-api/selection';
import { click, focusMain, waitForDisplayed } from '../../helpers/modules/core';

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
