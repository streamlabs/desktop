import { getApiClient } from '../../helpers/api-client';
import { focusMain } from '../../helpers/modules/core';
import { setTemporaryRecordingPath } from '../../helpers/modules/settings/settings';
import { startRecording, stopRecording } from '../../helpers/modules/streaming';
import { test, useWebdriver } from '../../helpers/webdriver';
import { SceneCollectionsService } from 'services/scene-collections';
import { ScenesService } from '../../../app/services/api/external-api/scenes';
import { VideoSettingsService } from '../../../app/services/settings-v2/video';

useWebdriver();

async function startTemporaryRecording() {
  await setTemporaryRecordingPath();
  await focusMain();
  await startRecording();
}

async function stopTemporaryRecording() {
  await focusMain();
  await stopRecording();
}

function messageFromRejectedApiCall(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String((error as { error?: string })?.error ?? error);
}

test('an active recording permits loading a collection with matching canvas baselines', async t => {
  const client = await getApiClient();
  const collections = client.getResource<SceneCollectionsService>('SceneCollectionsService');
  const scenes = client.getResource<ScenesService>('ScenesService');
  const originalCollection = collections.activeCollection!;
  const targetCollection = await collections.create({ name: 'Matching canvas target' });
  const targetSceneIds = scenes.getScenes().map(scene => scene.id);

  await collections.load(originalCollection.id);
  await startTemporaryRecording();

  try {
    await t.notThrowsAsync(() => collections.load(targetCollection.id));
    t.is(collections.activeCollection!.id, targetCollection.id);
    t.deepEqual(
      scenes.getScenes().map(scene => scene.id),
      targetSceneIds,
    );
  } finally {
    await stopTemporaryRecording();
  }
});

test('an active recording rejects a target that requires a canvas reset before teardown', async t => {
  const client = await getApiClient();
  const collections = client.getResource<SceneCollectionsService>('SceneCollectionsService');
  const scenes = client.getResource<ScenesService>('ScenesService');
  const videoSettings = client.getResource<VideoSettingsService>('VideoSettingsService');
  const originalCollection = collections.activeCollection!;
  const targetCollection = await collections.create({ name: 'Different canvas target' });
  const currentHorizontal = videoSettings.baseResolutions.horizontal;
  const differentHorizontal =
    currentHorizontal.baseWidth === 1280 && currentHorizontal.baseHeight === 720
      ? { baseWidth: 1920, baseHeight: 1080 }
      : { baseWidth: 1280, baseHeight: 720 };

  await collections.resizeBaseCanvas(differentHorizontal);
  await collections.load(originalCollection.id);

  const originalSceneIds = scenes.getScenes().map(scene => scene.id);
  await startTemporaryRecording();

  try {
    let error: unknown;
    try {
      await collections.load(targetCollection.id);
    } catch (loadError: unknown) {
      error = loadError;
    }

    t.truthy(error);
    t.regex(messageFromRejectedApiCall(error), /cannot be switched while recording is active/i);
    t.is(collections.activeCollection!.id, originalCollection.id);
    t.deepEqual(
      scenes.getScenes().map(scene => scene.id),
      originalSceneIds,
    );
  } finally {
    await stopTemporaryRecording();
  }
});

test('an active recording rejects deleting into a different canvas before manifest mutation', async t => {
  const client = await getApiClient();
  const collections = client.getResource<SceneCollectionsService>('SceneCollectionsService');
  const scenes = client.getResource<ScenesService>('ScenesService');
  const videoSettings = client.getResource<VideoSettingsService>('VideoSettingsService');
  const replacementCollection = collections.activeCollection!;
  const deletionTarget = await collections.create({ name: 'Active collection to retain' });
  const currentHorizontal = videoSettings.baseResolutions.horizontal;
  const differentHorizontal =
    currentHorizontal.baseWidth === 1280 && currentHorizontal.baseHeight === 720
      ? { baseWidth: 1920, baseHeight: 1080 }
      : { baseWidth: 1280, baseHeight: 720 };

  await collections.resizeBaseCanvas(differentHorizontal);

  const originalSceneIds = scenes.getScenes().map(scene => scene.id);
  await startTemporaryRecording();

  try {
    const eventWatcher = client.watchForEvents([
      'SceneCollectionsService.collectionWillSwitch',
      'SceneCollectionsService.collectionSwitched',
      'SceneCollectionsService.collectionRemoved',
    ]);
    let error: unknown;
    try {
      await collections.delete(deletionTarget.id);
    } catch (deleteError: unknown) {
      error = deleteError;
    }

    t.truthy(error);
    t.regex(messageFromRejectedApiCall(error), /cannot be switched while recording is active/i);
    t.deepEqual(eventWatcher.receivedEvents, []);
    t.is(collections.activeCollection!.id, deletionTarget.id);
    t.truthy(collections.collections.find(collection => collection.id === deletionTarget.id));
    t.truthy(
      collections.collections.find(collection => collection.id === replacementCollection.id),
    );
    t.deepEqual(
      scenes.getScenes().map(scene => scene.id),
      originalSceneIds,
    );
  } finally {
    await stopTemporaryRecording();
  }
});
