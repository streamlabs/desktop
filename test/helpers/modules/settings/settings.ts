import {
  click,
  clickButton,
  clickTab,
  focusChild,
  getClient,
  useChildWindow,
  useMainWindow,
} from '../core';
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
    await click('[data-testid="nav-settings"]');

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

/** Remove destinations one at a time after the worker's update reaches the list. */
export async function removeCustomDestinations() {
  const client = getClient();
  let remaining = (await client.$$('i.fa-trash')).length;
  while (remaining > 0) {
    await click('i.fa-trash');
    remaining--;
    await client.waitUntil(async () => (await client.$$('i.fa-trash')).length === remaining, {
      timeout: 10000,
      timeoutMsg: 'The custom destination list did not update after removal',
    });
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
