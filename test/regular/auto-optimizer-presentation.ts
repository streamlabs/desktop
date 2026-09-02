import test from 'ava';
import * as fs from 'fs';
import * as path from 'path';
import {
  autoOptimizerErrorMessage,
  autoOptimizerProgressLabel,
  bandwidthPhaseLabelKey,
  estimatedProbePlatforms,
  shouldShowAutoOptimizerMeasurementReason,
  successfulProbePlatforms,
} from '../../app/components-react/shared/auto-optimizer/presentation';
import { IAutoOptimizerProgressDetail } from '../../app/services/auto-config/types';

function progressDetail(
  patch: Partial<IAutoOptimizerProgressDetail> = {},
): IAutoOptimizerProgressDetail {
  return {
    code: null,
    platform: null,
    targetBitrateKbps: null,
    availableBitrateKbps: null,
    encoderId: null,
    encoderFamily: null,
    encoderTitle: null,
    width: null,
    height: null,
    fpsNum: null,
    fpsDen: null,
    additionalVideo: null,
    selectedBitrateKbps: null,
    ...patch,
  };
}

test('successfully measured platforms are stable, deduplicated, and omit failures', t => {
  t.deepEqual(
    successfulProbePlatforms([
      { platform: 'youtube', success: true },
      { platform: 'twitch', success: false },
      { platform: 'youtube', success: true },
      { platform: 'twitch', success: true },
    ]),
    ['twitch', 'youtube'],
  );
});

test('partial platform evidence separates measured and estimated destinations', t => {
  const platforms = [{ id: 'twitch' }, { id: 'youtube' }, { id: 'kick' }, { id: 'facebook' }];
  const evidence = [
    { platform: 'twitch' as const, success: true },
    { platform: 'youtube' as const, success: false },
  ];

  t.deepEqual(successfulProbePlatforms(evidence), ['twitch']);
  t.deepEqual(estimatedProbePlatforms(platforms, evidence), ['youtube']);
});

test('estimate-only evidence includes only platforms with supported bandwidth probes', t => {
  const platforms = [{ id: 'twitch' }, { id: 'youtube' }, { id: 'kick' }];

  t.deepEqual(estimatedProbePlatforms(platforms), ['twitch', 'youtube']);
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

test('bandwidth phase follows the platform currently being probed', t => {
  const candidates = [{ platform: 'twitch' as const }, { platform: 'youtube' as const }];

  t.is(bandwidthPhaseLabelKey(null, candidates), 'Measuring your Twitch and YouTube uploads...');
  t.is(bandwidthPhaseLabelKey('twitch', candidates), 'Measuring your Twitch upload...');
  t.is(bandwidthPhaseLabelKey('youtube', candidates), 'Connecting to YouTube...');
  t.is(
    bandwidthPhaseLabelKey('twitch', candidates, 6000),
    'Measuring your Twitch upload at %{bitrate} Kbps...',
  );
  t.is(
    bandwidthPhaseLabelKey('youtube', candidates, 10000),
    'Measuring your YouTube upload at %{bitrate} Kbps...',
  );
  t.is(bandwidthPhaseLabelKey('youtube', candidates, 0), 'Connecting to YouTube...');
});

test('bandwidth phase remains estimate-only when there are no candidates', t => {
  t.is(bandwidthPhaseLabelKey(null, []), 'Estimating safe upload settings...');
});

test('hardware progress describes the encoder, resolution, and frame rate being tested', t => {
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

test('paired hardware progress distinguishes resolution testing from frame-rate validation', t => {
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
      key:
        'Could not validate %{encoder} at %{width}×%{height}, %{fps} FPS. Trying a lower setting...',
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

test('hardware progress explains validation with the current scene', t => {
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
      progressDetail({ code: 'youtube_probe_waiting_for_ingest', platform: 'youtube' }),
    ).key,
    'Connecting to YouTube...',
  );
  t.deepEqual(
    autoOptimizerProgressLabel(
      'bandwidth',
      progressDetail({
        code: 'youtube_probe_baseline',
        platform: 'youtube',
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
        platform: 'youtube',
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
        platform: 'twitch',
        targetBitrateKbps: 6000,
      }),
    ),
    {
      key: 'Confirming your Twitch upload at %{bitrate} Kbps...',
      values: { bitrate: 6000 },
    },
  );
});

test('Dual Output progress explains bandwidth allocation and concurrent workload testing', t => {
  t.deepEqual(
    autoOptimizerProgressLabel(
      'recommendation',
      progressDetail({
        code: 'dual_output_allocating_upload',
        selectedBitrateKbps: 5000,
        availableBitrateKbps: 10000,
      }),
    ),
    { key: 'Allocating upload capacity across Twitch and YouTube...' },
  );
  t.deepEqual(
    autoOptimizerProgressLabel(
      'hardware',
      progressDetail({
        code: 'dual_output_testing_workload',
        width: 1920,
        height: 1080,
        fpsNum: 60,
        fpsDen: 1,
      }),
    ),
    { key: 'Testing Twitch and YouTube together...' },
  );
});

test('Enhanced Broadcasting progress describes ladder and exact candidates', t => {
  t.is(
    autoOptimizerProgressLabel(
      'bandwidth',
      progressDetail({
        code: 'enhanced_broadcasting_requesting_ladder',
        platform: 'twitch',
      }),
    ).key,
    'Preparing Enhanced Broadcasting settings with Twitch...',
  );
  const candidate = progressDetail({
    code: 'enhanced_broadcasting_testing_candidate',
    platform: 'twitch',
    width: 1920,
    height: 1080,
    fpsNum: 60,
    fpsDen: 1,
  });
  t.deepEqual(autoOptimizerProgressLabel('bandwidth', candidate), {
    key: 'Testing Enhanced Broadcasting at %{width}×%{height}, %{fps} FPS...',
    values: {
      encoder: 'Encoder',
      width: 1920,
      height: 1080,
      fps: 60,
      bitrate: 0,
    },
  });
  t.deepEqual(
    autoOptimizerProgressLabel('bandwidth', {
      ...candidate,
      code: 'enhanced_broadcasting_validating_target_cadence',
    }),
    {
      key: 'Validating Enhanced Broadcasting at %{width}×%{height}, %{fps} FPS...',
      values: {
        encoder: 'Encoder',
        width: 1920,
        height: 1080,
        fps: 60,
        bitrate: 0,
      },
    },
  );
  t.is(
    autoOptimizerProgressLabel('bandwidth', {
      ...candidate,
      code: 'enhanced_broadcasting_candidate_rejected',
    }).key,
    '%{width}×%{height}, %{fps} FPS could not keep up. Trying a lower setting...',
  );
  t.is(
    autoOptimizerProgressLabel('bandwidth', {
      ...candidate,
      code: 'enhanced_broadcasting_candidate_selected',
    }).key,
    'Enhanced Broadcasting passed at %{width}×%{height}, %{fps} FPS.',
  );
});

test('paired Enhanced Broadcasting progress names both tested canvases', t => {
  const label = autoOptimizerProgressLabel(
    'bandwidth',
    progressDetail({
      code: 'enhanced_broadcasting_testing_candidate',
      platform: 'twitch',
      width: 1920,
      height: 1080,
      fpsNum: 60,
      fpsDen: 1,
      additionalVideo: {
        display: 'vertical',
        width: 1080,
        height: 1920,
        fpsNum: 60,
        fpsDen: 1,
      },
    }),
  );

  t.deepEqual(label, {
    key:
      'Testing Enhanced Broadcasting at %{width}×%{height} horizontal and %{additionalWidth}×%{additionalHeight} vertical, %{fps} FPS...',
    values: {
      encoder: 'Encoder',
      width: 1920,
      height: 1080,
      fps: 60,
      bitrate: 0,
      additionalWidth: 1080,
      additionalHeight: 1920,
    },
  });
});

test('mixed Enhanced Broadcasting progress describes the real concurrent outputs', t => {
  const label = autoOptimizerProgressLabel(
    'bandwidth',
    progressDetail({
      code: 'enhanced_broadcasting_testing_concurrent_outputs',
      platform: 'twitch',
      width: 1920,
      height: 1080,
      fpsNum: 60,
      fpsDen: 1,
      additionalVideo: {
        display: 'vertical',
        width: 1080,
        height: 1920,
        fpsNum: 60,
        fpsDen: 1,
      },
    }),
  );

  t.is(
    label.key,
    'Testing Enhanced Broadcasting and your other stream outputs at %{width}×%{height} horizontal and %{additionalWidth}×%{additionalHeight} vertical, %{fps} FPS...',
  );
  t.false(label.key.toLowerCase().includes('restream'));
});

test('Enhanced Broadcasting progress interpolates through the en-US catalog', t => {
  const VueRuntime = require('vue');
  const VueI18nRuntime = require('vue-i18n');
  VueRuntime.use(VueI18nRuntime);
  const messages = JSON.parse(
    fs.readFileSync(path.resolve('app/i18n/en-US/streaming.json'), 'utf8'),
  );
  const i18n = new VueI18nRuntime({
    locale: 'en-US',
    fallbackLocale: 'en-US',
    messages: { 'en-US': messages },
  });
  const candidate = progressDetail({
    code: 'enhanced_broadcasting_testing_candidate',
    platform: 'twitch',
    width: 1920,
    height: 1080,
    fpsNum: 60000,
    fpsDen: 1001,
  });
  const label = autoOptimizerProgressLabel('bandwidth', candidate);
  const codes = [
    'enhanced_broadcasting_testing_candidate',
    'enhanced_broadcasting_testing_concurrent_outputs',
    'enhanced_broadcasting_validating_target_cadence',
    'enhanced_broadcasting_candidate_rejected',
    'enhanced_broadcasting_candidate_selected',
  ] as const;
  const labels = [
    autoOptimizerProgressLabel(
      'bandwidth',
      progressDetail({ code: 'enhanced_broadcasting_requesting_ladder', platform: 'twitch' }),
    ),
    ...codes.map(code => autoOptimizerProgressLabel('bandwidth', { ...candidate, code })),
    ...codes.map(code =>
      autoOptimizerProgressLabel('bandwidth', progressDetail({ code, platform: 'twitch' })),
    ),
  ];

  labels.forEach(progressLabel => {
    t.true(
      Object.prototype.hasOwnProperty.call(messages, progressLabel.key),
      `Missing en-US progress translation: ${progressLabel.key}`,
    );
  });

  [
    'Canvas resolution',
    'Horizontal canvas resolution',
    'Vertical canvas resolution',
    'Twitch Enhanced Broadcasting',
    'Twitch will manage stream output resolutions, bitrates, and encoders.',
  ].forEach(key => {
    t.true(
      Object.prototype.hasOwnProperty.call(messages, key),
      `Missing en-US result translation: ${key}`,
    );
  });

  t.is(
    i18n.t(label.key, label.values) as string,
    'Testing Enhanced Broadcasting at 1920×1080, 59.94 FPS...',
  );
});

test('final resource cleanup has an explicit progress label', t => {
  t.deepEqual(
    autoOptimizerProgressLabel('cleanup', progressDetail({ code: 'cleanup_resources' })),
    { key: 'Cleaning up resources...' },
  );
});

test('terminal platform progress states remain truthful and readable', t => {
  t.is(
    autoOptimizerProgressLabel(
      'bandwidth',
      progressDetail({ code: 'youtube_probe_completed', platform: 'youtube' }),
    ).key,
    'YouTube upload test complete.',
  );
  t.is(
    autoOptimizerProgressLabel(
      'bandwidth',
      progressDetail({
        code: 'youtube_probe_source_underfill_completed',
        platform: 'youtube',
      }),
    ).key,
    'YouTube upload test complete. Full connection capacity could not be measured.',
  );
  t.is(
    autoOptimizerProgressLabel(
      'bandwidth',
      progressDetail({ code: 'twitch_probe_unstable_estimate_used', platform: 'twitch' }),
    ).key,
    'Your Twitch upload was unstable. Using an estimate...',
  );
  t.is(
    autoOptimizerProgressLabel(
      'bandwidth',
      progressDetail({ code: 'youtube_probe_failed_estimate_used', platform: 'youtube' }),
    ).key,
    "Couldn't complete the YouTube upload test. Using an estimate...",
  );
  t.is(
    autoOptimizerProgressLabel(
      'bandwidth',
      progressDetail({ code: 'active_probe_not_eligible', platform: 'youtube' }),
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
    autoOptimizerProgressLabel('hardware', progressDetail({ code: 'future_native_status' })),
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
