import test from 'ava';
import {
  isTwitchOnlyStream,
  isMultiplatformStream,
  selectedStreamPlatforms,
  streamOutputResolutionPatches,
  streamResolutionCeiling,
} from '../../app/services/streaming/stream-resolution-policy';
import { shouldShowMultistreamResolutionLimit } from '../../app/components-react/shared/auto-optimizer/presentation';
import { autoOptimizerRecommendationBitrateCap } from '../../app/services/auto-optimizer/bitrate-policy';

test('multistream bitrate is capped per ordinary output, not per canvas or Twitch rendition', t => {
  t.false(isMultiplatformStream(['twitch', 'twitch']));
  t.false(isMultiplatformStream(['youtube', 'youtube']));
  t.true(isMultiplatformStream(['twitch', 'youtube']));
  t.is(autoOptimizerRecommendationBitrateCap('standard', ['twitch', 'twitch']), 7500);
  t.is(autoOptimizerRecommendationBitrateCap('standard', ['youtube']), 8000);
  t.is(autoOptimizerRecommendationBitrateCap('standard', ['twitch', 'youtube']), 6000);
  t.is(autoOptimizerRecommendationBitrateCap('standard', ['youtube', 'kick']), 6000);
  t.is(
    autoOptimizerRecommendationBitrateCap('twitch-enhanced-broadcasting', ['twitch', 'youtube']),
    undefined,
  );
});

test('Twitch Dual Format counts as one platform; other platforms cap the entire stream', t => {
  t.true(isTwitchOnlyStream(['twitch', 'twitch']));
  for (const platforms of [[], ['youtube'], ['twitch', 'youtube'], ['twitch', 'custom']]) {
    t.false(isTwitchOnlyStream(platforms));
  }
  t.deepEqual(streamResolutionCeiling(true), { width: 2560, height: 1440 });
  t.deepEqual(streamResolutionCeiling(true, true), { width: 1080, height: 1920 });
  t.deepEqual(
    selectedStreamPlatforms({
      platforms: { twitch: { enabled: true }, youtube: { enabled: false } },
      customDestinations: [{ enabled: true, dualStream: true }],
    }),
    ['twitch'],
  );
});

test('non-Twitch output limits preserve aspect, orientation, canvas and cadence', t => {
  const videos = {
    horizontal: { outputWidth: 2560, outputHeight: 1440 },
    vertical: { outputWidth: 1440, outputHeight: 2560 },
  };
  t.deepEqual(streamOutputResolutionPatches(['twitch'], videos), {});
  t.deepEqual(streamOutputResolutionPatches(['twitch', 'kick'], videos), {
    horizontal: { outputWidth: 1920, outputHeight: 1080 },
    vertical: { outputWidth: 1080, outputHeight: 1920 },
  });
  t.deepEqual(
    streamOutputResolutionPatches(['youtube'], {
      horizontal: { outputWidth: 3440, outputHeight: 1440 },
    }),
    { horizontal: { outputWidth: 1920, outputHeight: 802 } },
  );
  t.deepEqual(
    streamOutputResolutionPatches(['youtube'], {
      horizontal: { outputWidth: 1280, outputHeight: 720 },
    }),
    {},
  );
  t.deepEqual(videos.horizontal, { outputWidth: 2560, outputHeight: 1440 });
});

test('1080p ceiling notice requires multiple platforms and an active result at the cap', t => {
  const output = {
    width: 1920,
    height: 1080,
    measurementMode: 'active',
    platforms: [{ id: 'twitch' }],
  };
  t.false(shouldShowMultistreamResolutionLimit([output, output]));
  t.true(
    shouldShowMultistreamResolutionLimit([output, { ...output, platforms: [{ id: 'youtube' }] }]),
  );
  t.false(
    shouldShowMultistreamResolutionLimit([
      { ...output, width: 1280, height: 720, platforms: [{ id: 'twitch' }, { id: 'youtube' }] },
    ]),
  );
  t.false(
    shouldShowMultistreamResolutionLimit([
      { ...output, measurementMode: 'estimated', platforms: [{ id: 'twitch' }, { id: 'youtube' }] },
    ]),
  );
});
