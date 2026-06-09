import { readdir } from 'fs-extra';
import { test, TExecutionContext, useWebdriver } from '../helpers/webdriver';
import { sleep } from '../helpers/sleep';
import {
  clickGoLive,
  prepareToGoLive,
  startRecording,
  stopRecording,
  stopStream,
  submit,
  waitForSettingsWindowLoaded,
  waitForStreamStart,
} from '../helpers/modules/streaming';
import {
  setOutputResolution,
  setTemporaryRecordingPath,
  showSettingsWindow,
} from '../helpers/modules/settings/settings';
import {
  clickButton,
  clickTab,
  clickCheckbox,
  clickToggle,
  clickWhenDisplayed,
  focusMain,
  getNumElements,
  waitForDisplayed,
} from '../helpers/modules/core';
import { logIn, logOut } from '../helpers/webdriver/user';
import { toggleDualOutputMode } from '../helpers/modules/dual-output';
import { showPage } from '../helpers/modules/navigation';
import { useForm, fillForm } from '../helpers/modules/forms';
import * as childProcess from 'child_process';
import * as path from 'path';
import { platform } from 'os';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

const FFMPEG_DIR = path.resolve('node_modules', 'obs-studio-node');

const FFPROBE_EXE = path.join(
  FFMPEG_DIR,
  platform() === 'darwin' ? path.join('Frameworks', 'ffprobe') : 'ffprobe.exe',
);

/**
 * Iterate over all formats and record a 0.5s video in each.
 * @param advanced - whether to use advanced settings
 * @returns number of formats
 */
async function createRecordingFiles(advanced: boolean = false): Promise<number> {
  const formats = advanced
    ? ['flv', 'mp4', 'mov', 'mkv', 'mpegts', 'hls']
    : ['flv', 'mp4', 'mov', 'mkv', 'mpegts'];

  // Record 0.5s video in every format
  for (const format of formats) {
    await showSettingsWindow('Output', async () => {
      if (advanced) {
        await clickTab('Recording');
      }

      const { setDropdownInputValue } = useForm('Recording');
      await setDropdownInputValue('RecFormat', format);
      await clickButton('Close');
    });

    await focusMain();
    await startRecording();
    await sleep(500);
    await stopRecording();
    await sleep(2000);

    // Confirm notification has been shown and navigate to the recording history
    await focusMain();
    await clickWhenDisplayed('span=A new Recording has been completed. Click for more info');
    await waitForDisplayed('h1=Recordings', { timeout: 1000 });
    await sleep(500);
    await showPage('Editor');
  }

  return Promise.resolve(formats.length);
}

/**
 * Confirm correct number of files were created and that they are displayed in the recording history.
 * @param t - AVA test context
 * @param tmpDir - temporary directory where recordings are saved
 * @param numFormats - number of formats used to record
 */
async function validateRecordingFiles(
  t: TExecutionContext,
  tmpDir: string,
  numFormats: number,
  advanced: boolean = false,
) {
  // Check that every file was created
  const files = await readdir(tmpDir);

  // M3U8 creates multiple TS files in addition to the catalog itself.
  // The additional TS files created by M3U8 in advanced mode are not displayed in the recording history
  const numFiles = advanced ? files.length - 1 : files.length;

  t.true(numFiles >= numFormats, `Files that were created:\n${files.join('\n')}`);

  // Check that the recordings are displayed in the recording history
  await showPage('Recordings');
  waitForDisplayed('h1=Recordings');

  const numRecordings = await getNumElements('[data-test=filename]');
  t.is(
    numRecordings,
    numFiles,
    `All recordings from ${
      advanced ? 'Advanced' : 'Simple'
    } mode in history matches number of files recorded`,
  );
}

/**
 * Recording with one context active (horizontal, simple)
 */
test('Recording', async t => {
  // low resolution reduces CPU usage
  await setOutputResolution('100x100');

  // Simple Recording
  const tmpDir = await setTemporaryRecordingPath();
  const numSimpleFormats = await createRecordingFiles();
  await validateRecordingFiles(t, tmpDir, numSimpleFormats);

  // Advanced Recording
  await setTemporaryRecordingPath(true, tmpDir);
  const numAdvancedFormats = await createRecordingFiles(true);
  await validateRecordingFiles(t, tmpDir, numSimpleFormats + numAdvancedFormats, true);

  // Switches between Advanced and Simple Recording
  // Note: The recording path for Simple Recording should have persisted from before
  await showSettingsWindow('Output', async () => {
    const { setDropdownInputValue } = useForm('Mode');
    await setDropdownInputValue('Mode', 'Simple');
    await clickButton('Close');
  });

  await focusMain();
  await startRecording();
  // Record for 2s to prevent the recording from accidentally having the same key
  await sleep(2000);
  await stopRecording();
  await clickWhenDisplayed('span=A new Recording has been completed. Click for more info');
  await validateRecordingFiles(t, tmpDir, numSimpleFormats + numAdvancedFormats + 1, true);

  t.pass();
});

/**
 * Recording with two contexts active (horizontal and vertical)
 * should produce no different results than with one context.
 */
test('Recording with two contexts active', async t => {
  await logIn(t);
  await toggleDualOutputMode();

  // low resolution reduces CPU usage
  await setOutputResolution('100x100');
  const tmpDir = await setTemporaryRecordingPath(true);

  const numFiles = await createRecordingFiles(true);
  await validateRecordingFiles(t, tmpDir, numFiles, true);

  await logOut(t, true);
});

test('Recording from Go Live window', async t => {
  const user = await logIn(t);
  await prepareToGoLive();
  const tmpDir = await setTemporaryRecordingPath();

  await clickGoLive();
  await waitForSettingsWindowLoaded();

  await clickToggle('recording-toggle');

  if (user.type === 'twitch') {
    await fillForm({
      twitchGame: 'Fortnite',
    });
  }

  if (user.type === 'youtube') {
    await fillForm({
      title: 'Test Stream',
      description: 'Test Stream Description',
    });
  }

  await submit();
  await waitForStreamStart();
  await focusMain();
  await sleep(2000);
  await stopRecording();
  await stopStream();

  await validateRecordingFiles(t, tmpDir, 1);

  await logOut(t, true);
});

/*
 * Open Output settings, fill out the recording form with the provided arguments,
 * and verify that a recording can be successfully created with those settings.
 * The callback can be used to click additional options in the form after filling
 * out the main parameters.
 */
async function createRecordingWithFormParms(
  formArgs: Record<string, unknown>,
  callback?: () => Promise<void>,
): Promise<void> {
  await showSettingsWindow('Output', async () => {
    await clickTab('Recording');

    const { fillForm } = useForm('Recording');
    await fillForm(formArgs);
    if (callback) {
      await callback();
    }
    await clickButton('Close');
  });

  await focusMain();
  await startRecording();
  await sleep(500);
  await stopRecording();
  await sleep(2000);

  // Confirm notification has been shown and navigate to the recording history
  await focusMain();
  await clickWhenDisplayed('span=A new Recording has been completed. Click for more info');
  await waitForDisplayed('h1=Recordings', { timeout: 1000 });
  await sleep(500);
  await showPage('Editor');
}

async function validateRescaleRecording(
  t: TExecutionContext,
  tmpDir: string,
  expectedWidth: number,
  expectedHeight: number,
): Promise<void> {
  const files = await readdir(tmpDir);
  t.true(files.length >= 1, `Files that were created:\n${files.join('\n')}`);
  // Pick the first video file and verify its resolution matches the rescale dimensions
  const videoFile = files.find(f => f.endsWith('.mkv'));
  t.truthy(videoFile, 'Expected a .mkv recording file');

  const filePath = path.join(tmpDir, videoFile);
  const result = childProcess.execFileSync(
    FFPROBE_EXE,
    ['-v', 'quiet', '-print_format', 'json', '-show_streams', filePath],
    { encoding: 'utf8' },
  );
  const { streams } = JSON.parse(result);
  const videoStream = streams.find((s: any) => s.codec_type === 'video');
  if (!videoStream) {
    t.fail(`No video stream found. Streams: ${JSON.stringify(streams)}`);
    return;
  }
  t.is(videoStream.width, expectedWidth, `Recording width should be ${expectedWidth}`);
  t.is(videoStream.height, expectedHeight, `Recording height should be ${expectedHeight}`);
}

test('Recording with rescaling', async t => {
  await logIn(t);
  try {
    // low resolution reduces CPU usage
    await setOutputResolution('1920x1080'); // Not using 100x100 since we are rescaling resolution.

    // Advanced Recording
    const tmpDir = await setTemporaryRecordingPath(true);
    await createRecordingWithFormParms({
      RecFormat: 'mkv',
      RecRescale: true,
      RecRescaleRes: '1280x720',
    });

    await validateRescaleRecording(t, tmpDir, 1280, 720);
  } finally {
    await logOut(t, true);
  }
});

async function validateTitleContainsNoSpaces(t: TExecutionContext, tmpDir: string): Promise<void> {
  const files = await readdir(tmpDir);
  t.true(files.length >= 1, `Files that were created:\n${files.join('\n')}`);
  const videoFile = files.find(f => f.endsWith('.mkv'));
  t.truthy(videoFile, 'Expected a .mkv recording file');
  if (!videoFile) return;
  t.false(videoFile.includes(' '), `Recording filename should not contain spaces: "${videoFile}"`);
}

test('Recording without spaces', async t => {
  await logIn(t);
  try {
    // low resolution reduces CPU usage
    await setOutputResolution('100x100');

    const tmpDir = await setTemporaryRecordingPath(true);
    await createRecordingWithFormParms({ RecFormat: 'mkv' }, async () => {
      await clickCheckbox('RecFileNameWithoutSpace');
    });

    await validateTitleContainsNoSpaces(t, tmpDir);
  } finally {
    await logOut(t, true);
  }
});
