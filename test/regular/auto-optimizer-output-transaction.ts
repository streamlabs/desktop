import test from 'ava';
import {
  buildAutoOptimizerVideoSettingsPatches,
  captureRawOutputValues,
  outputTransactionValuesMatch,
  rawOutputValuesMatch,
  shouldApplyAutoOptimizerVideoSettings,
  shouldCaptureTargetPresetForRollback,
} from '../../app/services/auto-config/output-transaction-policy';

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

test('only an active Enhanced Broadcasting workload may apply provider-owned video settings', t => {
  t.true(shouldApplyAutoOptimizerVideoSettings('direct-single', false, ['estimated']));
  t.true(
    shouldApplyAutoOptimizerVideoSettings('enhanced-broadcasting', true, ['active']),
  );
  t.false(
    shouldApplyAutoOptimizerVideoSettings('enhanced-broadcasting', true, ['estimated']),
  );
  t.false(shouldApplyAutoOptimizerVideoSettings('dual-output', true, ['active']));
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
