import {
  TExecutionContext,
  startApp,
  stopApp,
  test,
  useWebdriver,
} from '../../../helpers/webdriver';
import { logIn } from '../../../helpers/webdriver/user';
import { toggleDualOutputMode } from '../../../helpers/modules/dual-output';
import { sleep } from '../../../helpers/sleep';

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
 * Confirms whether a saved collection contains real horizontal-to-vertical node mappings.
 * The nodeMap wrapper itself is serialized for single-output collections and is therefore
 * not a Dual Output identifier.
 */
function confirmIsCollectionType(
  t: TExecutionContext,
  fileName: string,
  dualOutput = false,
) {
  const filePath = path.join(t.context.cacheDir, 'slobs-client', 'SceneCollections', fileName);
  const data = JSON.parse(fs.readFileSync(filePath).toString());
  const isManifest = fileName === 'manifest.json';
  const root = isManifest
    ? data.collections.find((collection: { id: string }) => collection.id === data.activeId) ??
      data.collections[0]
    : data;
  const sceneNodeMaps = (isManifest
    ? root.sceneNodeMaps
    : root.nodeMap?.sceneNodeMaps) as Dictionary<Dictionary<string>> | undefined;
  const hasMappings = Object.values(sceneNodeMaps ?? {}).some(sceneMap =>
    Object.values(sceneMap).some(verticalNodeId => verticalNodeId.length > 0),
  );

  t.is(
    hasMappings,
    dualOutput,
    `Expected ${fileName} ${dualOutput ? 'to contain' : 'not to contain'} Dual Output mappings`,
  );

  if (!isManifest) {
    t.is(
      root.dualOutputMode === true,
      dualOutput,
      `Expected ${fileName} to persist Dual Output mode as ${dualOutput}`,
    );
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
  confirmIsCollectionType(t, 'manifest.json');
  confirmIsCollectionType(t, '3c6cf522-6b85-4d64-a152-236939c63686.json');
  await sleep(500);

  // confirm save/load single output collection
  await stopApp(t, false);
  await startApp(t);
  confirmIsCollectionType(t, 'manifest.json');
  confirmIsCollectionType(t, '3c6cf522-6b85-4d64-a152-236939c63686.json');

  // confirm save/load dual output collection
  await sleep(500);
  await logIn(t);
  await toggleDualOutputMode();
  await sleep(500);
  await stopApp(t, false);
  await startApp(t, true);
  confirmIsCollectionType(t, 'manifest.json', true);
  confirmIsCollectionType(t, '3c6cf522-6b85-4d64-a152-236939c63686.json', true);

  // await logOut(t);
  await stopApp(t, false);
  t.pass();
});
