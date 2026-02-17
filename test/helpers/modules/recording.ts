import { TExecutionContext } from '../webdriver';
import { readdir } from 'fs-extra';
import { showPage } from './navigation';
import { waitForDisplayed, getNumElements, clickButton, focusMain } from './core';
import { sleep } from '../sleep';
import { useForm } from './forms';
import { showSettingsWindow } from './settings/settings';
import { startRecording, stopRecording } from './streaming';

/**
 * Confirm correct number of files were created and that they are displayed in the recording history.
 * @param t - AVA test context
 * @param tmpDir - temporary directory where recordings are saved
 * @param numFormats - number of formats used to record
 */
export async function validateRecordingFiles(
  t: TExecutionContext,
  tmpDir: string,
  numFormats: number,
  advanced: boolean = false,
  message?: string,
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
    message ?? 'All recordings show in history matches number of files recorded',
  );
}

export async function testRecordingQualities(
  t: TExecutionContext,
  tmpDir: string,
  selectiveRecording: boolean = false,
): Promise<number> {
  const qualities = [
    'Same as stream',
    'High Quality, Medium File Size',
    'Indistinguishable Quality, Large File Size',
    // Note: the ULH0 file format is not natively supported on Windows
    // TODO: Figure out why `Lossless` Quality not firing `Wrote` signal
    // 'Lossless Quality, Tremendously Large File Size',
  ];

  let numFiles = 0;

  for (const quality of qualities) {
    await showSettingsWindow('Output', async () => {
      const { setDropdownInputValue } = useForm('Recording');
      await setDropdownInputValue('RecQuality', quality);
      await clickButton('Close');
    });

    // Create recording
    await focusMain();
    await startRecording();
    await sleep(2000);
    await stopRecording();

    numFiles++;
    await validateRecordingFiles(
      t,
      tmpDir,
      numFiles,
      false,
      `${
        selectiveRecording ? 'Selective Recording' : 'Recording'
      } in Simple Mode with quality ${quality} creates expected recording file`,
    );
  }

  // Reset quality to default after test
  await showSettingsWindow('Output', async () => {
    const { setDropdownInputValue } = useForm('Recording');
    await setDropdownInputValue('RecQuality', 'Same as stream');
    await clickButton('Close');
  });

  return numFiles;
}
