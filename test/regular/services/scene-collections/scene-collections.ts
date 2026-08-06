import {
  TExecutionContext,
  startApp,
  stopApp,
  test,
  useWebdriver,
} from '../../../helpers/webdriver';
import { logIn, logOut } from '../../../helpers/webdriver/user';
import {
  copyFile,
  confirmIsCollectionType,
  validateSceneNodeMapsAndNodes,
} from '../../../helpers/modules/scene-collections';

const path = require('path');
const fs = require('fs');

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver({
  skipOnboarding: true,
  clearCollectionAfterEachTest: false,
  beforeAppStartCb: async t => {
    const sceneCollectionsPath = path.join(t.context.cacheDir, 'slobs-client', 'SceneCollections');

    if (fs.existsSync(sceneCollectionsPath)) return;

    // Intentionally load a single output scene collection to confirm that it is automatically converted to dual output on load.
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

/**
 * Test loading scene collections
 * @remark A single output collection should be loaded before app start
 */
test('Loading single & dual output scene collections', async (t: TExecutionContext) => {
  // Confirm that a single output collection was converted to a dual output collection on load
  confirmIsCollectionType(t, {
    fileName: 'manifest.json',
    propName: 'sceneNodeMaps',
    type: 'dual-output',
    message: 'converted on load',
  });
  confirmIsCollectionType(t, {
    fileName: '3c6cf522-6b85-4d64-a152-236939c63686.json',
    propName: 'nodeMap',
    type: 'dual-output',
    message: 'converted on load',
  });

  // Validate scene nodes and scene node maps converted correctly on load
  await validateSceneNodeMapsAndNodes(t, '3c6cf522-6b85-4d64-a152-236939c63686.json');

  // Restart app and login to confirm that the dual output collection is still present after app restart
  await stopApp(t, false);
  await startApp(t);
  await logIn(t);

  confirmIsCollectionType(t, {
    fileName: 'manifest.json',
    propName: 'sceneNodeMaps',
    type: 'dual-output',
    message: 'load on app start',
  });
  confirmIsCollectionType(t, {
    fileName: '3c6cf522-6b85-4d64-a152-236939c63686.json',
    propName: 'nodeMap',
    type: 'dual-output',
    message: 'load on app start',
  });

  // Validate scene nodes and scene node maps are the same after app restart
  await validateSceneNodeMapsAndNodes(t, '3c6cf522-6b85-4d64-a152-236939c63686.json');

  await logOut(t);
  await stopApp(t, false);
});
