import test from 'ava';
import {
  classifyAutoOptimizerTopology,
  isAutoOptimizerProfileCompatible,
} from '../../app/services/auto-config/topology';
import { IAutoOptimizerProfile } from '../../app/services/auto-config/types';
import { autoOptimizerStandardLegForDisplay } from '../../app/services/streaming/auto-optimizer-profile-policy';
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
      kind: 'twitch-standard',
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

test('dual output keeps supported probe candidates when another platform shares a canvas', t => {
  const topology = classifyAutoOptimizerTopology(
    settings({
      platforms: {
        twitch: { enabled: true, useCustomFields: false, display: 'horizontal' } as any,
        kick: { enabled: true, useCustomFields: false, display: 'horizontal' } as any,
        youtube: { enabled: true, useCustomFields: false, display: 'vertical' } as any,
      },
    }),
    true,
  );

  t.is(topology.type, 'dual-output');
  t.deepEqual(
    topology.legs.map(leg => ({
      display: leg.display,
      route: leg.route,
      destinations: leg.destinations.map(destination => destination.platform),
      probes: leg.probeCandidates.map(candidate => candidate.provider),
    })),
    [
      {
        display: 'horizontal',
        route: 'cloud-restream',
        destinations: ['twitch', 'kick'],
        probes: ['twitch'],
      },
      {
        display: 'vertical',
        route: 'direct',
        destinations: ['youtube'],
        probes: ['youtube'],
      },
    ],
  );
});

test('single-canvas Twitch-only Enhanced Broadcasting has its dedicated active probe', t => {
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

  t.is(enhanced.type, 'enhanced-broadcasting');
  t.deepEqual(enhanced.probeCandidates, [
    {
      probeId: 'horizontal-twitch',
      kind: 'twitch-enhanced-broadcasting',
      legId: 'horizontal',
      provider: 'twitch',
    },
  ]);
  t.is(enhanced.legs[0].measurement, 'active');
});

test('Enhanced Broadcasting with another destination and Stream Shift remain estimate-only', t => {
  const enhancedWithYoutube = classifyAutoOptimizerTopology(
    settings({
      platforms: {
        twitch: {
          enabled: true,
          useCustomFields: false,
          isEnhancedBroadcasting: true,
        } as any,
        youtube: { enabled: true, useCustomFields: false } as any,
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
  const enhancedWithStreamShift = classifyAutoOptimizerTopology(
    settings({
      platforms: {
        twitch: {
          enabled: true,
          useCustomFields: false,
          isEnhancedBroadcasting: true,
        } as any,
      },
      streamShift: true,
    }),
    false,
  );

  t.is(enhancedWithYoutube.type, 'enhanced-broadcasting');
  t.is(enhancedWithYoutube.probeCandidates.length, 0);
  t.is(enhancedWithYoutube.legs[0].estimateReason, 'enhanced_broadcasting');
  t.is(streamShift.type, 'stream-shift');
  t.is(streamShift.probeCandidates.length, 0);
  t.is(enhancedWithStreamShift.type, 'enhanced-broadcasting');
  t.is(enhancedWithStreamShift.probeCandidates.length, 0);
  t.is(enhancedWithStreamShift.legs[0].measurement, 'estimated');
});

test('Enhanced Broadcasting under Dual Output remains estimate-only', t => {
  const topology = classifyAutoOptimizerTopology(
    settings({
      platforms: {
        twitch: {
          enabled: true,
          useCustomFields: false,
          isEnhancedBroadcasting: true,
          display: 'horizontal',
        } as any,
      },
    }),
    true,
  );

  t.is(topology.type, 'enhanced-broadcasting');
  t.deepEqual(topology.probeCandidates, []);
  t.true(topology.legs.every(leg => leg.measurement === 'estimated'));
});

test('paired Enhanced Broadcasting with a horizontal companion models both real outputs', t => {
  const topology = classifyAutoOptimizerTopology(
    settings({
      platforms: {
        twitch: {
          enabled: true,
          useCustomFields: false,
          isEnhancedBroadcasting: true,
          display: 'both',
        } as any,
        youtube: {
          enabled: true,
          useCustomFields: false,
          display: 'horizontal',
        } as any,
      },
    }),
    true,
    true,
  );

  t.is(topology.type, 'enhanced-broadcasting-dual-output');
  t.deepEqual(
    topology.legs.map(leg => ({
      legId: leg.legId,
      display: leg.display,
      outputKind: leg.outputKind,
      destinations: leg.destinations.map(destination => destination.platform),
      probes: leg.probeCandidates.map(candidate => candidate.provider),
    })),
    [
      {
        legId: 'twitch-enhanced-broadcasting',
        display: 'both',
        outputKind: 'twitch-enhanced-broadcasting',
        destinations: ['twitch'],
        probes: ['twitch'],
      },
      {
        legId: 'horizontal-standard',
        display: 'horizontal',
        outputKind: 'standard',
        destinations: ['youtube'],
        probes: ['youtube'],
      },
    ],
  );
  t.deepEqual(
    topology.probeCandidates.map(candidate => candidate.probeId),
    ['twitch-enhanced-broadcasting-twitch', 'horizontal-standard-youtube'],
  );
});

test('paired Enhanced Broadcasting with a vertical companion preserves orientation', t => {
  const topology = classifyAutoOptimizerTopology(
    settings({
      platforms: {
        twitch: {
          enabled: true,
          useCustomFields: false,
          isEnhancedBroadcasting: true,
          display: 'both',
        } as any,
        youtube: {
          enabled: true,
          useCustomFields: false,
          display: 'vertical',
        } as any,
      },
    }),
    true,
    true,
  );

  t.is(topology.type, 'enhanced-broadcasting-dual-output');
  t.deepEqual(
    topology.legs.map(leg => [leg.legId, leg.display, leg.outputKind]),
    [
      ['twitch-enhanced-broadcasting', 'both', 'twitch-enhanced-broadcasting'],
      ['vertical-standard', 'vertical', 'standard'],
    ],
  );
  t.deepEqual(
    topology.probeCandidates.map(candidate => candidate.probeId),
    ['twitch-enhanced-broadcasting-twitch', 'vertical-standard-youtube'],
  );
});

test('paired Enhanced Broadcasting creates one standard output per occupied companion canvas', t => {
  const topology = classifyAutoOptimizerTopology(
    settings({
      platforms: {
        twitch: {
          enabled: true,
          useCustomFields: false,
          isEnhancedBroadcasting: true,
          display: 'both',
        } as any,
        youtube: {
          enabled: true,
          useCustomFields: false,
          display: 'both',
        } as any,
      },
    }),
    true,
    true,
  );

  t.is(topology.type, 'enhanced-broadcasting-dual-output');
  t.deepEqual(
    topology.legs.map(leg => [leg.legId, leg.display, leg.outputKind]),
    [
      ['twitch-enhanced-broadcasting', 'both', 'twitch-enhanced-broadcasting'],
      ['horizontal-standard', 'horizontal', 'standard'],
      ['vertical-standard', 'vertical', 'standard'],
    ],
  );
  t.deepEqual(
    topology.probeCandidates.map(candidate => candidate.probeId),
    [
      'twitch-enhanced-broadcasting-twitch',
      'horizontal-standard-youtube',
      'vertical-standard-youtube',
    ],
  );
});

test('co-destinations share one companion output and only YouTube represents its bandwidth probe', t => {
  const topology = classifyAutoOptimizerTopology(
    settings({
      platforms: {
        twitch: {
          enabled: true,
          useCustomFields: false,
          isEnhancedBroadcasting: true,
          display: 'both',
        } as any,
        youtube: {
          enabled: true,
          useCustomFields: false,
          display: 'horizontal',
        } as any,
        kick: {
          enabled: true,
          useCustomFields: false,
          display: 'horizontal',
        } as any,
      },
    }),
    true,
    true,
  );

  const companionLegs = topology.legs.filter(leg => leg.outputKind === 'standard');
  t.is(topology.type, 'enhanced-broadcasting-dual-output');
  t.is(companionLegs.length, 1);
  t.deepEqual(
    companionLegs[0].destinations.map(destination => destination.platform),
    ['youtube', 'kick'],
  );
  t.deepEqual(
    companionLegs[0].probeCandidates.map(candidate => candidate.provider),
    ['youtube'],
  );
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

  t.is(topology.type, 'enhanced-broadcasting');
  t.is(topology.legs.length, 1);
  t.is(topology.legs[0].display, 'both');
  t.is(topology.legs[0].legId, 'twitch-dual');
  t.is(topology.legs[0].route, 'direct');
  t.deepEqual(topology.probeCandidates, [
    {
      probeId: 'twitch-dual-twitch',
      kind: 'twitch-enhanced-broadcasting',
      legId: 'twitch-dual',
      provider: 'twitch',
    },
  ]);
  t.is(topology.legs[0].measurement, 'active');
});

test('Twitch custom fields keep single and paired Enhanced Broadcasting estimate-only', t => {
  const single = classifyAutoOptimizerTopology(
    settings({
      platforms: {
        twitch: {
          enabled: true,
          useCustomFields: true,
          isEnhancedBroadcasting: true,
        } as any,
      },
    }),
    false,
  );
  const paired = classifyAutoOptimizerTopology(
    settings({
      platforms: {
        twitch: {
          enabled: true,
          useCustomFields: true,
          display: 'both',
          isEnhancedBroadcasting: true,
        } as any,
      },
    }),
    true,
    true,
  );

  t.is(single.type, 'enhanced-broadcasting');
  t.deepEqual(single.probeCandidates, []);
  t.is(single.legs[0].measurement, 'estimated');
  t.is(paired.type, 'enhanced-broadcasting');
  t.deepEqual(paired.probeCandidates, []);
  t.is(paired.legs[0].measurement, 'estimated');
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
      fpsNum: 30,
      fpsDen: 1,
      fps: 30,
      bitrate: 6000,
      encoder: {
        id: 'obs_x264',
        family: 'x264',
        title: 'Software (x264)',
        codec: 'h264',
        preset: 'veryfast',
      },
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

test('ordinary output contexts select only matching standard legs from mixed Enhanced Broadcasting', t => {
  const common = {
    measurement: 'active' as const,
    confidence: 'high' as const,
    resolution: { width: 1920, height: 1080 },
    fpsNum: 60,
    fpsDen: 1,
    fps: 60,
    bitrate: 6000,
  };
  const enhancedLeg: IAutoOptimizerProfile['legs'][number] = {
    ...common,
    legId: 'twitch-enhanced-broadcasting',
    display: 'both',
    outputKind: 'twitch-enhanced-broadcasting',
    destinations: [{ platform: 'twitch' }],
    additionalVideo: {
      display: 'vertical',
      resolution: { width: 1080, height: 1920 },
      fpsNum: 60,
      fpsDen: 1,
      fps: 60,
    },
  };
  const horizontalLeg: IAutoOptimizerProfile['legs'][number] = {
    ...common,
    legId: 'horizontal-standard',
    display: 'horizontal',
    outputKind: 'standard',
    destinations: [{ platform: 'youtube' }],
    encoder: {
      id: 'obs_nvenc_h264_tex',
      family: 'obs_nvenc_h264_tex',
      title: 'NVIDIA NVENC H.264',
      codec: 'h264',
      preset: 'p5',
    },
  };
  const verticalLeg: IAutoOptimizerProfile['legs'][number] = {
    ...horizontalLeg,
    legId: 'vertical-standard',
    display: 'vertical',
    resolution: { width: 1080, height: 1920 },
  };
  const profile: IAutoOptimizerProfile = {
    schemaVersion: 1,
    topology: 'enhanced-broadcasting-dual-output',
    // Keep the provider-managed leg between the standard legs to prove the
    // lookup is role-aware rather than relying on array position.
    legs: [horizontalLeg, enhancedLeg, verticalLeg],
  };

  t.is(autoOptimizerStandardLegForDisplay(profile, 'horizontal'), horizontalLeg);
  t.is(autoOptimizerStandardLegForDisplay(profile, 'vertical'), verticalLeg);
  t.is(
    autoOptimizerStandardLegForDisplay(
      { ...profile, legs: [enhancedLeg, verticalLeg] },
      'horizontal',
    ),
    undefined,
    'the provider-managed both leg must never stand in for a standard output',
  );

  const providerOnly: IAutoOptimizerProfile = {
    schemaVersion: 1,
    topology: 'enhanced-broadcasting',
    legs: [enhancedLeg],
  };
  t.is(autoOptimizerStandardLegForDisplay(providerOnly, 'horizontal'), undefined);
  t.is(autoOptimizerStandardLegForDisplay(providerOnly, 'vertical'), undefined);
});
