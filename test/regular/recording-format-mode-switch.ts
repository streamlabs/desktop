/**
 * Regression test for: recording format not updating when changed within the same mode.
 *
 * Repro steps:
 *   1. Start in simple mode, set format to MOV
 *   2. Switch to advanced — record (expect MOV file)
 *   3. Change format to MP4 (stay in advanced) — record (was incorrectly producing MOV)
 *   4. Switch to simple — record (expect MP4 file)
 */

import * as path from 'path';
import { readdir } from 'fs-extra';
import { test, useWebdriver } from '../helpers/webdriver';
import { sleep } from '../helpers/sleep';
import { showSettingsWindow, setTemporaryRecordingPath, setOutputResolution } from '../helpers/modules/settings/settings';
import { startRecording, stopRecording } from '../helpers/modules/streaming';
import { clickButton, clickTab, focusMain, clickWhenDisplayed } from '../helpers/modules/core';
import { useForm } from '../helpers/modules/forms';
import { showPage } from '../helpers/modules/navigation';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

/**
 * Record a short clip and wait for the completion notification.
 * Returns after dismissing the notification so the caller can inspect files.
 */
async function recordClip(durationMs = 1500) {
  await focusMain();
  await startRecording();
  await sleep(durationMs);
  await stopRecording();
  // Wait for the "recording completed" toast and dismiss it so it doesn't
  // interfere with subsequent interactions.
  await clickWhenDisplayed('span=A new Recording has been completed. Click for more info');
  // Navigate back to the editor so subsequent showSettingsWindow calls work cleanly
  await showPage('Editor');
}

/**
 * Return files in tmpDir sorted by modification time (oldest first).
 */
async function listRecordings(tmpDir: string): Promise<string[]> {
  return readdir(tmpDir);
}

test('Recording format updates correctly when changed within and across modes', async t => {
  await setOutputResolution('100x100');
  const tmpDir = await setTemporaryRecordingPath();

  // ─── Step 1: Simple mode, set format to MOV ───────────────────────────────
  await showSettingsWindow('Output', async () => {
    const { setDropdownInputValue } = useForm('Mode');
    await setDropdownInputValue('Mode', 'Simple');

    const { setDropdownInputValue: setRecFormat } = useForm('Recording');
    await setRecFormat('RecFormat', 'mov');
    await clickButton('Close');
  });

  // ─── Step 2: Switch to Advanced, record — expect MOV ──────────────────────
  await showSettingsWindow('Output', async () => {
    const { setDropdownInputValue } = useForm('Mode');
    await setDropdownInputValue('Mode', 'Advanced');
    await clickTab('Recording');
    await setTemporaryRecordingPath(true, tmpDir);
    await clickButton('Close');
  });

  await recordClip();

  const filesAfterStep2 = await listRecordings(tmpDir);
  t.is(filesAfterStep2.length, 1, 'One recording should exist after step 2');
  t.true(
    filesAfterStep2[0].endsWith('.mov'),
    `Step 2: expected a .mov file, got: ${filesAfterStep2[0]}`,
  );

  // ─── Step 3: Change format to MP4 (stay in Advanced), record — expect MP4 ─
  await showSettingsWindow('Output', async () => {
    await clickTab('Recording');
    const { setDropdownInputValue } = useForm('Recording');
    await setDropdownInputValue('RecFormat', 'mp4');
    await clickButton('Close');
  });

  await recordClip();

  const filesAfterStep3 = await listRecordings(tmpDir);
  t.is(filesAfterStep3.length, 2, 'Two recordings should exist after step 3');

  const step3File = filesAfterStep3.find(f => f !== filesAfterStep2[0]);
  t.truthy(step3File, 'A new file should have been created in step 3');
  t.true(
    step3File!.endsWith('.mp4'),
    `Step 3: expected a .mp4 file but got: ${step3File} — format was not applied when changed within Advanced mode`,
  );

  // ─── Step 4: Switch to Simple, record — expect MP4 ────────────────────────
  await showSettingsWindow('Output', async () => {
    const { setDropdownInputValue } = useForm('Mode');
    await setDropdownInputValue('Mode', 'Simple');
    await clickButton('Close');
  });

  await recordClip();

  const filesAfterStep4 = await listRecordings(tmpDir);
  t.is(filesAfterStep4.length, 3, 'Three recordings should exist after step 4');

  const step4File = filesAfterStep4.find(f => !filesAfterStep3.includes(f));
  t.truthy(step4File, 'A new file should have been created in step 4');
  t.true(
    step4File!.endsWith('.mp4'),
    `Step 4: expected a .mp4 file but got: ${step4File}`,
  );

  t.pass();
});
