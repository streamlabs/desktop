import test from 'ava';
import {
  isCommonTwitchService,
  isTwitchStreamDestination,
} from '../../../app/services/streaming/stream-destination';

const destinations = [
  {
    name: 'common Twitch automatic',
    streamType: 'rtmp_common',
    service: 'Twitch',
    server: 'auto',
    twitch: true,
    enhanced: true,
  },
  {
    name: 'common Twitch regional',
    streamType: 'rtmp_common',
    service: 'Twitch',
    server: 'rtmp://usw20.contribute.live-video.net/app',
    twitch: true,
    enhanced: true,
  },
  {
    name: 'custom Twitch',
    streamType: 'rtmp_custom',
    server: 'rtmp://live.twitch.tv/app',
    twitch: true,
    enhanced: false,
  },
  {
    name: 'custom Twitch trailing slash',
    streamType: 'rtmp_custom',
    server: 'rtmp://live.twitch.tv/app/',
    twitch: true,
    enhanced: false,
  },
  {
    name: 'custom Twitch secure uppercase host',
    streamType: 'rtmp_custom',
    server: 'rtmps://LIVE.TWITCH.TV:443/app/',
    twitch: true,
    enhanced: false,
  },
  {
    name: 'custom Twitch regional',
    streamType: 'rtmp_custom',
    server: 'rtmp://usw20.contribute.live-video.net/app',
    twitch: true,
    enhanced: false,
  },
  {
    name: 'custom Twitch global ingest',
    streamType: 'rtmp_custom',
    server: 'rtmp://ingest.global-contribute.live-video.net/app',
    twitch: true,
    enhanced: false,
  },
  {
    name: 'common YouTube',
    streamType: 'rtmp_common',
    service: 'YouTube - RTMPS',
    server: 'rtmps://a.rtmps.youtube.com:443/live2',
    twitch: false,
    enhanced: false,
  },
  {
    name: 'custom YouTube with stale Twitch service',
    streamType: 'rtmp_custom',
    service: 'Twitch',
    server: 'rtmps://a.rtmps.youtube.com:443/live2',
    twitch: false,
    enhanced: false,
  },
  {
    name: 'common provider with Twitch URL',
    streamType: 'rtmp_common',
    service: 'YouTube - RTMPS',
    server: 'rtmp://live.twitch.tv/app',
    twitch: false,
    enhanced: false,
  },
  {
    name: 'unresolved automatic selection',
    streamType: 'rtmp_custom',
    server: 'auto',
    twitch: false,
    enhanced: false,
  },
  { name: 'empty server', streamType: 'rtmp_custom', server: '', twitch: false, enhanced: false },
  {
    name: 'Twitch name in path',
    streamType: 'rtmp_custom',
    server: 'rtmp://example.invalid/twitch',
    twitch: false,
    enhanced: false,
  },
  {
    name: 'Twitch name in credentials',
    streamType: 'rtmp_custom',
    server: 'rtmp://live.twitch.tv@example.invalid/app',
    twitch: false,
    enhanced: false,
  },
  {
    name: 'Twitch hostname suffix spoof',
    streamType: 'rtmp_custom',
    server: 'rtmp://live.twitch.tv.example.invalid/app',
    twitch: false,
    enhanced: false,
  },
  {
    name: 'unrelated live-video ingest',
    streamType: 'rtmp_custom',
    server: 'rtmps://example.global-contribute.live-video.net/app',
    twitch: false,
    enhanced: false,
  },
  {
    name: 'web URL',
    streamType: 'rtmp_custom',
    server: 'https://live.twitch.tv/app',
    twitch: false,
    enhanced: false,
  },
  {
    name: 'WHIP destination',
    streamType: 'whip_custom',
    server: 'https://example.invalid/twitch',
    twitch: false,
    enhanced: false,
  },
];

for (const destination of destinations) {
  test(`Unprotected destination: ${destination.name}`, t => {
    t.is(isTwitchStreamDestination(destination), destination.twitch);
    t.is(isCommonTwitchService(destination), destination.enhanced);
  });
}
