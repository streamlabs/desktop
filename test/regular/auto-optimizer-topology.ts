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

test('only direct standard Twitch is eligible for an active bandwidth test', t => {
  const topology = classifyAutoOptimizerTopology(
    settings({
      platforms: {
        twitch: { enabled: true, useCustomFields: false } as any,
      },
    }),
    false,
  );

  t.is(topology.type, 'direct-single');
  t.true(topology.activeBandwidthTest);
  t.is(topology.legs[0].measurement, 'active');
});

test('direct non-Twitch platforms are estimate-only', t => {
  const topology = classifyAutoOptimizerTopology(
    settings({
      platforms: {
        youtube: { enabled: true, useCustomFields: false } as any,
      },
    }),
    false,
  );

  t.is(topology.type, 'direct-single');
  t.false(topology.activeBandwidthTest);
  t.is(topology.legs[0].estimateReason, 'non_twitch');
});

test('custom and linked destinations are a mixed estimate-only topology', t => {
  const topology = classifyAutoOptimizerTopology(
    settings({
      platforms: {
        twitch: { enabled: true, useCustomFields: false } as any,
      },
      customDestinations: [
        { name: 'Custom', url: 'rtmp://example.invalid/live', enabled: true },
      ],
    }),
    false,
  );

  t.is(topology.type, 'mixed');
  t.false(topology.activeBandwidthTest);
  t.deepEqual(
    topology.legs[0].destinations.map(item => item.platform),
    ['twitch', 'custom'],
  );
});

test('dual output produces independent estimate-only upload legs', t => {
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
  t.false(topology.activeBandwidthTest);
  t.deepEqual(
    topology.legs.map(leg => leg.display),
    ['horizontal', 'vertical'],
  );
  t.true(topology.legs.every(leg => leg.measurement === 'estimated'));
});

test('Enhanced Broadcasting and Stream Shift can never actively probe', t => {
  const enhanced = classifyAutoOptimizerTopology(
    settings({
      platforms: {
        twitch: ({
          enabled: true,
          useCustomFields: false,
          isEnhancedBroadcasting: true,
        } as any),
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
  t.false(enhanced.activeBandwidthTest);
  t.is(streamShift.type, 'stream-shift');
  t.false(streamShift.activeBandwidthTest);
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
  t.false(topology.activeBandwidthTest);
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
