import test from 'ava';
import {
  encoderNativePresetField,
  encoderPresetField,
  encoderPresetFromSettingsValue,
  encoderRuntimePresetSettings,
  encoderPresetToSettingsValue,
  encoderSettingsValueToFamily,
  encoderIdToSettingsValue,
  encoderSettingsValueToId,
} from '../../app/services/settings/output/encoder-settings-policy';

const cases = [
  ['obs_x264', 'x264'],
  ['obs_qsv11_v2', 'qsv'],
  ['h264_texture_amf', 'amd'],
  ['obs_nvenc_h264_tex', 'obs_nvenc_h264_tex'],
  ['com.apple.videotoolbox.videoencoder.ave.avc', 'apple_h264'],
  [
    'com.apple.videotoolbox.videoencoder.h264.gva',
    'com.apple.videotoolbox.videoencoder.h264.gva',
  ],
] as const;

test('tested concrete IDs round-trip through Simple output setting aliases', t => {
  cases.forEach(([id, setting]) => {
    t.is(encoderIdToSettingsValue(id, 'Simple'), setting);
    t.is(encoderSettingsValueToId(setting, 'Simple'), id);
  });
});

test('Advanced output stores tested concrete IDs directly', t => {
  cases.forEach(([id]) => {
    t.is(encoderIdToSettingsValue(id, 'Advanced'), id);
    t.is(encoderSettingsValueToId(id, 'Advanced'), id);
  });
});

test('Simple aliases resolve to the exact tested encoder family', t => {
  t.is(encoderSettingsValueToFamily('apple_h264'), 'apple');
  t.is(encoderSettingsValueToFamily('nvenc'), 'obs_nvenc_h264_tex');
  t.is(encoderSettingsValueToFamily('qsv'), 'qsv');
  t.is(encoderSettingsValueToFamily('amd'), 'amd');
  t.is(encoderSettingsValueToFamily('x264'), 'x264');
});

test('tested encoders use mode-specific preset fields', t => {
  t.is(encoderPresetField('obs_nvenc_h264_tex', 'Simple'), 'NVENCPreset2');
  t.is(encoderPresetField('obs_nvenc_h264_tex', 'Advanced'), 'preset');
  t.is(encoderPresetField('obs_qsv11_v2', 'Simple'), 'QSVPreset');
  t.is(encoderPresetField('obs_qsv11_v2', 'Advanced'), 'target_usage');
  t.is(encoderPresetField('h264_texture_amf', 'Simple'), 'AMDPreset');
  t.is(encoderPresetField('h264_texture_amf', 'Advanced'), 'preset');
  t.is(
    encoderPresetField('com.apple.videotoolbox.videoencoder.h264.gva', 'Simple'),
    'Profile',
  );
  t.is(
    encoderPresetField('com.apple.videotoolbox.videoencoder.h264.gva', 'Advanced'),
    'profile',
  );
  t.is(encoderPresetField('obs_x264', 'Simple'), 'Preset');
  t.is(encoderPresetField('obs_x264', 'Advanced'), 'preset');
  t.is(encoderNativePresetField('obs_nvenc_h264_tex'), 'preset');
  t.is(encoderNativePresetField('obs_qsv11_v2'), 'target_usage');
  t.is(encoderNativePresetField('h264_texture_amf'), 'preset');
  t.is(encoderNativePresetField('com.apple.videotoolbox.videoencoder.h264.gva'), 'profile');
});

test('QSV native target usage round-trips through Simple preset aliases', t => {
  t.is(encoderPresetToSettingsValue('obs_qsv11_v2', 'Simple', 'TU1'), 'quality');
  t.is(encoderPresetToSettingsValue('obs_qsv11_v2', 'Simple', 'TU4'), 'balanced');
  t.is(encoderPresetToSettingsValue('obs_qsv11_v2', 'Simple', 'TU7'), 'speed');
  t.is(encoderPresetFromSettingsValue('obs_qsv11_v2', 'Simple', 'balanced'), 'TU4');
  t.is(encoderPresetToSettingsValue('obs_qsv11_v2', 'Advanced', 'TU4'), 'TU4');
  t.is(encoderPresetFromSettingsValue('obs_qsv11_v2', 'Advanced', 'TU4'), 'TU4');
});

test('non-QSV tested presets remain exact in both modes', t => {
  const presets = [
    ['obs_nvenc_h264_tex', 'p5'],
    ['h264_texture_amf', 'quality'],
    ['com.apple.videotoolbox.videoencoder.ave.avc', 'high'],
    ['obs_x264', 'veryfast'],
  ] as const;
  presets.forEach(([encoderId, preset]) => {
    t.is(encoderPresetToSettingsValue(encoderId, 'Simple', preset), preset);
    t.is(encoderPresetFromSettingsValue(encoderId, 'Simple', preset), preset);
    t.is(encoderPresetToSettingsValue(encoderId, 'Advanced', preset), preset);
    t.is(encoderPresetFromSettingsValue(encoderId, 'Advanced', preset), preset);
  });
});

test('Factory encoder settings receive the exact tested Simple preset property', t => {
  t.deepEqual(
    encoderRuntimePresetSettings('obs_qsv11_v2', 'Simple', 'balanced', true),
    { target_usage: 'TU4' },
  );
  t.deepEqual(
    encoderRuntimePresetSettings('obs_nvenc_h264_tex', 'Simple', 'p5', true),
    { preset: 'p5' },
  );
  t.deepEqual(
    encoderRuntimePresetSettings('h264_texture_amf', 'Simple', 'quality', true),
    { preset: 'quality' },
  );
  t.deepEqual(
    encoderRuntimePresetSettings('obs_x264', 'Simple', 'veryfast', true),
    { preset: 'veryfast' },
  );
});

test('Simple output preserves normal UseAdvanced and Apple Profile semantics', t => {
  t.deepEqual(
    encoderRuntimePresetSettings('obs_x264', 'Simple', 'slow', false),
    {},
  );
  t.deepEqual(
    encoderRuntimePresetSettings(
      'com.apple.videotoolbox.videoencoder.h264.gva',
      'Simple',
      'high',
      false,
    ),
    { profile: 'high' },
  );
});

test('Factory encoder settings receive the tested Advanced preset property', t => {
  t.deepEqual(
    encoderRuntimePresetSettings('h264_texture_amf', 'Advanced', 'quality', false),
    { preset: 'quality' },
  );
});
