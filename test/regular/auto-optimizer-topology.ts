import test from 'ava';
import {
  classifyAutoOptimizerTopology,
  isAutoOptimizerProfileCompatible,
} from '../../app/services/auto-config/topology';
import { IAutoOptimizerProfile } from '../../app/services/auto-config/types';
import { IGoLiveSettings } from '../../app/services/streaming';

function settings(patch: Partial<IGoLiveSettings> = {}): IGoLiveSettings {
  return {
    platforms: {},
    customDestinations: [],
    advancedMode: false,
    recording: 'horizontal',
    ...patch,
  } as IGoLiveSettings;
}

test('direct standard Twitch has one direct active probe candidate', t => {
  const topology = classifyAutoOptimizerTopology(
    settings({
      platforms: {
        twitch: { enabled: true, useCustomFields: false } as any,
      },
    }),
    false,
  );

  t.is(topology.type, 'direct-single');
  t.is(topology.legs[0].route, 'direct');
  t.is(topology.legs[0].measurement, 'active');
  t.deepEqual(topology.probeCandidates, [
    {
      probeId: 'horizontal-twitch',
      kind: 'twitch-standard-v1',
      legId: 'horizontal',
      provider: 'twitch',
    },
  ]);
});

test('direct linked YouTube has one direct active probe candidate', t => {
  const topology = classifyAutoOptimizerTopology(
    settings({
      platforms: {
        youtube: { enabled: true, useCustomFields: false } as any,
      },
    }),
    false,
  );

  t.is(topology.type, 'direct-single');
  t.is(topology.legs[0].route, 'direct');
  t.is(topology.legs[0].measurement, 'active');
  t.deepEqual(
    topology.probeCandidates.map(candidate => candidate.provider),
    ['youtube'],
  );
});

test('direct platforms without a safe active probe remain estimate-only', t => {
  const topology = classifyAutoOptimizerTopology(
    settings({
      platforms: {
        facebook: { enabled: true, useCustomFields: false } as any,
      },
    }),
    false,
  );

  t.is(topology.type, 'direct-single');
  t.is(topology.legs[0].route, 'direct');
  t.is(topology.legs[0].measurement, 'estimated');
  t.is(topology.legs[0].estimateReason, 'non_twitch');
  t.is(topology.probeCandidates.length, 0);
});

test('standard Twitch and YouTube share one indirect leg with ordered candidates', t => {
  const topology = classifyAutoOptimizerTopology(
    settings({
      platforms: {
        youtube: { enabled: true, useCustomFields: false } as any,
        twitch: { enabled: true, useCustomFields: false } as any,
      },
    }),
    false,
  );

  t.is(topology.type, 'cloud-multistream');
  t.is(topology.legs.length, 1);
  t.is(topology.legs[0].route, 'cloud-restream');
  t.is(topology.legs[0].measurement, 'active');
  t.deepEqual(
    topology.probeCandidates.map(candidate => candidate.provider),
    ['twitch', 'youtube'],
  );
  t.deepEqual(topology.legs[0].probeCandidates, topology.probeCandidates);
});

test('custom and linked destinations are a mixed estimate-only topology', t => {
  const topology = classifyAutoOptimizerTopology(
    settings({
      platforms: {
        twitch: { enabled: true, useCustomFields: false } as any,
      },
      customDestinations: [{ name: 'Custom', url: 'rtmp://example.invalid/live', enabled: true }],
    }),
    false,
  );

  t.is(topology.type, 'mixed');
  t.is(topology.probeCandidates.length, 0);
  t.is(topology.legs[0].measurement, 'estimated');
  t.deepEqual(
    topology.legs[0].destinations.map(item => item.platform),
    ['twitch', 'custom'],
  );
});

test('dual output produces independent direct probe candidates per destination', t => {
  const topology = classifyAutoOptimizerTopology(
    settings({
      platforms: {
        twitch: { enabled: true, useCustomFields: false, display: 'horizontal' } as any,
        youtube: {
          enabled: true,
          useCustomFields: false,
          display: 'vertical',
        } as any,
      },
    }),
    true,
  );

  t.is(topology.type, 'dual-output');
  t.deepEqual(
    topology.legs.map(leg => leg.display),
    ['horizontal', 'vertical'],
  );
  t.true(topology.legs.every(leg => leg.route === 'direct'));
  t.deepEqual(
    topology.legs.map(leg => leg.probeCandidates.map(candidate => candidate.provider)),
    [['twitch'], ['youtube']],
  );
  t.deepEqual(
    topology.probeCandidates.map(candidate => candidate.probeId),
    ['horizontal-twitch', 'vertical-youtube'],
  );
});

test('Enhanced Broadcasting and Stream Shift can never actively probe', t => {
  const enhanced = classifyAutoOptimizerTopology(
    settings({
      platforms: {
        twitch: {
          enabled: true,
          useCustomFields: false,
          isEnhancedBroadcasting: true,
        } as any,
      },
    }),
    false,
  );
  const streamShift = classifyAutoOptimizerTopology(
    settings({
      platforms: { twitch: { enabled: true, useCustomFields: false } as any },
      streamShift: true,
    }),
    false,
  );

  t.is(enhanced.type, 'enhanced-broadcasting');
  t.is(enhanced.probeCandidates.length, 0);
  t.is(streamShift.type, 'stream-shift');
  t.is(streamShift.probeCandidates.length, 0);
});

test('Twitch dual stream is modeled as its single shared upload connection', t => {
  const topology = classifyAutoOptimizerTopology(
    settings({
      platforms: {
        twitch: {
          enabled: true,
          useCustomFields: false,
          display: 'both',
        } as any,
      },
    }),
    true,
    true,
  );

  t.is(topology.legs.length, 1);
  t.is(topology.legs[0].display, 'both');
  t.is(topology.legs[0].legId, 'twitch-dual');
  t.is(topology.legs[0].route, 'direct');
  t.deepEqual(
    topology.probeCandidates.map(candidate => candidate.provider),
    ['twitch'],
  );
});

test('custom RTMP is never probed even when its URL belongs to YouTube', t => {
  const topology = classifyAutoOptimizerTopology(
    settings({
      customDestinations: [
        {
          name: 'YouTube custom key',
          url: 'rtmps://a.rtmps.youtube.com/live2',
          enabled: true,
        },
      ],
    }),
    false,
  );

  t.is(topology.type, 'custom-rtmp');
  t.is(topology.legs[0].route, 'direct');
  t.is(topology.legs[0].measurement, 'estimated');
  t.is(topology.probeCandidates.length, 0);
});

function profileFor(settingsValue: IGoLiveSettings): IAutoOptimizerProfile {
  const topology = classifyAutoOptimizerTopology(settingsValue, false);
  return {
    schemaVersion: 1,
    topology: topology.type,
    legs: topology.legs.map(leg => ({
      ...leg,
      confidence: 'high',
      resolution: { width: 1280, height: 720 },
      fps: 30,
      bitrate: 6000,
      encoder: { id: 'obs_x264' },
    })),
  };
}

test('an optimizer profile remains compatible when only stream metadata changes', t => {
  const original = settings({
    platforms: {
      twitch: { enabled: true, useCustomFields: false, title: 'Before' } as any,
    },
  });
  const edited = settings({
    platforms: {
      twitch: { enabled: true, useCustomFields: false, title: 'After' } as any,
    },
  });

  t.true(isAutoOptimizerProfileCompatible(profileFor(original), edited, false));
});

test('an optimizer profile is discarded when destinations change in Go Live settings', t => {
  const original = settings({
    platforms: {
      twitch: { enabled: true, useCustomFields: false } as any,
    },
  });
  const edited = settings({
    platforms: {
      youtube: { enabled: true, useCustomFields: false } as any,
    },
  });

  t.false(isAutoOptimizerProfileCompatible(profileFor(original), edited, false));
});
