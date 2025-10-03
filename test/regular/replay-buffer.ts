import { test, useWebdriver } from '../helpers/webdriver';

import {
  setOutputResolution,
  setTemporaryRecordingPath,
} from '../helpers/modules/settings/settings';
import { isDisplayed } from '../helpers/modules/core';
import { recordHighlight, toggleReplayBuffer } from '../helpers/modules/replay-buffer';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Replay Buffer', async t => {
  const tmpDir = await setTemporaryRecordingPath();
  await setOutputResolution('100x100');

  // Simple Replay Buffer
  await recordHighlight(t, tmpDir, 1, 'Simple Replay Buffer recorded highlight');

  // Disable Simple Replay Buffer
  await toggleReplayBuffer();

  // check Start Replay Buffer is not visible
  t.false(await isDisplayed('button .icon-replay-buffer'), 'Simple Replay Buffer stopped');

  // Advanced Replay Buffer
  await setTemporaryRecordingPath(true, tmpDir);
  await toggleReplayBuffer(true);
  await recordHighlight(t, tmpDir, 2, 'Advanced Replay Buffer recorded highlight');

  // Disable Advanced Replay Buffer
  await toggleReplayBuffer(true);

  // check Start Replay Buffer is not visible
  t.false(await isDisplayed('button .icon-replay-buffer'), 'Advanced Replay Buffer stopped');

  // // Switch back to Simple Replay Buffer
  await toggleReplayBuffer();
  await recordHighlight(t, tmpDir, 3, 'Switches between Simple and Advanced Replay Buffer');
});
