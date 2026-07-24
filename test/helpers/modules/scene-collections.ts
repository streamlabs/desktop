import { TExecutionContext } from '../../helpers/webdriver';
import { getApiClient } from '../../helpers/api-client';
import { ScenesService } from 'services/api/external-api/scenes/scenes';
import { Scene } from 'services/api/external-api/scenes/scene';
import { SceneItem } from 'services/api/external-api/scenes/scene-item';
import { SceneItemFolder } from 'services/api/external-api/scenes/scene-item-folder';
import { DualOutputService } from 'services/api/external-api/dual-output/dual-output';

const fs = require('fs');
const path = require('path');

export function copyFile(src: string, dest: string) {
  return new Promise<void>((resolve, reject) => {
    const read = fs.createReadStream(src);
    const write = fs.createWriteStream(dest);

    read.on('error', (e: any) => reject(e));
    write.on('error', (e: any) => reject(e));
    write.on('finish', () => resolve());

    read.pipe(write);
  });
}

/**
 * Confirm if the scene collection is a vanilla or dual output collection
 * @remark - The identifiers of a dual output scene collection is the existence of
 * the sceneNodeMaps property in the scene collections manifest, and the nodeMaps
 * property in the scene collection json.
 * @param t - execution context
 * @param opts.fileName - name of the json file to read
 * @param opts.propName - property name to confirm
 * @param opts.type - 'single-output' or 'dual-output'
 * @param opts.message - assertion message context
 */
export function confirmIsCollectionType(
  t: TExecutionContext,
  opts: {
    fileName: string;
    propName: string;
    type: 'single-output' | 'dual-output';
    message: string;
  },
) {
  const { fileName, propName, type } = opts;

  const filePath = path.join(t.context.cacheDir, 'slobs-client', 'SceneCollections', fileName);

  try {
    const data = JSON.parse(fs.readFileSync(filePath).toString());
    const root = fileName === 'manifest.json' && data?.collections ? data?.collections[0] : data;

    if (type === 'dual-output') {
      t.true(
        root.hasOwnProperty(propName),
        `Expected ${fileName} to have property ${propName}: ${opts.message}`,
      );
    } else {
      t.true(
        !root.hasOwnProperty(propName),
        `Expected ${fileName} to not have property ${propName}: ${opts.message}`,
      );
    }
  } catch (e: unknown) {
    console.log('Error: ', e);
  }
}

/**
 * Confirm that each source in the scene has an even number of scene items,
 * since dual output pairs a horizontal and vertical node for each source.
 */
export function confirmDualOutputSources(t: TExecutionContext, scene: Scene) {
  const numSceneItems = scene
    .getItems()
    .map(item => item.getModel())
    .reduce((sources, item) => {
      if (sources[item.sourceId]) {
        sources[item.sourceId] += 1;
      } else {
        sources[item.sourceId] = 1;
      }
      return sources;
    }, {} as { [sourceId: string]: number });

  for (const [sourceId, count] of Object.entries(numSceneItems)) {
    t.is(count % 2, 0, `Scene does not have dual output source ${sourceId}`);
  }
}

/**
 * Confirm that a vertical scene item has the correct display and shares the
 * same source as its horizontal partner.
 */
export function confirmVerticalSceneItem(
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

/**
 * Validate that the sceneNodeMaps on disk match the in-memory state,
 * and that every node in each scene has a corresponding entry in the node map.
 * @param t - Test execution context
 * @param collectionFileName - The collection JSON filename on disk
 */
export async function validateSceneNodeMapsAndNodes(
  t: TExecutionContext,
  collectionFileName: string,
) {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const dualOutputService = client.getResource<DualOutputService>('DualOutputService');

  // Read the on-disk manifest and collection JSON
  const manifestPath = path.join(
    t.context.cacheDir,
    'slobs-client',
    'SceneCollections',
    'manifest.json',
  );
  const collectionPath = path.join(
    t.context.cacheDir,
    'slobs-client',
    'SceneCollections',
    collectionFileName,
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath).toString());
  const collection = JSON.parse(fs.readFileSync(collectionPath).toString());

  const manifestNodeMaps = manifest.collections[0].sceneNodeMaps;
  const collectionNodeMaps = collection.nodeMap?.sceneNodeMaps;
  const stateNodeMaps = dualOutputService.sceneNodeMaps;

  // Validate that the manifest and collection JSON agree on the node maps
  t.deepEqual(
    manifestNodeMaps,
    collectionNodeMaps,
    'Manifest sceneNodeMaps should match collection nodeMaps',
  );

  t.deepEqual(
    collectionNodeMaps,
    stateNodeMaps,
    'Collection nodeMaps should match app state node maps',
  );

  // Validate nodes per scene using the collection's scene node maps
  const sceneIds = Object.keys(collectionNodeMaps);
  for (const sceneId of sceneIds) {
    const scene = scenesService.getScene(sceneId);
    t.truthy(scene, `Scene ${sceneId} should exist in state`);

    const nodeMap = collectionNodeMaps[sceneId];

    // Collect all node IDs from items and folders
    const items = scene.getItems();
    const folders = scene.getFolders();
    const allNodeIds = new Set([
      ...items.map((item: SceneItem) => item.id),
      ...folders.map((folder: SceneItemFolder) => folder.id),
    ]);

    const horizontalIds = Object.keys(nodeMap);
    const verticalIds = Object.values(nodeMap) as string[];
    const allMappedIds = new Set([...horizontalIds, ...verticalIds]);

    // Every ID in the node map should exist as a node in the scene
    for (const hId of horizontalIds) {
      t.true(allNodeIds.has(hId), `Horizontal node ${hId} in node map should exist in scene`);
    }
    for (const vId of verticalIds) {
      t.true(allNodeIds.has(vId), `Vertical node ${vId} in node map should exist in scene`);
    }

    // Every node in the scene should appear in the map
    for (const nodeId of allNodeIds) {
      t.true(
        allMappedIds.has(nodeId),
        `Node ${nodeId} in scene "${scene.name}" should have an entry in the node map`,
      );
    }

    // Node map size should equal half the total nodes
    t.is(
      horizontalIds.length,
      allNodeIds.size / 2,
      `Scene "${scene.name}" node map should have exactly half as many entries as nodes`,
    );

    // Confirm no duplicate sources were created
    confirmDualOutputSources(t, scene);

    // Confirm each horizontal item's vertical partner has correct display and shared source
    items.forEach((sceneItem: SceneItem) => {
      if (sceneItem.display === 'horizontal') {
        const verticalNodeId = nodeMap[sceneItem.id];
        t.truthy(
          verticalNodeId,
          `Vertical node id exists for horizontal scene item ${sceneItem.id}`,
        );
        confirmVerticalSceneItem(t, scene, sceneItem, verticalNodeId);
      } else {
        const horizontalNodeId = Object.keys(nodeMap).find(
          (id: string) => nodeMap[id] === sceneItem.id,
        );
        t.truthy(
          horizontalNodeId,
          `Horizontal node id exists for vertical scene item ${sceneItem.id}`,
        );
      }
    });
  }
}
