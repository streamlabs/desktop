/**
 * DIAGNOSTIC SUITE — dropped drive-colon in the recording path.
 *
 * On the Windows Server 2025 Azure runner the recording path arrives at OBS as
 * `C\Users\...` (no drive colon), so recording fails with "Unable to write".
 * The path is typed into the settings input character-by-character; the second
 * character (the `:` in `C:\`) goes missing.
 *
 * Each test below sets the path a different way and asserts the value the UI
 * ends up with still contains the colon:
 *   1. buffered 100ms  - current production behavior (expected to REPRODUCE the bug)
 *   2. buffered 500ms  - same typing, slower - does more delay hide the race?
 *   3. direct DOM set  - one-shot value set, no typing at all
 *   4. API set         - bypasses the UI entirely (shape of the likely real fix)
 *
 * Tests 3 and 4 also record a short clip to prove OBS accepts the path end-to-end.
 * This whole file is throwaway - delete it before merge.
 */
import { readdir } from 'fs-extra';
import { test, TExecutionContext, useWebdriver } from '../helpers/webdriver';
import { sleep } from '../helpers/sleep';
import { startRecording, stopRecording } from '../helpers/modules/streaming';
import {
  setOutputResolution,
  setRecordingPathBuffered,
  setRecordingPathDirect,
  setRecordingPathViaApi,
} from '../helpers/modules/settings/settings';
import { focusMain } from '../helpers/modules/core';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

/**
 * Record a short clip and return the files that landed in the target directory.
 * Tolerates a failed start so a bad path surfaces as "no files" rather than a hang.
 */
async function recordShortClip(tmpDir: string): Promise<string[]> {
  try {
    await focusMain();
    await startRecording();
    await sleep(1500);
    await stopRecording();
    await sleep(2000);
  } catch (e: unknown) {
    console.log(`[recording-path-diag] recording failed to complete: ${String(e)}`);
  }
  try {
    return await readdir(tmpDir);
  } catch {
    return [];
  }
}

test('Recording path - buffered 100ms (baseline repro)', async t => {
  const { dir, uiValue } = await setRecordingPathBuffered(100);
  t.is(uiValue, dir, `Simple recording path lost characters while typing. Got: "${uiValue}"`);
});

test('Recording path - buffered 500ms', async t => {
  const { dir, uiValue } = await setRecordingPathBuffered(500);
  t.is(uiValue, dir, `Simple recording path lost characters while typing. Got: "${uiValue}"`);
});

test('Recording path - direct DOM set (no typing)', async t => {
  await setOutputResolution('100x100');

  const { dir, uiValue } = await setRecordingPathDirect();
  t.is(uiValue, dir, `Direct-set path did not match. Got: "${uiValue}"`);

  const files = await recordShortClip(dir);
  t.true(files.length >= 1, `Expected a recording file in ${dir}. Files:\n${files.join('\n')}`);
});

test('Recording path - via settings API (no UI)', async t => {
  await setOutputResolution('100x100');

  const { dir } = await setRecordingPathViaApi();

  const files = await recordShortClip(dir);
  t.true(files.length >= 1, `Expected a recording file in ${dir}. Files:\n${files.join('\n')}`);
});
