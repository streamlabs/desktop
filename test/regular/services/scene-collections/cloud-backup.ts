import { startApp, stopApp, test, useWebdriver } from '../../../helpers/webdriver';
import { SceneBuilder } from '../../../helpers/scene-builder';
import { getApiClient } from '../../../helpers/api-client';
import { logIn, loginWithAuthInfo } from '../../../helpers/webdriver/user';
import { SceneCollectionsService } from '../../../../app/services/api/external-api/scene-collections';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver({ noSync: false });

test('Scene-collections cloud-backup', async t => {
  // log-in and save the credentials
  const authInfo = await logIn(t, 'twitch', {}, true, true);

  // create an new empty collection
  const api = await getApiClient();
  const collectionsService = api.getResource<SceneCollectionsService>('SceneCollectionsService');
  const collection = await collectionsService.create({ name: 'Test collection' });

  // build the scene
  const sceneBuilder = new SceneBuilder(api);
  const sketch = `
    Folder1
      Item1: color_source
      Item2: image_source
  `;
  sceneBuilder.build(sketch);

  // Shutdown persists locally; cloud synchronization runs on explicit collection operations
  // and startup. Save the edited graph, then sync it before discarding the local cache.
  await collectionsService.load(collection.id);
  await collectionsService.rename(collection.name, collection.id);

  // restart the app and delete the cache dir
  await stopApp(t, true);
  await startApp(t);

  // since we deleted the cache dir we need to login again
  // use saved credentials to login into the same account
  await loginWithAuthInfo(t, authInfo);

  // check the scene-collection is downloaded
  t.is(collectionsService.activeCollection.name, collection.name);
  t.true(sceneBuilder.isEqualTo(sketch), 'Scene collection should be downloaded');

  // clear the collection
  await collectionsService.delete(collectionsService.activeCollection.id);
});
