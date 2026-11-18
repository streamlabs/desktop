import test from 'ava';
import {
  findPlatformCodecIncompatibility,
  isVideoCodecSupportedByPlatform,
  videoCodecLabel,
} from '../../app/services/settings/output/platform-codec-support';

test('Kick only accepts H.264', t => {
  t.true(isVideoCodecSupportedByPlatform('kick', 'h264'));
  t.false(isVideoCodecSupportedByPlatform('kick', 'hevc'));
  t.false(isVideoCodecSupportedByPlatform('kick', 'av1'));
});

test('X only accepts H.264', t => {
  t.true(isVideoCodecSupportedByPlatform('twitter', 'h264'));
  t.false(isVideoCodecSupportedByPlatform('twitter', 'hevc'));
  t.false(isVideoCodecSupportedByPlatform('twitter', 'av1'));
});

test('platforms that accept HEVC are not constrained', t => {
  for (const platform of ['tiktok', 'patreon', 'instagram'] as const) {
    t.true(isVideoCodecSupportedByPlatform(platform, 'h264'), `${platform} h264`);
    t.true(isVideoCodecSupportedByPlatform(platform, 'hevc'), `${platform} hevc`);
  }
});

test('platforms OBS validates itself are not constrained by Desktop', t => {
  // Twitch/YouTube codecs come from obs-studio's services.json and are enforced by OSN.
  t.true(isVideoCodecSupportedByPlatform('twitch', 'hevc'));
  t.true(isVideoCodecSupportedByPlatform('youtube', 'av1'));
});

test('an unknown codec never blocks Go Live', t => {
  t.true(isVideoCodecSupportedByPlatform('kick', undefined));
  t.true(isVideoCodecSupportedByPlatform('kick', ''));
  t.is(findPlatformCodecIncompatibility(['kick'], undefined), null);
});

test('finds Kick when streaming HEVC alongside an unconstrained platform', t => {
  t.deepEqual(findPlatformCodecIncompatibility(['youtube', 'kick'], 'hevc'), {
    platform: 'kick',
    codec: 'hevc',
    supportedCodecs: ['h264'],
  });
});

test('no incompatibility for H.264 or without Kick', t => {
  t.is(findPlatformCodecIncompatibility(['youtube', 'kick'], 'h264'), null);
  t.is(findPlatformCodecIncompatibility(['youtube', 'twitch'], 'hevc'), null);
  t.is(findPlatformCodecIncompatibility([], 'hevc'), null);
});

test('codec labels', t => {
  t.is(videoCodecLabel('h264'), 'H.264');
  t.is(videoCodecLabel('hevc'), 'HEVC');
  t.is(videoCodecLabel('av1'), 'AV1');
  t.is(videoCodecLabel('vp9'), 'VP9');
});
