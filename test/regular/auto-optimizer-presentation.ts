import test from 'ava';
import {
  bandwidthPhaseLabelKey,
  successfulProbeProviders,
} from '../../app/components-react/shared/auto-optimizer/presentation';

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
