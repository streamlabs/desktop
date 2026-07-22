import {
  click,
  clickButton,
  clickTab,
  focusChild,
  select,
  useChildWindow,
  useMainWindow,
} from '../core';
import { mkdtemp } from 'fs-extra';
import { tmpdir } from 'os';
import * as path from 'path';
import { setInputValue, setInputValueDirect } from '../forms/base';
import { useForm } from '../forms';
import { getApiClient } from '../../api-client';
import { SettingsService } from '../../../../app/services/settings';

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

/* ------------------------------------------------------------------------- *
 * Diagnostics for the dropped drive-colon on the Windows Server 2025 runner.
 * These setters reproduce the failing scenario (simple recording -> FilePath)
 * three different ways and log what the UI actually ends up with, so a CI run
 * tells us whether the colon survives. Revert this whole block before merge.
 * ------------------------------------------------------------------------- */

const SIMPLE_PATH_SELECTOR = 'input[data-name="FilePath"]';
const ADVANCED_PATH_SELECTOR = 'input[data-name="RecFilePath"]';

export interface IRecordingPathResult {
  /** The path we asked the app to use. */
  dir: string;
  /** What the settings input actually holds afterwards (null for the API setter). */
  uiValue: string | null;
}

async function makeRecordingDir(dir?: string): Promise<string> {
  return dir ?? (await mkdtemp(path.join(tmpdir(), 'slobs-recording-')));
}

function logPathResult(method: string, advanced: boolean, dir: string, uiValue: string | null) {
  console.log(
    `[recording-path-diag] method=${method} advanced=${advanced}\n` +
      `  requested: ${dir}\n` +
      `  readback:  ${uiValue}\n` +
      `  match:     ${uiValue === null ? 'n/a' : uiValue === dir}`,
  );
}

async function selectPathTab(advanced: boolean) {
  if (advanced) {
    // not a react hook
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { setDropdownInputValue } = useForm('Mode');
    await setDropdownInputValue('Mode', 'Advanced');
    await clickTab('Recording');
  }
}

/**
 * Char-by-char typing (current production behavior) with a configurable delay
 * between keystrokes. `bufferMs = 100` reproduces the bug; try larger values.
 */
export async function setRecordingPathBuffered(
  bufferMs: number,
  advanced = false,
  dir?: string,
): Promise<IRecordingPathResult> {
  const tmpDir = await makeRecordingDir(dir);
  const selector = advanced ? ADVANCED_PATH_SELECTOR : SIMPLE_PATH_SELECTOR;
  let uiValue = '';
  await showSettingsWindow('Output', async () => {
    await selectPathTab(advanced);
    await setInputValue(selector, tmpDir, bufferMs);
    uiValue = await (await select(selector)).getValue();
    logPathResult(`buffered(${bufferMs}ms)`, advanced, tmpDir, uiValue);
  });
  await clickButton('Close');
  return { dir: tmpDir, uiValue };
}

/**
 * Set the path in a single DOM operation, no per-key typing.
 */
export async function setRecordingPathDirect(
  advanced = false,
  dir?: string,
): Promise<IRecordingPathResult> {
  const tmpDir = await makeRecordingDir(dir);
  const selector = advanced ? ADVANCED_PATH_SELECTOR : SIMPLE_PATH_SELECTOR;
  let uiValue = '';
  await showSettingsWindow('Output', async () => {
    await selectPathTab(advanced);
    await setInputValueDirect(selector, tmpDir);
    uiValue = await (await select(selector)).getValue();
    logPathResult('direct-dom', advanced, tmpDir, uiValue);
  });
  await clickButton('Close');
  return { dir: tmpDir, uiValue };
}

/**
 * Set the path straight through the settings API, bypassing the UI entirely.
 * This is the shape of the likely permanent fix.
 */
export async function setRecordingPathViaApi(
  advanced = false,
  dir?: string,
): Promise<IRecordingPathResult> {
  const tmpDir = await makeRecordingDir(dir);
  const api = await getApiClient();
  const settingsService = api.getResource<SettingsService>('SettingsService');
  if (advanced) {
    await settingsService.setSettingValue('Output', 'Mode', 'Advanced');
  }
  await settingsService.setSettingValue('Output', advanced ? 'RecFilePath' : 'FilePath', tmpDir);
  logPathResult('api', advanced, tmpDir, null);
  return { dir: tmpDir, uiValue: null };
}
