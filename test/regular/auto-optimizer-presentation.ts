import test from 'ava';
import {
  autoOptimizerErrorMessage,
  autoOptimizerProgressLabel,
  bandwidthPhaseLabelKey,
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
