/**
 * DIAGNOSTIC — verifies the recording path survives real char-by-char typing
 * into the settings UI, in both simple and advanced mode.
 *
 * The Windows Server 2025 runner dropped the drive colon (`C:\` -> `C\`) because
 * the path field committed to OBS on every keystroke, racing the controlled value
 * back over the input. The fix (ObsForm: path/text inputs commit on blur) should
 * keep the typed value intact. These two tests type the path exactly like a user
 * and assert the field still holds the full path with its colon.
 *
 * Throwaway - delete before merge.
 */
import { test, useWebdriver } from '../helpers/webdriver';
import { setRecordingPathBuffered } from '../helpers/modules/settings/settings';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Recording path keeps drive colon - simple mode', async t => {
  const { dir, uiValue } = await setRecordingPathBuffered(100, false);
  t.is(uiValue, dir, `Simple recording path lost characters while typing. Got: "${uiValue}"`);
});

test('Recording path keeps drive colon - advanced mode', async t => {
  const { dir, uiValue } = await setRecordingPathBuffered(100, true);
  t.is(uiValue, dir, `Advanced recording path lost characters while typing. Got: "${uiValue}"`);
});
