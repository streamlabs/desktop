import test from 'ava';
import {
  isMultiplatformStream,
  isTwitchOrYouTubeOnlyStream,
  allowsExperimentalTwitchBitrate,
  shouldLimitMultistreamBitrate,
  streamResolutionCeiling,
  fitStreamResolution,
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

test('optimizer resolution tiers allow horizontal 1440p and vertical 1080p', t => {
  t.deepEqual(streamResolutionCeiling(true), { width: 2560, height: 1440 });
  t.deepEqual(streamResolutionCeiling(true, true), { width: 1080, height: 1920 });
});

test('Twitch and YouTube selections allow higher optimizer recommendations', t => {
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
  }
  t.false(isTwitchOrYouTubeOnlyStream([]));
  t.false(allowsExperimentalTwitchBitrate([]));
  t.false(shouldLimitMultistreamBitrate([]));
});

test('other platforms retain conservative optimizer recommendation limits', t => {
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
    }
  }
  t.is(autoOptimizerRecommendationBitrateCap('standard', ['kick']), 8000);
  t.is(autoOptimizerRecommendationBitrateCap('standard', ['twitch', 'youtube', 'kick']), 6000);
});

test('optimizer resolution fitting preserves aspect and orientation without upscaling', t => {
  t.deepEqual(fitStreamResolution(2560, 1440, streamResolutionCeiling(false)), {
    width: 1920,
    height: 1080,
  });
  t.deepEqual(fitStreamResolution(1440, 2560, streamResolutionCeiling(false, true)), {
    width: 1080,
    height: 1920,
  });
  t.deepEqual(fitStreamResolution(3440, 1440, streamResolutionCeiling(false)), {
    width: 1920,
    height: 802,
  });
  t.deepEqual(fitStreamResolution(1280, 720, streamResolutionCeiling(false)), {
    width: 1280,
    height: 720,
  });
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
