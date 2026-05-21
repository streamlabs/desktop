import type { ExecutionContext } from 'ava';
import { test, useWebdriver } from '../../helpers/webdriver';
import { getApiClient } from '../../helpers/api-client';
import {
  EncoderQueryService,
  OutputSettingsService,
  SettingsService,
} from '../../../app/services/settings';
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
