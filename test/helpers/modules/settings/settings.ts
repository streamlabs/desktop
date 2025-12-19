import { click, clickButton, clickTab, focusChild, useChildWindow, useMainWindow } from '../core';
import { mkdtemp } from 'fs-extra';
import { tmpdir } from 'os';
import * as path from 'path';
import { setInputValue } from '../forms/base';
import { useForm } from '../forms';

/**
 * Open the settings window with a given category selected
 * If callback provided then focus the child window and execute the callback
 */
export async function showSettingsWindow(category: string, cb?: () => Promise<unknown>) {
  // not a react hook
  // eslint-disable-next-line react-hooks/rules-of-hooks
  await useMainWindow(async () => {
    await click('.side-nav .icon-settings');

    if (category) {
      await focusChild();
      await click(`[data-name="settings-nav-item"]=${category}`);
    }
  });

  if (cb) {
    // not a react hook
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await useChildWindow(cb);
  }
}

/**
 * Set recording path to a temp dir
 * @remark Currently, only advanced recording paths should be set
 */
export async function setTemporaryRecordingPath(
  advanced: boolean = false,
  dir?: string,
): Promise<string> {
  const tmpDir = dir ?? (await mkdtemp(path.join(tmpdir(), 'slobs-recording-')));

  if (advanced) {
    await showSettingsWindow('Output', async () => {
      const { setDropdownInputValue } = useForm('Mode');
      await setDropdownInputValue('Mode', 'Advanced');
      await clickTab('Recording');
      await setInputValue('input[data-name="RecFilePath"]', tmpDir, true);
    });
  } else {
    await showSettingsWindow('Output', async () => {
      await setInputValue('input[data-name="FilePath"]', tmpDir, true);
    });
  }

  await clickButton('Close');
  return tmpDir;
}

/**
 * Set output resolution
 * It's recommended to set low resolution for streaming and recording tests
 * to prevent high CPU usage
 */
export async function setOutputResolution(resolution: string) {
  const [width, height] = resolution.split('x');
  await showSettingsWindow('Video', async () => {
    await setInputValue('[data-name="outputRes"]', `${width}x${height}`);
    await clickButton('Close');
  });
}
