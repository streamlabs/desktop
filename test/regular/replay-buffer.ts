import { readdir } from 'fs-extra';
import { ITestContext, test, TExecutionContext, useWebdriver } from '../helpers/webdriver';
import { sleep } from '../helpers/sleep';
import {
  setOutputResolution,
  setTemporaryRecordingPath,
  showSettingsWindow,
} from '../helpers/modules/settings/settings';
import {
  clickButton,
  clickCheckbox,
  clickTab,
  focusMain,
  isDisplayed,
} from '../helpers/modules/core';
import {
  saveReplayBuffer,
  startReplayBuffer,
  stopReplayBuffer,
} from '../helpers/modules/replay-buffer';
import { ExecutionContext } from 'ava';
import { useForm } from '../helpers/modules/forms';
import { startRecording, stopRecording } from '../helpers/modules/streaming';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

async function recordHighlight(
  t: ExecutionContext<ITestContext>,
  tmpDir: string,
  numFiles: number,
  message: string,
) {
  // record a fragment
  await startReplayBuffer();
  await saveReplayBuffer();
  await stopReplayBuffer();

  // Check that the replay-buffer file has been created
  await validateFiles(t, numFiles, tmpDir, message);
}

async function validateFiles(
  t: TExecutionContext,
  numFiles: number,
  tmpDir: string,
  message: string,
) {
  await sleep(300);
  const files = await readdir(tmpDir);
  t.is(files.length, numFiles, `${message}. Expected ${numFiles} and retrieved ${files.length}`);
}

async function toggleReplayBuffer(advanced: boolean = false) {
  await showSettingsWindow('Output', async () => {
    const { setDropdownInputValue } = useForm('Mode');

    if (advanced) {
      await setDropdownInputValue('Mode', 'Advanced');
      await clickTab('Replay Buffer');
    } else {
      await setDropdownInputValue('Mode', 'Simple');
    }

    await clickCheckbox('RecRB');
    await clickButton('Done');
    await focusMain();
  });
}

async function testRecording(
  t: ExecutionContext<ITestContext>,
  tmpDir: string,
  startingNumFiles: number = 0,
  advanced: boolean = false,
): Promise<number> {
  const type = advanced ? 'Advanced' : 'Simple';
  let numFiles = startingNumFiles;

  if (advanced) {
    await setTemporaryRecordingPath(true, tmpDir);

    await showSettingsWindow('Output', async () => {
      await clickTab('Replay Buffer');

      await clickCheckbox('RecRB');
      await clickButton('Done');
    });
  }

  await focusMain();

  // Start Recording before Replay Buffer
  // Note: Expect an additional file because of the temporary file created by the recording
  await startRecording();
  numFiles++;
  await sleep(1000);
  await validateFiles(
    t,
    numFiles,
    tmpDir,
    `${type}: Start Recording before start Replay Buffer created temporary file`,
  );

  numFiles++;
  await sleep(300);
  await recordHighlight(
    t,
    tmpDir,
    numFiles,
    `${type}: Start Recording before start Replay Buffer saved Highlight`,
  );

  // Stopping recording should save the temporary file
  await stopRecording();
  await sleep(300);
  await validateFiles(
    t,
    numFiles,
    tmpDir,
    `${type}: Stop Recording after stop Replay Buffer saved Recording`,
  );

  // Start Replay Buffer before Recording
  await startReplayBuffer();
  await startRecording();
  await sleep(3000);
  numFiles++;
  await validateFiles(
    t,
    numFiles,
    tmpDir,
    `${type}: Start Replay Buffer before start Recording created temporary file`,
  );

  await saveReplayBuffer();
  numFiles++;
  await sleep(300);
  await validateFiles(
    t,
    numFiles,
    tmpDir,
    `${type}: Start Replay Buffer before start Recording saved Highlight`,
  );

  await stopRecording();
  await sleep(300);
  await validateFiles(
    t,
    numFiles,
    tmpDir,
    `${type}: Stop Recording before stop Replay Buffer saved Recording`,
  );

  await saveReplayBuffer();
  numFiles++;
  await sleep(300);
  await validateFiles(
    t,
    numFiles,
    tmpDir,
    `${type}: Save Replay Buffer after stop Recording saved Highlight`,
  );

  await stopReplayBuffer();
  await sleep(300);
  await validateFiles(
    t,
    numFiles,
    tmpDir,
    `${type}: Stop Replay Buffer after stop Recording did not save Highlight`,
  );

  return numFiles;
}

test('Replay Buffer', async t => {
  const tmpDir = await setTemporaryRecordingPath();
  await setOutputResolution('100x100');

  // Simple Replay Buffer
  await recordHighlight(t, tmpDir, 1, 'Simple Replay Buffer recorded highlight');

  // disable replay buffer
  await toggleReplayBuffer();

  // check Start Replay Buffer is not visible
  t.false(await isDisplayed('button .icon-replay-buffer'), 'Simple Replay Buffer stopped');

  // Advanced Replay Buffer
  await setTemporaryRecordingPath(true, tmpDir);
  await toggleReplayBuffer(true);
  await recordHighlight(t, tmpDir, 2, 'Advanced Replay Buffer recorded highlight');
  await toggleReplayBuffer(true);

  // check Start Replay Buffer is not visible
  t.false(await isDisplayed('button .icon-replay-buffer'), 'Advanced Replay Buffer stopped');

  // Switch back to Simple Replay Buffer
  await toggleReplayBuffer();
  await recordHighlight(t, tmpDir, 3, 'Switches between Simple and Advanced Replay Buffer');
});

test('Replay Buffer with Recording', async t => {
  const tmpDir = await setTemporaryRecordingPath();
  await setOutputResolution('100x100');

  // Simple Replay Buffer and Recording
  const numFiles = await testRecording(t, tmpDir);
  // const numFiles = 0;

  // Advanced Replay Buffer and Recording
  await testRecording(t, tmpDir, numFiles, true);
});

test('Replay Buffer with Streaming', async t => {});

test('Replay Buffer with Streaming and Recording', async t => {});
