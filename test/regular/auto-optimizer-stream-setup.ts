import test from 'ava';
import {
  describeAutoOptimizerStreamSetup,
  isAutoOptimizerProfileCompatible,
} from '../../app/services/auto-config/stream-setup';
import {
  IAutoOptimizerProfile,
  IAutoOptimizerStreamSetup,
} from '../../app/services/auto-config/types';
import { autoOptimizerStandardOutputForDisplay } from '../../app/services/streaming/auto-optimizer-profile-policy';
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

function allProbeCandidates(streamSetup: IAutoOptimizerStreamSetup) {
  return streamSetup.outputs.flatMap(output => output.probeCandidates);
}

test('direct standard Twitch has one direct active probe candidate', t => {
  const streamSetup = describeAutoOptimizerStreamSetup(
    settings({
      platforms: {
        twitch: { enabled: true, useCustomFields: false } as any,
      },
    }),
    false,
  );

  t.is(streamSetup.type, 'direct-single');
  t.is(streamSetup.outputs[0].measurement, 'active');
  t.deepEqual(allProbeCandidates(streamSetup), [
    {
      probeId: 'horizontal-twitch',
      kind: 'twitch-standard',
      outputId: 'horizontal',
      platform: 'twitch',
    },
  ]);
});

test('direct linked YouTube has one direct active probe candidate', t => {
  const streamSetup = describeAutoOptimizerStreamSetup(
    settings({
      platforms: {
        youtube: { enabled: true, useCustomFields: false } as any,
      },
    }),
    false,
  );

  t.is(streamSetup.type, 'direct-single');
  t.is(streamSetup.outputs[0].measurement, 'active');
  t.deepEqual(
    allProbeCandidates(streamSetup).map(candidate => candidate.platform),
    ['youtube'],
  );
});

test('direct platforms without a safe active probe remain estimate-only', t => {
  const streamSetup = describeAutoOptimizerStreamSetup(
    settings({
      platforms: {
        facebook: { enabled: true, useCustomFields: false } as any,
      },
    }),
    false,
  );

  t.is(streamSetup.type, 'direct-single');
  t.is(streamSetup.outputs[0].measurement, 'estimated');
  t.is(streamSetup.outputs[0].estimateReason, 'non_twitch');
  t.is(allProbeCandidates(streamSetup).length, 0);
});

test('standard Twitch and YouTube share one cloud output with ordered probe candidates', t => {
  const streamSetup = describeAutoOptimizerStreamSetup(
    settings({
      platforms: {
        youtube: { enabled: true, useCustomFields: false } as any,
        twitch: { enabled: true, useCustomFields: false } as any,
      },
    }),
    false,
  );

  t.is(streamSetup.type, 'cloud-multistream');
  t.is(streamSetup.outputs.length, 1);
  t.is(streamSetup.outputs[0].measurement, 'active');
  t.deepEqual(
    allProbeCandidates(streamSetup).map(candidate => candidate.platform),
    ['twitch', 'youtube'],
  );
});

test('custom and linked destinations share one mixed setup that remains estimate-only', t => {
  const streamSetup = describeAutoOptimizerStreamSetup(
    settings({
      platforms: {
        twitch: { enabled: true, useCustomFields: false } as any,
      },
      customDestinations: [{ name: 'Custom', url: 'rtmp://example.invalid/live', enabled: true }],
    }),
    false,
  );

  t.is(streamSetup.type, 'mixed');
  t.is(allProbeCandidates(streamSetup).length, 0);
  t.is(streamSetup.outputs[0].measurement, 'estimated');
  t.deepEqual(
    streamSetup.outputs[0].destinations.map(item => item.platform),
    ['twitch', 'custom'],
  );
});

test('dual output produces independent direct probe candidates per destination', t => {
  const streamSetup = describeAutoOptimizerStreamSetup(
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

  t.is(streamSetup.type, 'dual-output');
  t.deepEqual(
    streamSetup.outputs.map(output => output.display),
    ['horizontal', 'vertical'],
  );
  t.deepEqual(
    streamSetup.outputs.map(output => output.probeCandidates.map(candidate => candidate.platform)),
    [['twitch'], ['youtube']],
  );
  t.deepEqual(
    allProbeCandidates(streamSetup).map(candidate => candidate.probeId),
    ['horizontal-twitch', 'vertical-youtube'],
  );
});

test('dual output keeps supported probe candidates when another platform shares a canvas', t => {
  const streamSetup = describeAutoOptimizerStreamSetup(
    settings({
      platforms: {
        twitch: { enabled: true, useCustomFields: false, display: 'horizontal' } as any,
        kick: { enabled: true, useCustomFields: false, display: 'horizontal' } as any,
        youtube: { enabled: true, useCustomFields: false, display: 'vertical' } as any,
      },
    }),
    true,
  );

  t.is(streamSetup.type, 'dual-output');
  t.deepEqual(
    streamSetup.outputs.map(output => ({
      display: output.display,
      destinations: output.destinations.map(destination => destination.platform),
      probes: output.probeCandidates.map(candidate => candidate.platform),
    })),
    [
      {
        display: 'horizontal',
        destinations: ['twitch', 'kick'],
        probes: ['twitch'],
      },
      {
        display: 'vertical',
        destinations: ['youtube'],
        probes: ['youtube'],
      },
    ],
  );
});

test('single-canvas Twitch-only Enhanced Broadcasting has its dedicated active probe', t => {
  const enhanced = describeAutoOptimizerStreamSetup(
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
  t.deepEqual(allProbeCandidates(enhanced), [
    {
      probeId: 'horizontal-twitch',
      kind: 'twitch-enhanced-broadcasting',
      outputId: 'horizontal',
      platform: 'twitch',
    },
  ]);
  t.is(enhanced.outputs[0].measurement, 'active');
});

test('Enhanced Broadcasting with another destination remains estimate-only', t => {
  const enhancedWithYoutube = describeAutoOptimizerStreamSetup(
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

  t.is(enhancedWithYoutube.type, 'enhanced-broadcasting');
  t.is(allProbeCandidates(enhancedWithYoutube).length, 0);
  t.is(enhancedWithYoutube.outputs[0].estimateReason, 'enhanced_broadcasting');
});

test('Stream Shift uses a regular Twitch probe and ignores the saved Enhanced Broadcasting preference', t => {
  const streamSetup = describeAutoOptimizerStreamSetup(
    settings({
      platforms: {
        twitch: {
          enabled: true,
          useCustomFields: false,
          isEnhancedBroadcasting: true,
        } as any,
      },
      streamShift: true,
      enhancedBroadcasting: true,
    }),
    false,
  );

  t.is(streamSetup.type, 'direct-single');
  t.is(streamSetup.outputs[0].outputKind, 'standard');
  t.is(streamSetup.outputs[0].measurement, 'active');
  t.deepEqual(allProbeCandidates(streamSetup), [
    {
      probeId: 'horizontal-twitch',
      kind: 'twitch-standard',
      outputId: 'horizontal',
      platform: 'twitch',
    },
  ]);
});

test('Stream Shift uses the same platform bandwidth probes as an ordinary stream', t => {
  const ordinarySettings = settings({
    platforms: {
      twitch: { enabled: true, useCustomFields: false } as any,
      youtube: { enabled: true, useCustomFields: false } as any,
    },
  });
  const ordinary = describeAutoOptimizerStreamSetup(ordinarySettings, false);
  const streamShift = describeAutoOptimizerStreamSetup(
    { ...ordinarySettings, streamShift: true },
    false,
  );

  t.deepEqual(streamShift, ordinary);
  t.is(streamShift.type, 'cloud-multistream');
  t.deepEqual(
    allProbeCandidates(streamShift).map(candidate => candidate.platform),
    ['twitch', 'youtube'],
  );
});

test('Enhanced Broadcasting under Dual Output remains estimate-only', t => {
  const streamSetup = describeAutoOptimizerStreamSetup(
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

  t.is(streamSetup.type, 'enhanced-broadcasting');
  t.deepEqual(allProbeCandidates(streamSetup), []);
  t.true(streamSetup.outputs.every(output => output.measurement === 'estimated'));
});

test('paired Enhanced Broadcasting with a horizontal companion models both real outputs', t => {
  const streamSetup = describeAutoOptimizerStreamSetup(
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

  t.is(streamSetup.type, 'enhanced-broadcasting-dual-output');
  t.deepEqual(
    streamSetup.outputs.map(output => ({
      outputId: output.outputId,
      display: output.display,
      outputKind: output.outputKind,
      destinations: output.destinations.map(destination => destination.platform),
      probes: output.probeCandidates.map(candidate => candidate.platform),
    })),
    [
      {
        outputId: 'twitch-enhanced-broadcasting',
        display: 'both',
        outputKind: 'twitch-enhanced-broadcasting',
        destinations: ['twitch'],
        probes: ['twitch'],
      },
      {
        outputId: 'horizontal-standard',
        display: 'horizontal',
        outputKind: 'standard',
        destinations: ['youtube'],
        probes: ['youtube'],
      },
    ],
  );
  t.deepEqual(
    allProbeCandidates(streamSetup).map(candidate => candidate.probeId),
    ['twitch-enhanced-broadcasting-twitch', 'horizontal-standard-youtube'],
  );
});

test('paired Enhanced Broadcasting with a vertical companion preserves orientation', t => {
  const streamSetup = describeAutoOptimizerStreamSetup(
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

  t.is(streamSetup.type, 'enhanced-broadcasting-dual-output');
  t.deepEqual(
    streamSetup.outputs.map(output => [output.outputId, output.display, output.outputKind]),
    [
      ['twitch-enhanced-broadcasting', 'both', 'twitch-enhanced-broadcasting'],
      ['vertical-standard', 'vertical', 'standard'],
    ],
  );
  t.deepEqual(
    allProbeCandidates(streamSetup).map(candidate => candidate.probeId),
    ['twitch-enhanced-broadcasting-twitch', 'vertical-standard-youtube'],
  );
});

test('paired Enhanced Broadcasting creates one standard output per occupied companion canvas', t => {
  const streamSetup = describeAutoOptimizerStreamSetup(
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

  t.is(streamSetup.type, 'enhanced-broadcasting-dual-output');
  t.deepEqual(
    streamSetup.outputs.map(output => [output.outputId, output.display, output.outputKind]),
    [
      ['twitch-enhanced-broadcasting', 'both', 'twitch-enhanced-broadcasting'],
      ['horizontal-standard', 'horizontal', 'standard'],
      ['vertical-standard', 'vertical', 'standard'],
    ],
  );
  t.deepEqual(
    allProbeCandidates(streamSetup).map(candidate => candidate.probeId),
    [
      'twitch-enhanced-broadcasting-twitch',
      'horizontal-standard-youtube',
      'vertical-standard-youtube',
    ],
  );
});

test('co-destinations share one companion output and only YouTube represents its bandwidth probe', t => {
  const streamSetup = describeAutoOptimizerStreamSetup(
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

  const companionOutputs = streamSetup.outputs.filter(output => output.outputKind === 'standard');
  t.is(streamSetup.type, 'enhanced-broadcasting-dual-output');
  t.is(companionOutputs.length, 1);
  t.deepEqual(
    companionOutputs[0].destinations.map(destination => destination.platform),
    ['youtube', 'kick'],
  );
  t.deepEqual(
    companionOutputs[0].probeCandidates.map(candidate => candidate.platform),
    ['youtube'],
  );
});

test('Twitch Dual Stream uses one Enhanced Broadcasting connection for both canvases', t => {
  const streamSetup = describeAutoOptimizerStreamSetup(
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

  t.is(streamSetup.type, 'enhanced-broadcasting');
  t.is(streamSetup.outputs.length, 1);
  t.is(streamSetup.outputs[0].display, 'both');
  t.is(streamSetup.outputs[0].outputId, 'twitch-dual');
  t.deepEqual(allProbeCandidates(streamSetup), [
    {
      probeId: 'twitch-dual-twitch',
      kind: 'twitch-enhanced-broadcasting',
      outputId: 'twitch-dual',
      platform: 'twitch',
    },
  ]);
  t.is(streamSetup.outputs[0].measurement, 'active');
});

test('Twitch custom fields keep single and paired Enhanced Broadcasting estimate-only', t => {
  const single = describeAutoOptimizerStreamSetup(
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
  const paired = describeAutoOptimizerStreamSetup(
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
  t.deepEqual(allProbeCandidates(single), []);
  t.is(single.outputs[0].measurement, 'estimated');
  t.is(paired.type, 'enhanced-broadcasting');
  t.deepEqual(allProbeCandidates(paired), []);
  t.is(paired.outputs[0].measurement, 'estimated');
});

test('custom RTMP is never probed even when its URL belongs to YouTube', t => {
  const streamSetup = describeAutoOptimizerStreamSetup(
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

  t.is(streamSetup.type, 'custom-rtmp');
  t.is(streamSetup.outputs[0].measurement, 'estimated');
  t.is(allProbeCandidates(streamSetup).length, 0);
});

function profileFor(settingsValue: IGoLiveSettings): IAutoOptimizerProfile {
  const streamSetup = describeAutoOptimizerStreamSetup(settingsValue, false);
  return {
    schemaVersion: 1,
    streamSetup: streamSetup.type,
    outputs: streamSetup.outputs.map(output => ({
      ...output,
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

test('an optimizer profile remains compatible when Stream Shift is toggled', t => {
  const ordinary = settings({
    platforms: {
      twitch: { enabled: true, useCustomFields: false } as any,
    },
  });
  const streamShift = { ...ordinary, streamShift: true };

  t.true(isAutoOptimizerProfileCompatible(profileFor(ordinary), streamShift, false));
  t.true(isAutoOptimizerProfileCompatible(profileFor(streamShift), ordinary, false));
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

test('ordinary output contexts select only matching standard outputs from mixed Enhanced Broadcasting', t => {
  const common = {
    measurement: 'active' as const,
    confidence: 'high' as const,
    resolution: { width: 1920, height: 1080 },
    fpsNum: 60,
    fpsDen: 1,
    fps: 60,
    bitrate: 6000,
  };
  const enhancedOutput: IAutoOptimizerProfile['outputs'][number] = {
    ...common,
    outputId: 'twitch-enhanced-broadcasting',
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
  const horizontalOutput: IAutoOptimizerProfile['outputs'][number] = {
    ...common,
    outputId: 'horizontal-standard',
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
  const verticalOutput: IAutoOptimizerProfile['outputs'][number] = {
    ...horizontalOutput,
    outputId: 'vertical-standard',
    display: 'vertical',
    resolution: { width: 1080, height: 1920 },
  };
  const profile: IAutoOptimizerProfile = {
    schemaVersion: 1,
    streamSetup: 'enhanced-broadcasting-dual-output',
    // Place the Twitch Enhanced Broadcasting output between the standard
    // outputs to verify that lookup uses output kind rather than array position.
    outputs: [horizontalOutput, enhancedOutput, verticalOutput],
  };

  t.is(autoOptimizerStandardOutputForDisplay(profile, 'horizontal'), horizontalOutput);
  t.is(autoOptimizerStandardOutputForDisplay(profile, 'vertical'), verticalOutput);
  t.is(
    autoOptimizerStandardOutputForDisplay(
      { ...profile, outputs: [enhancedOutput, verticalOutput] },
      'horizontal',
    ),
    undefined,
    'the Twitch-managed both output must never stand in for a standard output',
  );

  const twitchManagedOnly: IAutoOptimizerProfile = {
    schemaVersion: 1,
    streamSetup: 'enhanced-broadcasting',
    outputs: [enhancedOutput],
  };
  t.is(autoOptimizerStandardOutputForDisplay(twitchManagedOnly, 'horizontal'), undefined);
  t.is(autoOptimizerStandardOutputForDisplay(twitchManagedOnly, 'vertical'), undefined);
});
