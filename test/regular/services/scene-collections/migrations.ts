import { skipCheckingErrorsInLog, test, useWebdriver } from '../../../helpers/webdriver';
import { sceneExisting } from '../../../helpers/modules/scenes';
import { getApiClient } from '../../../helpers/api-client';
import { SceneCollectionsService } from '../../../../app/services/api/external-api/scene-collections';
import { NotificationsService } from '../../../../app/services/api/external-api/notifications/notifications';

const fs = require('fs');
const path = require('path');

const LEGACY_COLLECTION_ID = '4e467470-923c-43a3-90d2-2be39c8c34ee';
const FAIL_CLOSED_COLLECTION_ID = '0beea742-fcb8-4cf0-9c54-a22f01247437';
const UNSUPPORTED_SOURCE_TYPE = 'unsupported_relative_coordinates_test_source';
const COORDINATE_MIGRATION_BLOCKED_NOTIFICATION_CODE =
  'SCENE_COLLECTION_COORDINATE_MIGRATION_BLOCKED';

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

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver({
  noSync: true,
  beforeAppStartCb: async t => {
    const dataDir = path.resolve(__dirname, '..', '..', '..', '..', '..', 'test', 'data');
    const legacyFixturePath = path.join(dataDir, 'scene-collection.json');

    fs.mkdirSync(path.join(t.context.cacheDir, 'slobs-client'));
    const sceneCollectionsPath = path.join(t.context.cacheDir, 'slobs-client', 'SceneCollections');
    fs.mkdirSync(sceneCollectionsPath);

    await copyFile(
      legacyFixturePath,
      path.join(sceneCollectionsPath, `${LEGACY_COLLECTION_ID}.json`),
    );

    const failClosedFixture = JSON.parse(fs.readFileSync(legacyFixturePath).toString());
    failClosedFixture.sources.items[0].type = UNSUPPORTED_SOURCE_TYPE;
    fs.writeFileSync(
      path.join(sceneCollectionsPath, `${FAIL_CLOSED_COLLECTION_ID}.json`),
      JSON.stringify(failClosedFixture, null, 2),
    );

    const manifest = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'scene-collection-manifest.json')).toString(),
    );
    manifest.collections.push({
      ...manifest.collections[0],
      id: FAIL_CLOSED_COLLECTION_ID,
      name: 'Legacy Unsupported Source',
    });
    fs.writeFileSync(
      path.join(sceneCollectionsPath, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
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

  const collectionPath = path.join(
    t.context.cacheDir,
    'slobs-client',
    'SceneCollections',
    `${LEGACY_COLLECTION_ID}.json`,
  );
  const absoluteBackupPath = `${collectionPath}.absolute.bak`;
  const migrated = JSON.parse(fs.readFileSync(collectionPath).toString());
  const absoluteBackup = JSON.parse(fs.readFileSync(absoluteBackupPath).toString());

  t.is(migrated.schemaVersion, 5);
  t.true(migrated.relativeCoordinates);
  t.truthy(migrated.baseResolutions.horizontal);
  t.truthy(migrated.baseResolutions.vertical);
  t.is(absoluteBackup.schemaVersion, 1);
});

test('A legacy collection with an unsupported source fails coordinate migration closed', async t => {
  const client = await getApiClient();
  const sceneCollectionsService = client.getResource<SceneCollectionsService>(
    'SceneCollectionsService',
  );
  const notificationsService = client.getResource<NotificationsService>('NotificationsService');

  // The rejected strict migration intentionally logs its reason before Desktop
  // reloads the original data in compatibility mode.
  skipCheckingErrorsInLog();
  await sceneCollectionsService.load(FAIL_CLOSED_COLLECTION_ID);

  const collectionPath = path.join(
    t.context.cacheDir,
    'slobs-client',
    'SceneCollections',
    `${FAIL_CLOSED_COLLECTION_ID}.json`,
  );
  const absoluteBackupPath = `${collectionPath}.absolute.bak`;

  t.is(sceneCollectionsService.activeCollection.id, FAIL_CLOSED_COLLECTION_ID);
  t.true(fs.existsSync(absoluteBackupPath));

  const persisted = JSON.parse(fs.readFileSync(collectionPath).toString());
  const absoluteBackup = JSON.parse(fs.readFileSync(absoluteBackupPath).toString());

  t.is(absoluteBackup.schemaVersion, 1);
  t.is(absoluteBackup.sources.items[0].type, UNSUPPORTED_SOURCE_TYPE);
  t.deepEqual(persisted, absoluteBackup);
  t.is(persisted.schemaVersion, 1);
  t.false(persisted.relativeCoordinates === true);

  const migrationWarning = notificationsService
    .getAll()
    .find(notification => notification.code === COORDINATE_MIGRATION_BLOCKED_NOTIFICATION_CODE);
  t.truthy(migrationWarning);
  t.is(migrationWarning!.type, 'WARNING');
  t.true(migrationWarning!.unread);
  t.is(migrationWarning!.lifeTime, -1);
  t.true(migrationWarning!.message.includes('changes to it will not be saved'));

  await sceneCollectionsService.load(LEGACY_COLLECTION_ID);
  t.false(notificationsService.getNotification(migrationWarning!.id).unread);
});
