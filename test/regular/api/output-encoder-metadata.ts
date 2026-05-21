import type { ExecutionContext } from 'ava';
import { test, useWebdriver } from '../../helpers/webdriver';
import { getApiClient } from '../../helpers/api-client';
import {
  EncoderQueryService,
  OutputSettingsService,
  SettingsService,
} from '../../../app/services/settings';
import {
  legacyEncoderAliasToObsEncoderIdOrSelf,
  resolveAvailableEncoderOptionValue,
} from '../../../app/services/settings/output/encoder-compatibility';
import { ERecordingFormat } from '../../../obs-api';
import type { IEncoderOption } from 'obs-studio-node';
import type { TOutputSettingsMode } from '../../../app/services/settings';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver({ restartAppAfterEachTest: true });

function assertEncoderMetadata(t: ExecutionContext, encoder: IEncoderOption) {
  t.truthy(encoder.name, 'encoder name should be non-empty');
  t.truthy(encoder.id, `${encoder.name} should expose a concrete encoder id`);
  t.truthy(encoder.family, `${encoder.name} should expose a Desktop encoder family`);
  t.truthy(encoder.preset, `${encoder.name} should expose a preset field`);
  t.truthy(encoder.codec, `${encoder.name} should expose codec metadata`);
  t.false(
    encoder.family.startsWith('family_'),
    `${encoder.name} should expose public Desktop metadata, not backend family constants`,
  );
}

function requireEncoder(
  t: ExecutionContext,
  encoders: IEncoderOption[],
  predicate: (encoder: IEncoderOption) => boolean,
  message: string,
) {
  const encoder = encoders.find(predicate);
  if (!encoder) {
    t.fail(message);
    throw new Error(message);
  }

  return encoder;
}

function requireFirstEncoder(t: ExecutionContext, encoders: IEncoderOption[], message: string) {
  const encoder = encoders[0];
  if (!encoder) {
    t.fail(message);
    throw new Error(message);
  }

  return encoder;
}

function getFirstSettingOptionValue(
  t: ExecutionContext,
  settingsService: SettingsService,
  subCategoryName: string,
  settingName: string,
) {
  const setting = settingsService.findSetting(
    settingsService.state.Output.formData,
    subCategoryName,
    settingName,
  );
  const value = setting?.options?.[0]?.value ?? setting?.value;

  if (value == null) {
    const message = `Expected Output.${subCategoryName}.${settingName} to have a value`;
    t.fail(message);
    throw new Error(message);
  }

  return value;
}

test('legacy QSV v1 encoder id migrates to backend advertised QSV v2 id', t => {
  t.is(legacyEncoderAliasToObsEncoderIdOrSelf('obs_qsv11'), 'obs_qsv11_v2');
});

test('legacy encoder ids match canonical encoder option values', t => {
  const encoderOptions = [
    { description: 'Software (x264)', value: 'obs_x264' },
    { description: 'AMD HW H.264', value: 'h264_texture_amf' },
    { description: 'QuickSync H.264', value: 'obs_qsv11_v2' },
  ];

  t.is(resolveAvailableEncoderOptionValue(encoderOptions, 'amd_amf_h264'), 'h264_texture_amf');
  t.is(resolveAvailableEncoderOptionValue(encoderOptions, 'obs_qsv11'), 'obs_qsv11_v2');
  t.is(resolveAvailableEncoderOptionValue(encoderOptions, 'h264_texture_amf'), 'h264_texture_amf');
  t.is(resolveAvailableEncoderOptionValue(encoderOptions, 'missing_encoder'), undefined);
});

test('backend-advertised streaming encoders resolve to Desktop metadata', async t => {
  const client = await getApiClient();
  const encoderQueryService = client.getResource<EncoderQueryService>('EncoderQueryService');

  (['Simple', 'Advanced'] as TOutputSettingsMode[]).forEach(mode => {
    const encoders = encoderQueryService.getAvailableStreamingEncoderMetadata(mode);

    t.true(encoders.length > 0, `${mode} streaming encoders should be available`);

    encoders.forEach(encoder => {
      assertEncoderMetadata(t, encoder);
      t.is(
        encoderQueryService.resolveStreamingEncoderId(mode, encoder.name),
        encoder.id,
        `${mode} streaming encoder ${encoder.name} should resolve to backend id ${encoder.id}`,
      );
      t.is(
        encoderQueryService.resolveStreamingEncoderFamily(mode, encoder.name),
        encoder.family,
        `${mode} streaming encoder ${encoder.name} should resolve to backend family ${encoder.family}`,
      );
      t.is(
        encoderQueryService.resolveStreamingEncoderPreset(mode, encoder.name),
        encoder.preset,
        `${mode} streaming encoder ${encoder.name} should resolve to backend preset ${encoder.preset}`,
      );
    });
  });
});

test('backend-advertised recording encoders resolve to Desktop metadata', async t => {
  const client = await getApiClient();
  const encoderQueryService = client.getResource<EncoderQueryService>('EncoderQueryService');

  (['Simple', 'Advanced'] as TOutputSettingsMode[]).forEach(mode => {
    const encoders = encoderQueryService.getAvailableRecordingEncoderMetadata(
      mode,
      ERecordingFormat.MKV,
    );

    t.true(encoders.length > 0, `${mode} recording encoders should be available`);

    encoders.forEach(encoder => {
      assertEncoderMetadata(t, encoder);
      t.is(
        encoderQueryService.resolveRecordingEncoderId(mode, ERecordingFormat.MKV, encoder.name),
        encoder.id,
        `${mode} recording encoder ${encoder.name} should resolve to backend id ${encoder.id}`,
      );
      t.is(
        encoderQueryService.resolveRecordingEncoderFamily(
          mode,
          ERecordingFormat.MKV,
          encoder.name,
        ),
        encoder.family,
        `${mode} recording encoder ${encoder.name} should resolve to backend family ${encoder.family}`,
      );
    });
  });
});

test('output streaming settings use backend encoder metadata', async t => {
  const client = await getApiClient();
  const encoderQueryService = client.getResource<EncoderQueryService>('EncoderQueryService');
  const outputSettingsService = client.getResource<OutputSettingsService>('OutputSettingsService');
  const settingsService = client.getResource<SettingsService>('SettingsService');

  settingsService.setSettingValue('Output', 'Mode', 'Simple');

  const simpleEncoders = encoderQueryService.getAvailableStreamingEncoderMetadata('Simple');
  const simpleEncoder = requireEncoder(
    t,
    simpleEncoders,
    encoder => encoder.id !== encoder.name,
    'Expected at least one simple streaming encoder whose backend id differs from its settings value',
  );

  settingsService.setSettingValue('Output', 'StreamEncoder', simpleEncoder.name);

  const simpleStreamingSettings = outputSettingsService.getStreamingSettings('horizontal');

  t.is(
    simpleStreamingSettings.videoEncoder,
    simpleEncoder.id,
    `${simpleEncoder.name} should be passed to OBS as ${simpleEncoder.id}`,
  );

  settingsService.setSettingValue('Output', 'Mode', 'Advanced');

  const advancedEncoders = encoderQueryService.getAvailableStreamingEncoderMetadata('Advanced');
  const advancedEncoder = requireEncoder(
    t,
    advancedEncoders,
    encoder => Boolean(encoder.family && encoder.preset),
    'Expected at least one advanced streaming encoder with family and preset metadata',
  );

  settingsService.setSettingValue('Output', 'Encoder', advancedEncoder.name);

  const presetValue = getFirstSettingOptionValue(
    t,
    settingsService,
    'Streaming',
    advancedEncoder.preset,
  );

  settingsService.setSettingValue('Output', advancedEncoder.preset, presetValue);

  const streamingSettings = outputSettingsService.getSettings().streaming;

  t.is(
    streamingSettings.encoder,
    advancedEncoder.family,
    `${advancedEncoder.name} should use backend family metadata`,
  );
  t.is(
    streamingSettings.preset,
    presetValue,
    `${advancedEncoder.name} should read preset from backend preset metadata field`,
  );
});

test('legacy advanced streaming encoder ids resolve to backend metadata', async t => {
  const client = await getApiClient();
  const encoderQueryService = client.getResource<EncoderQueryService>('EncoderQueryService');
  const outputSettingsService = client.getResource<OutputSettingsService>('OutputSettingsService');
  const settingsService = client.getResource<SettingsService>('SettingsService');

  const x264Encoder = requireEncoder(
    t,
    encoderQueryService.getAvailableStreamingEncoderMetadata('Advanced'),
    encoder => encoder.id === 'obs_x264',
    'Expected advanced streaming encoders to include software x264',
  );

  settingsService.setSettingValue('Output', 'Mode', 'Advanced');
  settingsService.setSettingValue('Output', 'Encoder', 'x264');
  settingsService.loadSettingsIntoStore();

  const x264StreamingSettings = outputSettingsService.getSettings().streaming;

  t.is(
    settingsService.findSettingValue(
      settingsService.state.Output.formData,
      'Streaming',
      'Encoder',
    ),
    x264Encoder.name,
    'settings load should canonicalize legacy x264 alias to the backend encoder option value',
  );
  t.is(
    x264StreamingSettings.encoder,
    x264Encoder.family,
    'legacy x264 alias should resolve to migrated backend family metadata',
  );
  t.is(
    x264StreamingSettings.codec,
    x264Encoder.codec,
    'legacy x264 alias should resolve to migrated backend codec metadata',
  );

  const migratedEncoder = encoderQueryService
    .getAvailableStreamingEncoderMetadata('Advanced')
    .find(encoder => encoder.id === 'h264_texture_amf');

  if (!migratedEncoder) {
    t.pass('AMD texture encoder is not available in this test environment');
    return;
  }

  settingsService.setSettingValue('Output', 'Mode', 'Advanced');
  settingsService.setSettingValue('Output', 'Encoder', 'amd_amf_h264');
  settingsService.loadSettingsIntoStore();

  const streamingSettings = outputSettingsService.getSettings().streaming;

  t.is(
    settingsService.findSettingValue(
      settingsService.state.Output.formData,
      'Streaming',
      'Encoder',
    ),
    migratedEncoder.name,
    'settings load should canonicalize legacy AMD encoder id to the backend encoder option value',
  );
  t.is(
    streamingSettings.encoder,
    migratedEncoder.family,
    'legacy AMD advanced encoder id should resolve to migrated backend family metadata',
  );
  t.is(
    streamingSettings.codec,
    migratedEncoder.codec,
    'legacy AMD advanced encoder id should resolve to migrated backend codec metadata',
  );

  const qsvEncoder = encoderQueryService
    .getAvailableStreamingEncoderMetadata('Advanced')
    .find(encoder => encoder.id === 'obs_qsv11_v2');

  if (!qsvEncoder) {
    t.pass('QSV v2 encoder is not available in this test environment');
    return;
  }

  settingsService.setSettingValue('Output', 'Mode', 'Advanced');
  settingsService.setSettingValue('Output', 'Encoder', 'obs_qsv11');
  settingsService.loadSettingsIntoStore();

  const qsvStreamingSettings = outputSettingsService.getSettings().streaming;

  t.is(
    settingsService.findSettingValue(
      settingsService.state.Output.formData,
      'Streaming',
      'Encoder',
    ),
    qsvEncoder.name,
    'settings load should canonicalize legacy QSV encoder id to the backend encoder option value',
  );
  t.is(
    qsvStreamingSettings.encoder,
    qsvEncoder.family,
    'legacy QSV v1 advanced encoder id should resolve to migrated backend family metadata',
  );
  t.is(
    qsvStreamingSettings.codec,
    qsvEncoder.codec,
    'legacy QSV v1 advanced encoder id should resolve to migrated backend codec metadata',
  );
});

test('legacy advanced recording encoder ids resolve to backend metadata', async t => {
  const client = await getApiClient();
  const encoderQueryService = client.getResource<EncoderQueryService>('EncoderQueryService');
  const outputSettingsService = client.getResource<OutputSettingsService>('OutputSettingsService');
  const settingsService = client.getResource<SettingsService>('SettingsService');

  const streamingX264Encoder = requireEncoder(
    t,
    encoderQueryService.getAvailableStreamingEncoderMetadata('Advanced'),
    encoder => encoder.id === 'obs_x264',
    'Expected advanced streaming encoders to include software x264',
  );
  const recordingEncoders = encoderQueryService.getAvailableRecordingEncoderMetadata(
    'Advanced',
    ERecordingFormat.MKV,
  );
  const recordingX264Encoder = requireEncoder(
    t,
    recordingEncoders,
    encoder => encoder.id === 'obs_x264',
    'Expected advanced recording encoders to include software x264',
  );

  settingsService.setSettingValue('Output', 'Mode', 'Advanced');
  settingsService.setSettingValue('Output', 'RecFormat', ERecordingFormat.MKV);
  settingsService.setSettingValue('Output', 'Encoder', streamingX264Encoder.name);
  settingsService.setSettingValue('Output', 'RecEncoder', 'x264');
  settingsService.loadSettingsIntoStore();

  const x264RecordingSettings = outputSettingsService.getSettings().recording;

  t.is(
    settingsService.findSettingValue(
      settingsService.state.Output.formData,
      'Recording',
      'RecEncoder',
    ),
    recordingX264Encoder.name,
    'settings load should canonicalize legacy x264 recording alias to the backend encoder option value',
  );
  t.is(
    x264RecordingSettings.encoder,
    recordingX264Encoder.family,
    'legacy x264 alias should resolve to migrated recording family metadata',
  );
  t.is(
    x264RecordingSettings.codec,
    recordingX264Encoder.codec,
    'legacy x264 alias should resolve to migrated recording codec metadata',
  );

  const migratedEncoder = recordingEncoders.find(encoder => encoder.id === 'h264_texture_amf');

  if (!migratedEncoder) {
    t.pass('AMD texture encoder is not available in this test environment');
    return;
  }

  settingsService.setSettingValue('Output', 'RecEncoder', 'amd_amf_h264');
  settingsService.loadSettingsIntoStore();

  const recordingSettings = outputSettingsService.getSettings().recording;

  t.is(
    settingsService.findSettingValue(
      settingsService.state.Output.formData,
      'Recording',
      'RecEncoder',
    ),
    migratedEncoder.name,
    'settings load should canonicalize legacy AMD recording encoder id to the backend encoder option value',
  );
  t.is(
    recordingSettings.encoder,
    migratedEncoder.family,
    'legacy AMD advanced encoder id should resolve to migrated recording family metadata',
  );
  t.is(
    recordingSettings.codec,
    migratedEncoder.codec,
    'legacy AMD advanced encoder id should resolve to migrated recording codec metadata',
  );

  const qsvEncoder = recordingEncoders.find(encoder => encoder.id === 'obs_qsv11_v2');

  if (!qsvEncoder) {
    t.pass('QSV v2 encoder is not available in this test environment');
    return;
  }

  settingsService.setSettingValue('Output', 'RecEncoder', 'obs_qsv11');
  settingsService.loadSettingsIntoStore();

  const qsvRecordingSettings = outputSettingsService.getSettings().recording;

  t.is(
    settingsService.findSettingValue(
      settingsService.state.Output.formData,
      'Recording',
      'RecEncoder',
    ),
    qsvEncoder.name,
    'settings load should canonicalize legacy QSV recording encoder id to the backend encoder option value',
  );
  t.is(
    qsvRecordingSettings.encoder,
    qsvEncoder.family,
    'legacy QSV v1 advanced encoder id should resolve to migrated recording family metadata',
  );
  t.is(
    qsvRecordingSettings.codec,
    qsvEncoder.codec,
    'legacy QSV v1 advanced encoder id should resolve to migrated recording codec metadata',
  );
});

test('recording use stream encoder selection remains valid during encoder validation', async t => {
  const client = await getApiClient();
  const encoderQueryService = client.getResource<EncoderQueryService>('EncoderQueryService');
  const outputSettingsService = client.getResource<OutputSettingsService>('OutputSettingsService');
  const settingsService = client.getResource<SettingsService>('SettingsService');

  const streamingEncoder = requireFirstEncoder(
    t,
    encoderQueryService.getAvailableStreamingEncoderMetadata('Advanced'),
    'Expected at least one advanced streaming encoder',
  );

  settingsService.setSettingValue('Output', 'Mode', 'Advanced');
  settingsService.setSettingValue('Output', 'RecFormat', ERecordingFormat.MKV);
  settingsService.setSettingValue('Output', 'Encoder', streamingEncoder.name);
  settingsService.setSettingValue('Output', 'RecEncoder', 'none');
  settingsService.loadSettingsIntoStore();

  t.is(
    settingsService.findSettingValue(
      settingsService.state.Output.formData,
      'Recording',
      'RecEncoder',
    ),
    'none',
    'settings load should preserve the recording use-stream-encoder option',
  );

  settingsService.validateEncoders();

  t.is(
    settingsService.findSettingValue(
      settingsService.state.Output.formData,
      'Recording',
      'RecEncoder',
    ),
    'none',
    'recording encoder validation should preserve the use-stream-encoder option',
  );

  t.true(
    outputSettingsService.getSettings().recording.isSameAsStream,
    'output settings should continue treating RecEncoder=none as use stream encoder',
  );
});

test('output recording settings use backend encoder metadata', async t => {
  const client = await getApiClient();
  const encoderQueryService = client.getResource<EncoderQueryService>('EncoderQueryService');
  const outputSettingsService = client.getResource<OutputSettingsService>('OutputSettingsService');
  const settingsService = client.getResource<SettingsService>('SettingsService');

  settingsService.setSettingValue('Output', 'Mode', 'Advanced');
  settingsService.setSettingValue('Output', 'RecFormat', ERecordingFormat.MKV);

  const streamingEncoder = requireFirstEncoder(
    t,
    encoderQueryService.getAvailableStreamingEncoderMetadata('Advanced'),
    'Expected at least one advanced streaming encoder',
  );
  const encoders = encoderQueryService.getAvailableRecordingEncoderMetadata(
    'Advanced',
    ERecordingFormat.MKV,
  );
  const encoder = requireFirstEncoder(
    t,
    encoders,
    'Expected at least one advanced recording encoder',
  );

  settingsService.setSettingValue('Output', 'Encoder', streamingEncoder.name);
  settingsService.setSettingValue('Output', 'RecEncoder', encoder.name);

  const recordingSettings = outputSettingsService.getRecordingSettings('horizontal');
  const outputSettings = outputSettingsService.getSettings();

  t.is(
    recordingSettings.videoEncoder,
    encoder.id,
    `${encoder.name} should be passed to OBS as ${encoder.id}`,
  );
  t.is(
    outputSettings.recording.encoder,
    encoder.family,
    `${encoder.name} should use backend family metadata`,
  );
});
