import test from 'ava';
import {
  buildAutoOptimizerVideoSettingsPatches,
  captureRawOutputValues,
  outputTransactionValuesMatch,
  rawOutputValuesMatch,
  shouldApplyAutoOptimizerVideoSettings,
  shouldCaptureTargetPresetForRollback,
  selectAutoOptimizerStandardOutputRecommendation,
} from '../../app/services/auto-config/output-transaction-policy';
import { IAutoOptimizerOutputResult } from '../../app/services/auto-config/types';

function outputForm(preset = 'veryfast', bitrate = 6000) {
  return [
    {
      nameSubCategory: 'Untitled',
      parameters: [{ name: 'Mode', value: 'Simple' }],
    },
    {
      nameSubCategory: 'Streaming',
      parameters: [
        { name: 'StreamEncoder', value: 'x264' },
        { name: 'Preset', value: preset },
        { name: 'VBitrate', value: bitrate },
      ],
    },
  ];
}

test('raw Output snapshots compare every active field', t => {
  const expected = captureRawOutputValues(outputForm());
  t.true(rawOutputValuesMatch(expected, outputForm()));
  t.false(rawOutputValuesMatch(expected, outputForm('faster')));
  t.false(rawOutputValuesMatch(expected, outputForm('veryfast', 4500)));
});

test('Simple rollback verification includes the dormant target preset', t => {
  const active = outputForm();
  const expected = captureRawOutputValues(active);
  t.true(outputTransactionValuesMatch(expected, active, 'balanced', 'balanced'));
  t.false(outputTransactionValuesMatch(expected, active, 'balanced', 'speed'));
  // Apple exposes "(None)" as an empty Profile value; it is still a real
  // dormant setting and must not be collapsed to a missing value.
  t.true(outputTransactionValuesMatch(expected, active, '', ''));
  t.false(outputTransactionValuesMatch(expected, active, '', null));
});

test('Simple always snapshots the hidden preset even when the encoder is already selected', t => {
  t.true(shouldCaptureTargetPresetForRollback('Simple'));
  t.false(shouldCaptureTargetPresetForRollback('Advanced'));
});

test('Advanced rollback only claims the restorable active Output state', t => {
  const active = outputForm();
  const expected = captureRawOutputValues(active);
  t.true(outputTransactionValuesMatch(expected, active, null, null));
});

test('only actively tested Enhanced Broadcasting results may change Desktop video settings', t => {
  t.true(shouldApplyAutoOptimizerVideoSettings('direct-single', false, ['estimated']));
  t.true(shouldApplyAutoOptimizerVideoSettings('enhanced-broadcasting', true, ['active']));
  t.false(shouldApplyAutoOptimizerVideoSettings('enhanced-broadcasting', true, ['estimated']));
  t.false(shouldApplyAutoOptimizerVideoSettings('dual-output', true, ['active']));
});

test('mixed Enhanced Broadcasting applies one common standard companion output', t => {
  const standard = (outputId: string, display: 'horizontal' | 'vertical') =>
    ({
      outputId,
      display,
      outputKind: 'standard',
      destinations: [{ platform: 'youtube' }],
      measurement: 'active',
      confidence: 'high',
      resolution:
        display === 'horizontal' ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 },
      fpsNum: 60,
      fpsDen: 1,
      fps: 60,
      bitrate: 6000,
      encoder: {
        id: 'obs_nvenc_h264_tex',
        family: 'obs_nvenc_h264_tex',
        title: 'NVIDIA NVENC H.264',
        codec: 'h264',
        preset: 'p5',
      },
    } as IAutoOptimizerOutputResult);
  const enhanced: IAutoOptimizerOutputResult = {
    ...standard('twitch-enhanced-broadcasting', 'horizontal'),
    display: 'both' as const,
    outputKind: 'twitch-enhanced-broadcasting' as const,
    destinations: [{ platform: 'twitch' as const }],
    encoder: undefined,
  };
  const horizontal = standard('horizontal-standard', 'horizontal');
  const vertical = standard('vertical-standard', 'vertical');

  t.is(
    selectAutoOptimizerStandardOutputRecommendation([enhanced, horizontal, vertical]),
    horizontal,
  );
  t.is(selectAutoOptimizerStandardOutputRecommendation([enhanced]), null);
  t.throws(() =>
    selectAutoOptimizerStandardOutputRecommendation([
      enhanced,
      horizontal,
      { ...vertical, bitrate: 4500 },
    ]),
  );
});

test('the apply transaction rejects a standard bitrate above the product ceiling', t => {
  const output = {
    outputId: 'youtube',
    display: 'horizontal',
    outputKind: 'standard',
    destinations: [{ platform: 'youtube' }],
    measurement: 'active',
    confidence: 'high',
    resolution: { width: 1920, height: 1080 },
    fpsNum: 60,
    fpsDen: 1,
    fps: 60,
    bitrate: 8001,
    encoder: {
      id: 'obs_nvenc_h264_tex',
      family: 'obs_nvenc_h264_tex',
      title: 'NVIDIA NVENC H.264',
      codec: 'h264',
      preset: 'p5',
    },
  } as IAutoOptimizerOutputResult;

  t.throws(() => selectAutoOptimizerStandardOutputRecommendation([output]), {
    message: 'The optimizer returned an unsupported streaming bitrate',
  });
});

test('active Enhanced Broadcasting builds a video-only canvas, output, and shared-FPS transaction', t => {
  const patches = buildAutoOptimizerVideoSettingsPatches(
    [
      {
        display: 'horizontal',
        resolution: { width: 1920, height: 1080 },
      },
    ],
    {
      horizontal: {
        baseWidth: 1280,
        baseHeight: 720,
        outputWidth: 1280,
        outputHeight: 720,
        fpsNum: 30,
        fpsDen: 1,
      },
      vertical: {
        baseWidth: 720,
        baseHeight: 1280,
        outputWidth: 720,
        outputHeight: 1280,
        fpsNum: 30,
        fpsDen: 1,
      },
    },
    60,
    1,
  );

  t.deepEqual(patches, {
    horizontal: {
      baseWidth: 1920,
      baseHeight: 1080,
      outputWidth: 1920,
      outputHeight: 1080,
      fpsNum: 60,
      fpsDen: 1,
    },
    vertical: { fpsNum: 60, fpsDen: 1 },
  });
  t.false('bitrate' in patches.horizontal!);
  t.false('encoder' in patches.horizontal!);
});

test('paired Enhanced Broadcasting applies distinct horizontal and vertical canvases atomically', t => {
  const current = {
    horizontal: {
      baseWidth: 1280,
      baseHeight: 720,
      outputWidth: 1280,
      outputHeight: 720,
      fpsNum: 30,
      fpsDen: 1,
    },
    vertical: {
      baseWidth: 720,
      baseHeight: 1280,
      outputWidth: 720,
      outputHeight: 1280,
      fpsNum: 30,
      fpsDen: 1,
    },
  };
  const paired = {
    display: 'both' as const,
    resolution: { width: 1920, height: 1080 },
    additionalVideo: {
      display: 'vertical' as const,
      resolution: { width: 1080, height: 1920 },
    },
  };

  t.deepEqual(buildAutoOptimizerVideoSettingsPatches([paired], current, 60, 1), {
    horizontal: {
      baseWidth: 1920,
      baseHeight: 1080,
      outputWidth: 1920,
      outputHeight: 1080,
      fpsNum: 60,
      fpsDen: 1,
    },
    vertical: {
      baseWidth: 1080,
      baseHeight: 1920,
      outputWidth: 1080,
      outputHeight: 1920,
      fpsNum: 60,
      fpsDen: 1,
    },
  });
  t.throws(
    () =>
      buildAutoOptimizerVideoSettingsPatches(
        [{ display: 'both', resolution: paired.resolution }],
        current,
        60,
        1,
      ),
    { message: 'A paired vertical recommendation is required for Dual Stream' },
  );
});
