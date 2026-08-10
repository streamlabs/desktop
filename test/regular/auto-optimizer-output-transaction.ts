import test from 'ava';
import {
  captureRawOutputValues,
  outputTransactionValuesMatch,
  rawOutputValuesMatch,
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
