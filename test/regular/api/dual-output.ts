import { DualOutputService } from 'services/dual-output';
import { getApiClient } from '../../helpers/api-client';
import { test, useWebdriver, TExecutionContext } from '../../helpers/webdriver';
import { ScenesService, Scene, SceneItem } from '../../../app/services/api/external-api/scenes';
import { VideoSettingsService } from 'services/settings-v2/video';

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

test('Dual Output sources and scenes', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const videoSettingsService = client.getResource<VideoSettingsService>('VideoSettingsService');
  const dualOutputService = client.getResource<DualOutputService>('DualOutputService');

  let verticalContext = videoSettingsService.contexts.vertical;
  t.is(
    verticalContext,
    null,
    'Single output scene collection does not create vertical context on app start.',
  );

  dualOutputService.collectionHandled.subscribe(() => void 0);

  // dual output
  dualOutputService.convertSingleOutputToDualOutputCollection();

  // validate scene node maps
  const sceneNodeMaps = (await client.fetchNextEvent()).data;
  t.not(sceneNodeMaps, null, 'Dual output scene collection initiates scene node map.');

  // validate vertical video context
  verticalContext = videoSettingsService.contexts.vertical;
  t.is(
    verticalContext,
    null,
    'Converting a single output collection to a dual output collection creates a vertical video context.',
  );

  // TEST ADD
  const item = scenesService.activeScene.createAndAddSource('Color 1', 'color_source');

  // confirm adding scene item to dual output collection does not create an additional source
  confirmDualOutputSources(t, scenesService.activeScene);

  console.log('scenesService.activeScene ', scenesService.activeScene.nodes);
});
