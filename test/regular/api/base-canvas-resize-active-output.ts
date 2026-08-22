import { SceneCollectionsService } from 'services/scene-collections';
import { VideoSettingsService } from 'services/settings-v2/video';
import { getApiClient } from '../../helpers/api-client';
import { focusMain } from '../../helpers/modules/core';
import { startReplayBuffer, stopReplayBuffer } from '../../helpers/modules/replay-buffer';
import { setTemporaryRecordingPath } from '../../helpers/modules/settings/settings';
import { test, useWebdriver } from '../../helpers/webdriver';

useWebdriver();

function messageFromRejectedApiCall(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String((error as { error?: string })?.error ?? error);
}

test('an active replay buffer rejects a base canvas resize before changing video', async t => {
  const client = await getApiClient();
  const collections = client.getResource<SceneCollectionsService>('SceneCollectionsService');
  const videoSettings = client.getResource<VideoSettingsService>('VideoSettingsService');
  const originalHorizontal = videoSettings.baseResolutions.horizontal;
  const differentHorizontal =
    originalHorizontal.baseWidth === 1280 && originalHorizontal.baseHeight === 720
      ? { baseWidth: 1920, baseHeight: 1080 }
      : { baseWidth: 1280, baseHeight: 720 };

  await setTemporaryRecordingPath();
  await focusMain();
  await startReplayBuffer();

  try {
    let error: unknown;
    try {
      await collections.resizeBaseCanvas(differentHorizontal);
    } catch (resizeError: unknown) {
      error = resizeError;
    }

    t.truthy(error);
    t.regex(
      messageFromRejectedApiCall(error),
      /base canvas cannot be changed while replay buffer is active/i,
    );
    t.deepEqual(videoSettings.baseResolutions.horizontal, originalHorizontal);
  } finally {
    await stopReplayBuffer();
  }
});
