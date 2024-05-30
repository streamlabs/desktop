import { useWebdriver, test } from '../helpers/webdriver';
import { sceneExisting } from '../helpers/modules/scenes';

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

useWebdriver({
  beforeAppStartCb: async t => {
    const dataDir = path.resolve(__dirname, '..', '..', '..', 'test', 'data');

    fs.mkdirSync(path.join(t.context.cacheDir, 'nair-client'));
    const sceneCollectionsPath = path.join(t.context.cacheDir, 'nair-client', 'SceneCollections');
    fs.mkdirSync(sceneCollectionsPath);

    await copyFile(
      path.join(dataDir, 'scene-collection.json'),
      path.join(sceneCollectionsPath, '4e467470-923c-43a3-90d2-2be39c8c34ee.json'),
    );

    await copyFile(
      path.join(dataDir, 'scene-collection-manifest.json'),
      path.join(sceneCollectionsPath, 'manifest.json'),
    );
  },
});

/**
 * This test ensures a reasonable level of backwards compatibility
 * with old scene collection formats.  This current snapshot of
 * a valid scene collection schema was taken on 5/22/18.
 */
test('Loading an old scene collection', async t => {
  // Make sure we loaded the scenes
  t.true(await sceneExisting('Stream Starting Soon'));
  t.true(await sceneExisting('Live Screen'));
  t.true(await sceneExisting('Intermission'));
  t.true(await sceneExisting('Be Right Back'));
  t.true(await sceneExisting('Stream Ending Soon'));
});
