import test from 'ava';
import {
  isTwitchOnlyStream,
  isMultiplatformStream,
  isTwitchOrYouTubeOnlyStream,
  allowsExperimentalTwitchBitrate,
  shouldLimitMultistreamBitrate,
  selectedStreamPlatforms,
  streamOutputResolutionPatches,
  streamResolutionCeiling,
} from '../../app/services/streaming/stream-resolution-policy';
import { shouldShowPlatformResolutionLimit } from '../../app/components-react/shared/auto-optimizer/presentation';
import { autoOptimizerRecommendationBitrateCap } from '../../app/services/auto-optimizer/bitrate-policy';

test('multistream bitrate is capped per ordinary output, not per canvas or Twitch rendition', t => {
  t.false(isMultiplatformStream(['twitch', 'twitch']));
  t.false(isMultiplatformStream(['youtube', 'youtube']));
  t.true(isMultiplatformStream(['twitch', 'youtube']));
  t.is(autoOptimizerRecommendationBitrateCap('standard', ['twitch', 'twitch']), 7500);
  t.is(autoOptimizerRecommendationBitrateCap('standard', ['youtube']), 8000);
  t.is(autoOptimizerRecommendationBitrateCap('standard', ['twitch', 'youtube']), 7500);
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

test('only Twitch and YouTube selections preserve configured output sizes and bitrate allowances', t => {
  const videos = {
    horizontal: { outputWidth: 3840, outputHeight: 2160 },
    vertical: { outputWidth: 2160, outputHeight: 3840 },
  };
  for (const platforms of [
    ['twitch'],
    ['youtube'],
    ['youtube', 'youtube'],
    ['twitch', 'youtube'],
    ['youtube', 'twitch', 'twitch'],
  ]) {
    t.true(isTwitchOrYouTubeOnlyStream(platforms));
    t.is(allowsExperimentalTwitchBitrate(platforms), platforms.includes('twitch'));
    t.false(shouldLimitMultistreamBitrate(platforms));
    t.deepEqual(streamOutputResolutionPatches(platforms, videos), {});
  }
  t.false(isTwitchOrYouTubeOnlyStream([]));
  t.false(allowsExperimentalTwitchBitrate([]));
  t.false(shouldLimitMultistreamBitrate([]));
  t.deepEqual(streamOutputResolutionPatches([], videos), {});
});

test('any other selected platform caps both outputs, including custom and unknown destinations', t => {
  for (const other of ['facebook', 'kick', 'tiktok', 'custom', 'other', 'unknown']) {
    for (const platforms of [
      [other],
      ['youtube', other],
      ['twitch', other],
      ['twitch', 'youtube', other],
    ]) {
      t.false(isTwitchOrYouTubeOnlyStream(platforms));
      t.false(allowsExperimentalTwitchBitrate(platforms));
      t.is(shouldLimitMultistreamBitrate(platforms), platforms.length > 1);
      t.deepEqual(
        streamOutputResolutionPatches(platforms, {
          horizontal: { outputWidth: 2560, outputHeight: 1440 },
          vertical: { outputWidth: 1440, outputHeight: 2560 },
        }),
        {
          horizontal: { outputWidth: 1920, outputHeight: 1080 },
          vertical: { outputWidth: 1080, outputHeight: 1920 },
        },
      );
    }
  }
  t.is(autoOptimizerRecommendationBitrateCap('standard', ['kick']), 8000);
  t.is(autoOptimizerRecommendationBitrateCap('standard', ['twitch', 'youtube', 'kick']), 6000);
  t.deepEqual(
    selectedStreamPlatforms({
      platforms: { youtube: { enabled: true }, facebook: { enabled: false } },
      customDestinations: [
        { enabled: true },
        { enabled: false },
        { enabled: true, dualStream: true },
      ],
    }),
    ['youtube', 'custom'],
  );
});

test('restricted output limits preserve aspect, orientation, canvas and cadence', t => {
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
    streamOutputResolutionPatches(['facebook'], {
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

test('1080p ceiling notice requires a restricted platform and an active result at the cap', t => {
  const output = {
    width: 1920,
    height: 1080,
    measurementMode: 'active',
    platforms: [{ id: 'twitch' }],
  };
  t.false(shouldShowPlatformResolutionLimit([output, output]));
  t.false(
    shouldShowPlatformResolutionLimit([output, { ...output, platforms: [{ id: 'youtube' }] }]),
  );
  t.false(shouldShowPlatformResolutionLimit([{ ...output, platforms: [{ id: 'youtube' }] }]));
  for (const platforms of [
    [{ id: 'kick' }],
    [{ id: 'youtube' }, { id: 'kick' }],
    [{ id: 'twitch' }, { id: 'youtube' }, { id: 'custom' }],
  ]) {
    t.true(shouldShowPlatformResolutionLimit([{ ...output, platforms }]));
  }
  t.false(
    shouldShowPlatformResolutionLimit([
      { ...output, width: 1280, height: 720, platforms: [{ id: 'twitch' }, { id: 'kick' }] },
    ]),
  );
  t.false(
    shouldShowPlatformResolutionLimit([
      { ...output, measurementMode: 'estimated', platforms: [{ id: 'twitch' }, { id: 'kick' }] },
    ]),
  );
});
