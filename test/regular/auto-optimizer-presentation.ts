import test from 'ava';
import {
  autoOptimizerErrorMessage,
  autoOptimizerProgressLabel,
  bandwidthPhaseLabelKey,
  cloudRestreamConfidenceExplanationKey,
  estimatedProbeProviders,
  shouldShowAutoOptimizerMeasurementReason,
  successfulProbeProviders,
} from '../../app/components-react/shared/auto-optimizer/presentation';
import { IAutoOptimizerProgressDetail } from '../../app/services/auto-config/types';

function progressDetail(
  patch: Partial<IAutoOptimizerProgressDetail> = {},
): IAutoOptimizerProgressDetail {
  return {
    code: null,
    provider: null,
    targetBitrateKbps: null,
    availableBitrateKbps: null,
    encoderId: null,
    encoderFamily: null,
    encoderTitle: null,
    width: null,
    height: null,
    fpsNum: null,
    fpsDen: null,
    selectedBitrateKbps: null,
    ...patch,
  };
}

test('successful measured providers are stable, deduplicated, and omit failures', t => {
  t.deepEqual(
    successfulProbeProviders([
      { provider: 'youtube', success: true },
      { provider: 'twitch', success: false },
      { provider: 'youtube', success: true },
      { provider: 'twitch', success: true },
    ]),
    ['twitch', 'youtube'],
  );
});

test('partial provider provenance separates measured and estimated destinations', t => {
  const platforms = [{ id: 'twitch' }, { id: 'youtube' }, { id: 'facebook' }];
  const evidence = [
    { provider: 'twitch' as const, success: true },
    { provider: 'youtube' as const, success: false },
  ];

  t.deepEqual(successfulProbeProviders(evidence), ['twitch']);
  t.deepEqual(estimatedProbeProviders(platforms, evidence), ['youtube']);
});

test('active medium-confidence quality reasons remain visible in results', t => {
  t.true(shouldShowAutoOptimizerMeasurementReason('quality_promotion_tested'));
  t.true(shouldShowAutoOptimizerMeasurementReason('hardware_benchmark_quality_fallback'));
  t.true(shouldShowAutoOptimizerMeasurementReason('connection_variability_detected'));
  t.true(shouldShowAutoOptimizerMeasurementReason('probe_source_underfill'));
  t.true(shouldShowAutoOptimizerMeasurementReason('partial_provider_probes'));
  t.false(shouldShowAutoOptimizerMeasurementReason('probe_failed'));
  t.false(shouldShowAutoOptimizerMeasurementReason());
});

test('generic cloud-restream copy omits medium and low confidence', t => {
  t.is(cloudRestreamConfidenceExplanationKey(), null);
  t.is(cloudRestreamConfidenceExplanationKey('medium'), null);
  t.is(cloudRestreamConfidenceExplanationKey('low'), null);
  t.is(
    cloudRestreamConfidenceExplanationKey('high'),
    'This shared cloud-restream upload was measured indirectly. The result has high confidence.',
  );
});

test('bandwidth phase follows the provider currently being probed', t => {
  const candidates = [{ provider: 'twitch' as const }, { provider: 'youtube' as const }];

  t.is(bandwidthPhaseLabelKey(null, candidates), 'Measuring your Twitch and YouTube uploads...');
  t.is(bandwidthPhaseLabelKey('twitch', candidates), 'Measuring your Twitch upload...');
  t.is(bandwidthPhaseLabelKey('youtube', candidates), 'Connecting to YouTube...');
  t.is(
    bandwidthPhaseLabelKey('twitch', candidates, 6000),
    'Measuring your Twitch upload at %{bitrate} Kbps...',
  );
  t.is(
    bandwidthPhaseLabelKey('youtube', candidates, 12000),
    'Measuring your YouTube upload at %{bitrate} Kbps...',
  );
  t.is(bandwidthPhaseLabelKey('youtube', candidates, 0), 'Connecting to YouTube...');
});

test('bandwidth phase remains estimate-only when there are no candidates', t => {
  t.is(bandwidthPhaseLabelKey(null, []), 'Estimating safe upload settings...');
});

test('hardware progress describes the encoder and exact tuple being tested', t => {
  t.deepEqual(
    autoOptimizerProgressLabel(
      'hardware',
      progressDetail({
        code: 'hardware_testing_encoder',
        encoderId: 'obs_nvenc_h264_tex',
        encoderFamily: 'obs_nvenc_h264_tex',
        encoderTitle: 'NVIDIA NVENC H.264',
        width: 1920,
        height: 1080,
        fpsNum: 60000,
        fpsDen: 1001,
      }),
    ),
    {
      key: 'Testing %{encoder} at %{width}×%{height}, %{fps} FPS...',
      values: {
        encoder: 'NVIDIA NVENC H.264',
        width: 1920,
        height: 1080,
        fps: 59.94,
        bitrate: 0,
      },
    },
  );
});

test('paired hardware progress distinguishes resolution surfaces from exact cadence', t => {
  const surface = progressDetail({
    code: 'hardware_testing_encoder_surfaces',
    encoderId: 'obs_nvenc_h264_tex',
    encoderTitle: 'NVIDIA NVENC H.264',
    width: 1920,
    height: 1080,
    fpsNum: 30,
    fpsDen: 1,
  });
  t.deepEqual(autoOptimizerProgressLabel('hardware', surface), {
    key: 'Testing %{encoder} video at %{width}×%{height}...',
    values: {
      encoder: 'NVIDIA NVENC H.264',
      width: 1920,
      height: 1080,
    },
  });

  const cadence = progressDetail({
    ...surface,
    code: 'hardware_validating_target_cadence',
    fpsNum: 60,
  });
  t.deepEqual(autoOptimizerProgressLabel('hardware', cadence), {
    key: 'Checking %{encoder} at %{width}×%{height}, %{fps} FPS...',
    values: {
      encoder: 'NVIDIA NVENC H.264',
      width: 1920,
      height: 1080,
      fps: 60,
      bitrate: 0,
    },
  });

  t.deepEqual(
    autoOptimizerProgressLabel('hardware', {
      ...cadence,
      code: 'hardware_target_cadence_rejected',
    }),
    {
      key: 'Could not validate %{encoder} at %{width}×%{height}, %{fps} FPS. Trying a lower setting...',
      values: {
        encoder: 'NVIDIA NVENC H.264',
        width: 1920,
        height: 1080,
        fps: 60,
        bitrate: 0,
      },
    },
  );
});

test('hardware completion reports capability without claiming the final quality selection', t => {
  t.deepEqual(
    autoOptimizerProgressLabel(
      'hardware',
      progressDetail({
        code: 'hardware_encoder_selected',
        encoderId: 'obs_nvenc_h264_tex',
        encoderFamily: 'obs_nvenc_h264_tex',
        encoderTitle: 'NVIDIA NVENC H.264',
        width: 1920,
        height: 1080,
        fpsNum: 30,
        fpsDen: 1,
      }),
    ),
    {
      key: '%{encoder} passed the hardware test at %{width}×%{height}, %{fps} FPS.',
      values: {
        encoder: 'NVIDIA NVENC H.264',
        width: 1920,
        height: 1080,
        fps: 30,
        bitrate: 0,
      },
    },
  );
});

test('hardware control progress explains the known-main-mix validation', t => {
  t.deepEqual(
    autoOptimizerProgressLabel(
      'hardware',
      progressDetail({
        code: 'hardware_validating_encoder',
        encoderId: 'obs_nvenc_h264_tex',
        encoderFamily: 'obs_nvenc_h264_tex',
        encoderTitle: 'NVIDIA NVENC H.264 (new)',
        width: 1280,
        height: 720,
        fpsNum: 30,
        fpsDen: 1,
      }),
    ),
    {
      key: 'Validating %{encoder} with your current scene at %{width}×%{height}, %{fps} FPS...',
      values: {
        encoder: 'NVIDIA NVENC H.264 (new)',
        width: 1280,
        height: 720,
        fps: 30,
        bitrate: 0,
      },
    },
  );
});

test('YouTube progress distinguishes connection, baseline, retry, and ramp states', t => {
  t.is(
    autoOptimizerProgressLabel(
      'bandwidth',
      progressDetail({ code: 'youtube_probe_waiting_for_ingest', provider: 'youtube' }),
    ).key,
    'Connecting to YouTube...',
  );
  t.deepEqual(
    autoOptimizerProgressLabel(
      'bandwidth',
      progressDetail({
        code: 'youtube_probe_baseline',
        provider: 'youtube',
        targetBitrateKbps: 1500,
      }),
    ),
    {
      key: 'Checking your YouTube connection at %{bitrate} Kbps...',
      values: { bitrate: 1500 },
    },
  );
  t.is(
    autoOptimizerProgressLabel(
      'bandwidth',
      progressDetail({
        code: 'youtube_probe_retrying',
        provider: 'youtube',
        targetBitrateKbps: 6000,
      }),
    ).key,
    'Retrying your YouTube upload at %{bitrate} Kbps...',
  );
});

test('Twitch progress identifies the extended same-target confirmation', t => {
  t.deepEqual(
    autoOptimizerProgressLabel(
      'bandwidth',
      progressDetail({
        code: 'twitch_probe_confirming_capacity',
        provider: 'twitch',
        targetBitrateKbps: 6000,
      }),
    ),
    {
      key: 'Confirming your Twitch upload at %{bitrate} Kbps...',
      values: { bitrate: 6000 },
    },
  );
});

test('final resource cleanup has an explicit progress label', t => {
  t.deepEqual(
    autoOptimizerProgressLabel('cleanup', progressDetail({ code: 'cleanup_resources' })),
    { key: 'Cleaning up resources...' },
  );
});

test('terminal provider progress states remain truthful and readable', t => {
  t.is(
    autoOptimizerProgressLabel(
      'bandwidth',
      progressDetail({ code: 'youtube_probe_completed', provider: 'youtube' }),
    ).key,
    'YouTube upload test complete.',
  );
  t.is(
    autoOptimizerProgressLabel(
      'bandwidth',
      progressDetail({
        code: 'youtube_probe_source_underfill_completed',
        provider: 'youtube',
      }),
    ).key,
    'YouTube upload test complete. Full connection capacity could not be measured.',
  );
  t.is(
    autoOptimizerProgressLabel(
      'bandwidth',
      progressDetail({ code: 'twitch_probe_unstable_estimate_used', provider: 'twitch' }),
    ).key,
    'Your Twitch upload was unstable. Using an estimate...',
  );
  t.is(
    autoOptimizerProgressLabel(
      'bandwidth',
      progressDetail({ code: 'youtube_probe_failed_estimate_used', provider: 'youtube' }),
    ).key,
    "Couldn't complete the YouTube upload test. Using an estimate...",
  );
  t.is(
    autoOptimizerProgressLabel(
      'bandwidth',
      progressDetail({ code: 'active_probe_not_eligible', provider: 'youtube' }),
    ).key,
    'Estimating safe upload settings...',
  );
});

test('quality selection reports the bandwidth budget and unknown codes fall back safely', t => {
  t.deepEqual(
    autoOptimizerProgressLabel(
      'recommendation',
      progressDetail({
        code: 'recommendation_selecting_quality',
        availableBitrateKbps: 4500,
      }),
    ),
    {
      key: 'Selecting settings for %{bitrate} Kbps...',
      values: { bitrate: 4500 },
    },
  );
  t.deepEqual(
    autoOptimizerProgressLabel(
      'hardware',
      progressDetail({ code: 'future_native_status' }),
    ),
    { key: 'Checking your hardware...' },
  );
});

test('known hardware failures use actionable copy and unknown failures retain diagnostics', t => {
  t.is(
    autoOptimizerErrorMessage({
      code: 'hardware_no_usable_encoder',
      message: 'hardware_no_usable_encoder',
    }),
    "We couldn't find an encoder that can stream reliably. Close other apps and try again.",
  );
  t.is(
    autoOptimizerErrorMessage({
      code: 'hardware_benchmark_timeout',
      message: 'hardware_benchmark_timeout',
    }),
    'The encoder test took too long. Close other apps and try again.',
  );
  t.is(
    autoOptimizerErrorMessage({ code: 'future_failure', message: 'Native diagnostic' }),
    'Native diagnostic',
  );
  t.is(autoOptimizerErrorMessage(null), 'Optimization failed. Please try again.');
});
