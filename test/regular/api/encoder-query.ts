import { test, useWebdriver } from '../../helpers/webdriver';
import { getApiClient } from '../../helpers/api-client';
import { SettingsService } from '../../../app/services/settings';
import { EncoderQueryService } from '../../../app/services/settings/output/encoder-query';
import { StreamingService } from '../../../app/services/streaming';
import { ERecordingFormat } from '../../../obs-api';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver({ restartAppAfterEachTest: true });

/**
 * Verify that getAvailableRecordingEncoders always uses the requested format,
 * not the stale format cached on the live recording instance.
 *
 * Regression test for: changing recording format within the same mode having
 * no effect because the existing recording instance's format was never updated
 * before querying available encoders.
 */
test('getAvailableRecordingEncoders uses the requested format, not the stale instance format', async t => {
  const client = await getApiClient();
  const settingsService = client.getResource<SettingsService>('SettingsService');
  const encoderQueryService = client.getResource<EncoderQueryService>('EncoderQueryService');
  const streamingService = client.getResource<StreamingService>('StreamingService');

  // Use Simple mode so a recording instance is created
  settingsService.setSettingValue('Output', 'Mode', 'Simple');

  // Set the initial format to MOV, which supports h264, hevc, prores + PCM audio
  settingsService.setSettingValue('Output', 'RecFormat', 'mov');

  // Retrieve encoders for MOV — records baseline
  const movEncoders = encoderQueryService.getAvailableRecordingEncoders('Simple', ERecordingFormat.MOV);
  t.true(movEncoders.length > 0, 'MOV should have at least one available encoder');

  // Now query encoders for FLV without changing the RecFormat setting.
  // FLV only supports h264 and aac — hevc/prores encoders must not appear.
  const flvEncoders = encoderQueryService.getAvailableRecordingEncoders('Simple', ERecordingFormat.FLV);
  t.true(flvEncoders.length > 0, 'FLV should have at least one available encoder');

  const flvEncoderValues = flvEncoders.map(e => e.value);

  // Apple HEVC and prores encoders are valid for MOV but NOT for FLV.
  // If the instance format was not updated before querying, these would incorrectly appear.
  t.false(
    flvEncoderValues.some(v => v.toLowerCase().includes('hevc')),
    'HEVC encoders must not appear for FLV format',
  );
  t.false(
    flvEncoderValues.some(v => v.toLowerCase().includes('prores')),
    'ProRes encoders must not appear for FLV format',
  );

  // FLV must include at least one h264 encoder (x264 is always available)
  t.true(
    flvEncoderValues.some(v => v === 'obs_x264' || v === 'apple_h264'),
    'FLV must include an h264 encoder',
  );

  // Confirm the live recording instance's format was updated to FLV by the query.
  // This is the core of the fix: instance.format must reflect the last-queried format.
  const instance = streamingService.getRecordingInstance();
  t.truthy(instance, 'A recording instance should exist after querying encoders');
  t.is(
    (instance as any).format,
    ERecordingFormat.FLV,
    'The recording instance format must be updated to the last-queried format (FLV)',
  );
});

/**
 * Verify that switching format within the same mode (without a mode switch)
 * returns encoders appropriate for the new format.
 *
 * Regression test for: format appearing stuck after changing it in-session
 * because the encoder list was built against the old instance format.
 */
test('Available encoders update when format changes within the same mode', async t => {
  const client = await getApiClient();
  const settingsService = client.getResource<SettingsService>('SettingsService');
  const encoderQueryService = client.getResource<EncoderQueryService>('EncoderQueryService');

  settingsService.setSettingValue('Output', 'Mode', 'Advanced');
  settingsService.setSettingValue('Output', 'RecFormat', 'mov');

  // First query — MOV
  const movEncoders = encoderQueryService.getAvailableRecordingEncoders(
    'Advanced',
    ERecordingFormat.MOV,
  );
  const movValues = movEncoders.map(e => e.value);

  // Second query — MP4, same mode, no restart
  const mp4Encoders = encoderQueryService.getAvailableRecordingEncoders(
    'Advanced',
    ERecordingFormat.MP4,
  );
  const mp4Values = mp4Encoders.map(e => e.value);

  // MP4 supports AV1 encoders (e.g. obs_qsv11_av1, obs_nvenc_av1_tex) which MOV does not.
  // If available, they must appear for MP4 but not MOV.
  const av1InMov = movValues.some(v => v.toLowerCase().includes('av1'));
  const av1InMp4 = mp4Values.some(v => v.toLowerCase().includes('av1'));

  // AV1 encoders are machine-dependent; only assert the relationship when both lists are non-empty.
  if (av1InMp4) {
    t.false(av1InMov, 'AV1 encoders should appear for MP4 but not MOV (MOV does not support AV1)');
  }

  // At minimum, both formats must surface at least one encoder
  t.true(movEncoders.length > 0, 'MOV encoder list must not be empty');
  t.true(mp4Encoders.length > 0, 'MP4 encoder list must not be empty');

  // x264 is universally available and valid for both formats
  t.true(movValues.includes('obs_x264'), 'obs_x264 must be available for MOV');
  t.true(mp4Values.includes('obs_x264'), 'obs_x264 must be available for MP4');
});
