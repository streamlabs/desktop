import {
  TExecutionContext,
  startApp,
  stopApp,
  test,
  useWebdriver,
} from '../../../helpers/webdriver';
import { logIn } from '../../../helpers/webdriver/user';
import { toggleDualOutputMode } from '../../../helpers/modules/dual-output';

const fs = require('fs');
const path = require('path');

function copyFile(src: string, dest: string) {
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
 * @param fileName - name of the json file to read
 * @param propName - property name to confirm
 * @param dualOutput - true if confirming that the collection is a dual output collection, false if confirming it's a vanilla collection
 */
function confirmIsCollectionType(
  t: TExecutionContext,
  fileName: string,
  propName: string,
  dualOutput?: boolean,
) {
  const filePath = path.join(t.context.cacheDir, 'slobs-client', 'SceneCollections', fileName);

  try {
    const data = JSON.parse(fs.readFileSync(filePath).toString());
    const root = fileName === 'manifest.json' && data?.collections ? data?.collections[0] : data;

    if (dualOutput) {
      // dual output: has sceneNodeMaps prop in manifest, has nodeMap node in collection
      t.true(root.hasOwnProperty(propName));
    } else {
      // single output: no sceneNodeMaps prop in manifest, no nodeMap node in collection
      t.true(!root.hasOwnProperty(propName));
    }
  } catch (e: unknown) {
    console.log('Error: ', e);
  }
}

useWebdriver({
  skipOnboarding: true,
  clearCollectionAfterEachTest: false,
  beforeAppStartCb: async t => {
    const sceneCollectionsPath = path.join(t.context.cacheDir, 'slobs-client', 'SceneCollections');

    if (fs.existsSync(sceneCollectionsPath)) return;

    const dataDir = path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      '..',
      'test',
      'data',
      'scene-collections',
      'single-output-collection',
    );

    fs.mkdirSync(path.join(t.context.cacheDir, 'slobs-client'));
    fs.mkdirSync(sceneCollectionsPath);

    await copyFile(
      path.join(dataDir, 'single-output-collection.json'),
      path.join(sceneCollectionsPath, '3c6cf522-6b85-4d64-a152-236939c63686.json'),
    );

    await copyFile(
      path.join(dataDir, 'single-output-collection-manifest.json'),
      path.join(sceneCollectionsPath, 'manifest.json'),
    );
  },
});

test('Loading single & dual output scene collections', async (t: TExecutionContext) => {
  // confirm no scene node map for single output collection
  confirmIsCollectionType(t, 'manifest.json', 'sceneNodeMaps');
  confirmIsCollectionType(t, '3c6cf522-6b85-4d64-a152-236939c63686.json', 'nodeMap');

  // confirm save/load single output collection
  await stopApp(t, false);
  await startApp(t);
  confirmIsCollectionType(t, 'manifest.json', 'sceneNodeMaps');
  confirmIsCollectionType(t, '3c6cf522-6b85-4d64-a152-236939c63686.json', 'nodeMap');

  // confirm save/load dual output collection
  await logIn(t);
  await toggleDualOutputMode();
  await stopApp(t, false);
  await startApp(t, true);
  confirmIsCollectionType(t, 'manifest.json', 'sceneNodeMaps', true);
  confirmIsCollectionType(t, '3c6cf522-6b85-4d64-a152-236939c63686.json', 'nodeMap', true);
});
