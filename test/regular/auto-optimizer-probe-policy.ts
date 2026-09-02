import test from 'ava';
import {
  areAutoConfigActiveCanvasIdentitiesValid,
  autoConfigProbeCoverage,
  autoConfigPhaseStepDisposition,
  autoConfigPhaseStepKey,
  credentialFreeAutoConfigRequestOutput,
  filterAutoConfigStreamSetupProbes,
  isEligibleAutoConfigDualOutputActiveStreamSetup,
  isEligibleAutoConfigEnhancedBroadcastingDualOutputStreamSetup,
  isValidAutoConfigActiveProbeCoverage,
  sanitizeAutoConfigProgressDetail,
  sanitizeAutoConfigProbeEvidence,
  sanitizeAutoConfigProbeTargetBitrateKbps,
  supportedAutoConfigProbeKinds,
} from '../../app/services/auto-config/probe-policy';
import {
  IAutoConfigEvent,
  IAutoConfigRequestOutput,
  IAutoOptimizerStreamSetup,
  TAutoOptimizerProbeKind,
} from '../../app/services/auto-config/types';

test('retained attempt context contains no provider credentials', t => {
  const retained = credentialFreeAutoConfigRequestOutput({
    outputId: 'horizontal',
    display: 'horizontal',
    outputKind: 'standard',
    destinations: ['youtube'],
    current: {
      canvasId: 0,
      width: 1280,
      height: 720,
      fpsNum: 30,
      fpsDen: 1,
      bitrateKbps: 3000,
      encoderId: 'obs_nvenc_h264_tex',
      preset: 'p5',
    },
    limits: { maxBitrateKbps: 8000 },
    estimateReason: 'partial_provider_probes',
    probes: [
      {
        id: 'youtube-probe',
        kind: 'youtube-unbound',
        server: 'rtmp://example.test',
        streamKey: 'secret-key',
      },
    ],
  } as IAutoConfigRequestOutput);

  t.false('probes' in retained);
  const serialized = JSON.stringify(retained);
  t.false(serialized.includes('streamKey'));
  t.false(serialized.includes('server'));
  t.false(serialized.includes('secret-key'));
  t.is(retained.current.canvasId, 0);
  t.deepEqual(retained.destinations, ['youtube']);
});

function allProbeCandidates(streamSetup: IAutoOptimizerStreamSetup) {
  return streamSetup.outputs.flatMap(output => output.probeCandidates);
}

test('zero-based paired Enhanced Broadcasting canvas identities reach native preparation', t => {
  t.true(areAutoConfigActiveCanvasIdentitiesValid(0, 1, true));
  t.true(areAutoConfigActiveCanvasIdentitiesValid(0, undefined, false));

  t.false(areAutoConfigActiveCanvasIdentitiesValid(undefined, 1, true));
  t.false(areAutoConfigActiveCanvasIdentitiesValid(0, undefined, true));
  t.false(areAutoConfigActiveCanvasIdentitiesValid(-1, 1, true));
  t.false(areAutoConfigActiveCanvasIdentitiesValid(0, -1, true));
  t.false(areAutoConfigActiveCanvasIdentitiesValid(0.5, 1, true));
  t.false(areAutoConfigActiveCanvasIdentitiesValid(0, 1.5, true));
  t.false(areAutoConfigActiveCanvasIdentitiesValid(0, 0, true));
  t.false(areAutoConfigActiveCanvasIdentitiesValid(Number.MAX_SAFE_INTEGER + 1, undefined, false));
});

function twitchYoutubeDualOutputStreamSetup(): IAutoOptimizerStreamSetup {
  const outputs = ['twitch', 'youtube'].map((provider, index) => ({
    outputId: index ? 'vertical' : 'horizontal',
    display: index ? ('vertical' as const) : ('horizontal' as const),
    outputKind: 'standard' as const,
    destinations: [{ platform: provider as 'twitch' | 'youtube' }],
    probeCandidates: [
      {
        probeId: `${index ? 'vertical' : 'horizontal'}-${provider}`,
        kind: provider === 'twitch' ? ('twitch-standard' as const) : ('youtube-unbound' as const),
        outputId: index ? 'vertical' : 'horizontal',
        provider: provider as 'twitch' | 'youtube',
      },
    ],
    measurement: 'active' as const,
  }));
  return {
    type: 'dual-output',
    outputs,
  };
}

function twitchKickYoutubeDualOutputStreamSetup(): IAutoOptimizerStreamSetup {
  const streamSetup = twitchYoutubeDualOutputStreamSetup();
  streamSetup.outputs[0].destinations.push({ platform: 'kick' });
  return streamSetup;
}

function sharedCloudStreamSetup(): IAutoOptimizerStreamSetup {
  const probeCandidates = [
    {
      probeId: 'horizontal-twitch',
      kind: 'twitch-standard' as const,
      outputId: 'horizontal',
      provider: 'twitch' as const,
    },
    {
      probeId: 'horizontal-youtube',
      kind: 'youtube-unbound' as const,
      outputId: 'horizontal',
      provider: 'youtube' as const,
    },
  ];
  return {
    type: 'cloud-multistream',
    outputs: [
      {
        outputId: 'horizontal',
        display: 'horizontal',
        outputKind: 'standard',
        destinations: [{ platform: 'twitch' }, { platform: 'youtube' }],
        probeCandidates,
        measurement: 'active',
      },
    ],
  };
}

function enhancedBroadcastingDualOutputStreamSetup(): IAutoOptimizerStreamSetup {
  const enhancedCandidate = {
    probeId: 'twitch-enhanced-broadcasting-twitch',
    kind: 'twitch-enhanced-broadcasting' as const,
    outputId: 'twitch-enhanced-broadcasting',
    provider: 'twitch' as const,
  };
  const youtubeCandidate = {
    probeId: 'horizontal-standard-youtube',
    kind: 'youtube-unbound' as const,
    outputId: 'horizontal-standard',
    provider: 'youtube' as const,
  };
  return {
    type: 'enhanced-broadcasting-dual-output',
    outputs: [
      {
        outputId: 'twitch-enhanced-broadcasting',
        display: 'both',
        outputKind: 'twitch-enhanced-broadcasting',
        destinations: [{ platform: 'twitch' }],
        probeCandidates: [enhancedCandidate],
        measurement: 'active',
      },
      {
        outputId: 'horizontal-standard',
        display: 'horizontal',
        outputKind: 'standard',
        destinations: [{ platform: 'youtube' }, { platform: 'kick' }],
        probeCandidates: [youtubeCandidate],
        measurement: 'active',
      },
    ],
  };
}

test('the paired native facade supports every V1 probe kind', t => {
  t.deepEqual(
    [...supportedAutoConfigProbeKinds()],
    ['twitch-standard', 'twitch-enhanced-broadcasting', 'youtube-unbound'],
  );
});

test('a shared cloud output retains the supported provider when another is unavailable', t => {
  const streamSetup = sharedCloudStreamSetup();
  const filtered = filterAutoConfigStreamSetupProbes(
    streamSetup,
    new Set<TAutoOptimizerProbeKind>(['twitch-standard']),
  );

  t.is(filtered.outputs[0].measurement, 'active');
  t.is(filtered.outputs[0].estimateReason, 'partial_provider_probes');
  t.deepEqual(
    filtered.outputs[0].probeCandidates.map(candidate => candidate.provider),
    ['twitch'],
  );
  t.deepEqual(
    allProbeCandidates(filtered).map(candidate => candidate.provider),
    ['twitch'],
  );
  t.is(streamSetup.outputs[0].measurement, 'active', 'the classifier output is not mutated');
  t.is(allProbeCandidates(streamSetup).length, 2);
});

test('Enhanced Broadcasting requires its exact supported probe kind', t => {
  const candidate = {
    probeId: 'horizontal-twitch',
    kind: 'twitch-enhanced-broadcasting' as const,
    outputId: 'horizontal',
    provider: 'twitch' as const,
  };
  const streamSetup: IAutoOptimizerStreamSetup = {
    type: 'enhanced-broadcasting',
    outputs: [
      {
        outputId: 'horizontal',
        display: 'horizontal',
        outputKind: 'twitch-enhanced-broadcasting',
        destinations: [{ platform: 'twitch' }],
        probeCandidates: [candidate],
        measurement: 'active',
      },
    ],
  };

  const standardOnly = filterAutoConfigStreamSetupProbes(
    streamSetup,
    new Set<TAutoOptimizerProbeKind>(['twitch-standard']),
  );
  t.is(standardOnly.outputs[0].measurement, 'estimated');
  t.deepEqual(allProbeCandidates(standardOnly), []);

  const enhanced = filterAutoConfigStreamSetupProbes(
    streamSetup,
    new Set<TAutoOptimizerProbeKind>(['twitch-enhanced-broadcasting']),
  );
  t.is(enhanced.outputs[0].measurement, 'active');
  t.deepEqual(allProbeCandidates(enhanced), [candidate]);
});

test('mixed Enhanced Broadcasting keeps only its Twitch and YouTube representatives', t => {
  const streamSetup = enhancedBroadcastingDualOutputStreamSetup();
  t.true(isEligibleAutoConfigEnhancedBroadcastingDualOutputStreamSetup(streamSetup));

  const filtered = filterAutoConfigStreamSetupProbes(
    streamSetup,
    new Set<TAutoOptimizerProbeKind>(['twitch-enhanced-broadcasting', 'youtube-unbound']),
  );

  t.true(isEligibleAutoConfigEnhancedBroadcastingDualOutputStreamSetup(filtered));
  t.deepEqual(
    filtered.outputs.map(output => ({
      outputKind: output.outputKind,
      destinations: output.destinations.map(destination => destination.platform),
      providers: output.probeCandidates.map(candidate => candidate.provider),
      measurement: output.measurement,
    })),
    [
      {
        outputKind: 'twitch-enhanced-broadcasting',
        destinations: ['twitch'],
        providers: ['twitch'],
        measurement: 'active',
      },
      {
        outputKind: 'standard',
        destinations: ['youtube', 'kick'],
        providers: ['youtube'],
        measurement: 'active',
      },
    ],
  );
});

test('mixed Enhanced Broadcasting becomes fully estimate-only without its Twitch probe', t => {
  const streamSetup = enhancedBroadcastingDualOutputStreamSetup();
  const missingTwitchMode = filterAutoConfigStreamSetupProbes(
    streamSetup,
    new Set<TAutoOptimizerProbeKind>(['youtube-unbound']),
  );
  t.deepEqual(allProbeCandidates(missingTwitchMode), []);
  t.true(missingTwitchMode.outputs.every(output => output.measurement === 'estimated'));
  t.true(
    missingTwitchMode.outputs.every(output => output.estimateReason === 'enhanced_broadcasting'),
  );
});

test('probe coverage estimates only with zero probes and disables partial promotion', t => {
  t.deepEqual(autoConfigProbeCoverage(2, 0), {
    measurement: 'estimated',
    estimateReason: 'probe_disabled',
    allowPromotion: false,
  });
  t.deepEqual(autoConfigProbeCoverage(2, 1), {
    measurement: 'active',
    estimateReason: 'partial_provider_probes',
    allowPromotion: false,
  });
  t.deepEqual(autoConfigProbeCoverage(2, 2), {
    measurement: 'active',
    allowPromotion: true,
  });
});

test('partial active provider evidence is accepted only at low confidence', t => {
  const partial = {
    destinations: [{ platform: 'twitch' }, { platform: 'youtube' }],
    attemptedCandidates: [{ provider: 'twitch' as const, kind: 'twitch-standard' as const }],
    evidence: [
      {
        platform: 'twitch' as const,
        method: 'twitch-bandwidth-test' as const,
        success: true,
      },
    ],
  };

  t.true(isValidAutoConfigActiveProbeCoverage({ ...partial, confidence: 'low' }));
  t.false(isValidAutoConfigActiveProbeCoverage({ ...partial, confidence: 'medium' }));
  t.false(isValidAutoConfigActiveProbeCoverage({ ...partial, confidence: 'high' }));
});

test('a joint Dual Output probe represents its canvas without claiming every destination', t => {
  const evidence = [
    {
      platform: 'twitch' as const,
      method: 'twitch-bandwidth-test' as const,
      success: true,
    },
  ];
  const context = {
    destinations: [{ platform: 'twitch' }, { platform: 'youtube' }, { platform: 'kick' }],
    attemptedCandidates: [{ provider: 'twitch' as const, kind: 'twitch-standard' as const }],
    evidence,
    confidence: 'high',
  };

  t.false(isValidAutoConfigActiveProbeCoverage(context));
  t.true(
    isValidAutoConfigActiveProbeCoverage({
      ...context,
      requireAllProbeCapableDestinations: false,
    }),
  );
});

test('runtime-partial active coverage accepts one prepared success only at low confidence', t => {
  const twitchEvidence = {
    platform: 'twitch' as const,
    method: 'twitch-bandwidth-test' as const,
    success: true,
  };
  const context = {
    destinations: [{ platform: 'twitch' }, { platform: 'youtube' }],
    attemptedCandidates: [
      { provider: 'twitch' as const, kind: 'twitch-standard' as const },
      { provider: 'youtube' as const, kind: 'youtube-unbound' as const },
    ],
  };

  const runtimePartial = {
    ...context,
    evidence: [
      twitchEvidence,
      { platform: 'youtube' as const, method: 'youtube-unbound-ramp' as const, success: false },
    ],
  };

  t.true(
    isValidAutoConfigActiveProbeCoverage({
      ...runtimePartial,
      confidence: 'low',
    }),
  );
  t.false(isValidAutoConfigActiveProbeCoverage({ ...runtimePartial, confidence: 'medium' }));
  t.false(isValidAutoConfigActiveProbeCoverage({ ...runtimePartial, confidence: 'high' }));
  t.false(
    isValidAutoConfigActiveProbeCoverage({
      ...context,
      confidence: 'low',
      evidence: [
        { platform: 'twitch', method: 'twitch-bandwidth-test', success: false },
        { platform: 'youtube', method: 'youtube-unbound-ramp', success: false },
      ],
    }),
  );
  t.true(
    isValidAutoConfigActiveProbeCoverage({
      ...context,
      confidence: 'medium',
      evidence: [
        twitchEvidence,
        {
          platform: 'youtube',
          method: 'youtube-unbound-ramp',
          success: true,
        },
      ],
    }),
  );
});

test('active evidence cannot claim a provider Desktop did not attempt', t => {
  t.false(
    isValidAutoConfigActiveProbeCoverage({
      destinations: [{ platform: 'twitch' }, { platform: 'youtube' }],
      attemptedCandidates: [{ provider: 'twitch', kind: 'twitch-standard' }],
      confidence: 'low',
      evidence: [
        {
          platform: 'twitch',
          method: 'twitch-bandwidth-test',
          success: true,
        },
        {
          platform: 'youtube',
          method: 'youtube-unbound-ramp',
          success: true,
        },
      ],
    }),
  );
});

test('active Twitch evidence must match the exact attempted standard or Enhanced Broadcasting method', t => {
  const context = {
    destinations: [{ platform: 'twitch' }],
    confidence: 'high',
  };
  const standardEvidence = {
    platform: 'twitch' as const,
    method: 'twitch-bandwidth-test' as const,
    success: true,
  };
  const enhancedEvidence = {
    platform: 'twitch' as const,
    method: 'twitch-enhanced-broadcasting-test' as const,
    success: true,
  };

  t.true(
    isValidAutoConfigActiveProbeCoverage({
      ...context,
      attemptedCandidates: [{ provider: 'twitch', kind: 'twitch-standard' }],
      evidence: [standardEvidence],
    }),
  );
  t.false(
    isValidAutoConfigActiveProbeCoverage({
      ...context,
      attemptedCandidates: [{ provider: 'twitch', kind: 'twitch-standard' }],
      evidence: [enhancedEvidence],
    }),
  );
  t.true(
    isValidAutoConfigActiveProbeCoverage({
      ...context,
      attemptedCandidates: [{ provider: 'twitch', kind: 'twitch-enhanced-broadcasting' }],
      evidence: [enhancedEvidence],
    }),
  );
  t.false(
    isValidAutoConfigActiveProbeCoverage({
      ...context,
      attemptedCandidates: [{ provider: 'twitch', kind: 'twitch-enhanced-broadcasting' }],
      evidence: [standardEvidence],
    }),
  );
});

test('a shared cloud output remains estimate-only when no provider probe is supported', t => {
  const filtered = filterAutoConfigStreamSetupProbes(
    sharedCloudStreamSetup(),
    new Set<TAutoOptimizerProbeKind>(),
  );

  t.is(filtered.outputs[0].measurement, 'estimated');
  t.is(filtered.outputs[0].estimateReason, 'probe_disabled');
  t.deepEqual(allProbeCandidates(filtered), []);
});

test('a shared cloud output retains deterministic candidates when every provider is supported', t => {
  const filtered = filterAutoConfigStreamSetupProbes(
    sharedCloudStreamSetup(),
    new Set<TAutoOptimizerProbeKind>(['youtube-unbound', 'twitch-standard']),
  );

  t.deepEqual(
    allProbeCandidates(filtered).map(candidate => candidate.provider),
    ['twitch', 'youtube'],
  );
  t.is(filtered.outputs[0].measurement, 'active');
  t.is(filtered.outputs[0].estimateReason, undefined);
});

test('the exact Twitch and YouTube two-output topology keeps both active probes', t => {
  const streamSetup = twitchYoutubeDualOutputStreamSetup();
  t.true(isEligibleAutoConfigDualOutputActiveStreamSetup(streamSetup));

  const filtered = filterAutoConfigStreamSetupProbes(
    streamSetup,
    new Set<TAutoOptimizerProbeKind>(['twitch-standard', 'youtube-unbound']),
  );
  t.deepEqual(
    filtered.outputs.map(output => [
      output.display,
      output.probeCandidates[0]?.provider,
      output.measurement,
    ]),
    [
      ['horizontal', 'twitch', 'active'],
      ['vertical', 'youtube', 'active'],
    ],
  );
  t.deepEqual(
    allProbeCandidates(filtered).map(candidate => candidate.provider),
    ['twitch', 'youtube'],
  );
});

test('Dual Output keeps one supported probe per canvas when other platforms share it', t => {
  const streamSetup = twitchKickYoutubeDualOutputStreamSetup();
  t.true(isEligibleAutoConfigDualOutputActiveStreamSetup(streamSetup));

  const filtered = filterAutoConfigStreamSetupProbes(
    streamSetup,
    new Set<TAutoOptimizerProbeKind>(['twitch-standard', 'youtube-unbound']),
  );
  t.deepEqual(
    filtered.outputs.map(output => ({
      destinations: output.destinations.map(destination => destination.platform),
      providers: output.probeCandidates.map(candidate => candidate.provider),
      measurement: output.measurement,
      estimateReason: output.estimateReason,
    })),
    [
      {
        destinations: ['twitch', 'kick'],
        providers: ['twitch'],
        measurement: 'active',
        estimateReason: undefined,
      },
      {
        destinations: ['youtube'],
        providers: ['youtube'],
        measurement: 'active',
        estimateReason: undefined,
      },
    ],
  );
});

test('Dual Output selects distinct supported representatives when a canvas has both', t => {
  const streamSetup = twitchKickYoutubeDualOutputStreamSetup();
  streamSetup.outputs[0].destinations.splice(1, 0, { platform: 'youtube' });
  streamSetup.outputs[0].probeCandidates.push({
    probeId: 'horizontal-youtube',
    kind: 'youtube-unbound',
    outputId: 'horizontal',
    provider: 'youtube',
  });

  const filtered = filterAutoConfigStreamSetupProbes(
    streamSetup,
    new Set<TAutoOptimizerProbeKind>(['twitch-standard', 'youtube-unbound']),
  );
  t.deepEqual(
    filtered.outputs.map(output => output.probeCandidates.map(candidate => candidate.provider)),
    [['twitch'], ['youtube']],
  );
  t.true(isEligibleAutoConfigDualOutputActiveStreamSetup(filtered));
});

test('Dual Output remains estimate-only when a canvas has no supported representative', t => {
  const streamSetup = twitchKickYoutubeDualOutputStreamSetup();
  streamSetup.outputs[1].destinations = [{ platform: 'kick' }];
  streamSetup.outputs[1].probeCandidates = [];

  const filtered = filterAutoConfigStreamSetupProbes(
    streamSetup,
    new Set<TAutoOptimizerProbeKind>(['twitch-standard', 'youtube-unbound']),
  );
  t.true(filtered.outputs.every(output => output.measurement === 'estimated'));
  t.deepEqual(allProbeCandidates(filtered), []);
});

test('the active Dual Output topology requires unique per-output probe IDs', t => {
  const reusedProbeId = twitchYoutubeDualOutputStreamSetup();
  reusedProbeId.outputs[1].probeCandidates[0].probeId =
    reusedProbeId.outputs[0].probeCandidates[0].probeId;
  t.false(isEligibleAutoConfigDualOutputActiveStreamSetup(reusedProbeId));
});

test('the exact Dual Output topology requires both provider probe kinds', t => {
  for (const kind of ['twitch-standard', 'youtube-unbound'] as const) {
    const filtered = filterAutoConfigStreamSetupProbes(
      twitchYoutubeDualOutputStreamSetup(),
      new Set<TAutoOptimizerProbeKind>([kind]),
    );
    t.true(filtered.outputs.every(output => output.measurement === 'estimated'));
    t.true(filtered.outputs.every(output => output.estimateReason === 'dual_output'));
    t.deepEqual(allProbeCandidates(filtered), []);
  }
});

test('a single multi-destination output nested under Dual Output is estimate-only', t => {
  const streamSetup = sharedCloudStreamSetup();
  streamSetup.type = 'dual-output';

  const filtered = filterAutoConfigStreamSetupProbes(
    streamSetup,
    new Set<TAutoOptimizerProbeKind>(['twitch-standard', 'youtube-unbound']),
  );

  t.is(filtered.outputs[0].measurement, 'estimated');
  t.is(filtered.outputs[0].estimateReason, 'dual_output');
  t.deepEqual(allProbeCandidates(filtered), []);
});

test('YouTube display both cannot create two active probe leases', t => {
  const outputs = ['horizontal', 'vertical'].map(display => ({
    outputId: display,
    display: display as 'horizontal' | 'vertical',
    outputKind: 'standard' as const,
    destinations: [{ platform: 'youtube' as const }],
    probeCandidates: [
      {
        probeId: `${display}-youtube`,
        kind: 'youtube-unbound' as const,
        outputId: display,
        provider: 'youtube' as const,
      },
    ],
    measurement: 'active' as const,
  }));
  const streamSetup: IAutoOptimizerStreamSetup = {
    type: 'dual-output',
    outputs,
  };

  const filtered = filterAutoConfigStreamSetupProbes(
    streamSetup,
    new Set<TAutoOptimizerProbeKind>(['youtube-unbound']),
  );

  t.true(filtered.outputs.every(output => output.measurement === 'estimated'));
  t.deepEqual(allProbeCandidates(filtered), []);
});

test('sequential provider bandwidth events receive distinct pacing keys', t => {
  t.is(autoConfigPhaseStepKey('bandwidth', 'twitch'), 'bandwidth:twitch:measuring:0');
  t.is(autoConfigPhaseStepKey('bandwidth', 'youtube'), 'bandwidth:youtube:measuring:0');
  t.not(
    autoConfigPhaseStepKey('bandwidth', 'twitch'),
    autoConfigPhaseStepKey('bandwidth', 'youtube'),
  );
  t.is(
    autoConfigPhaseStepKey('bandwidth', 'twitch', 'enhanced_broadcasting_testing_candidate', {
      width: 1920,
      height: 1080,
      fpsNum: 60,
      fpsDen: 1,
    }),
    'bandwidth:twitch:enhanced_broadcasting_testing_candidate:1920x1080:60/1',
  );
  t.not(
    autoConfigPhaseStepKey('bandwidth', 'twitch', 'enhanced_broadcasting_testing_candidate', {
      width: 1920,
      height: 1080,
      fpsNum: 60,
      fpsDen: 1,
    }),
    autoConfigPhaseStepKey('bandwidth', 'twitch', 'enhanced_broadcasting_candidate_rejected', {
      width: 1920,
      height: 1080,
      fpsNum: 60,
      fpsDen: 1,
    }),
  );
  t.is(
    autoConfigPhaseStepKey(
      'bandwidth',
      'twitch',
      'enhanced_broadcasting_validating_target_cadence',
      { width: 1920, height: 1080, fpsNum: 60, fpsDen: 1 },
    ),
    'bandwidth:twitch:enhanced_broadcasting_validating_target_cadence:1920x1080:60/1',
  );
  t.not(
    autoConfigPhaseStepKey('bandwidth', 'twitch', 'enhanced_broadcasting_testing_candidate', {
      width: 1920,
      height: 1080,
      fpsNum: 60,
      fpsDen: 1,
      additionalVideo: {
        display: 'vertical',
        width: 1080,
        height: 1920,
        fpsNum: 60,
        fpsDen: 1,
      },
    }),
    autoConfigPhaseStepKey('bandwidth', 'twitch', 'enhanced_broadcasting_testing_candidate', {
      width: 1920,
      height: 1080,
      fpsNum: 60,
      fpsDen: 1,
      additionalVideo: {
        display: 'vertical',
        width: 720,
        height: 1280,
        fpsNum: 60,
        fpsDen: 1,
      },
    }),
  );
  t.is(autoConfigPhaseStepKey('hardware', 'youtube'), 'hardware');
  t.is(
    autoConfigPhaseStepKey('hardware', null, 'hardware_discovering_encoders'),
    'hardware:discovering',
  );
  t.is(
    autoConfigPhaseStepKey('hardware', null, 'hardware_validating_encoder'),
    'hardware:validating:encoder:0x0:0/0',
  );
  t.not(
    autoConfigPhaseStepKey('hardware', null, 'hardware_testing_encoder'),
    autoConfigPhaseStepKey('hardware', null, 'hardware_validating_encoder'),
  );
  t.is(
    autoConfigPhaseStepKey('hardware', null, 'hardware_encoder_selected'),
    'hardware:selected:encoder:0x0:0/0',
  );
  const surfaceAttempt = {
    encoderId: 'obs_nvenc_h264_tex',
    width: 1920,
    height: 1080,
    fpsNum: 30,
    fpsDen: 1,
  };
  t.is(
    autoConfigPhaseStepKey('hardware', null, 'hardware_testing_encoder_surfaces', surfaceAttempt),
    'hardware:surfaces:obs_nvenc_h264_tex:1920x1080',
  );
  t.is(
    autoConfigPhaseStepKey('hardware', null, 'hardware_validating_target_cadence', {
      ...surfaceAttempt,
      fpsNum: 60,
    }),
    'hardware:target-cadence:obs_nvenc_h264_tex:1920x1080:60/1',
  );
  t.not(
    autoConfigPhaseStepKey('hardware', null, 'hardware_testing_encoder_surfaces', surfaceAttempt),
    autoConfigPhaseStepKey('hardware', null, 'hardware_testing_encoder_surfaces', {
      ...surfaceAttempt,
      width: 1280,
      height: 720,
    }),
  );
  t.is(
    autoConfigPhaseStepKey('recommendation', null, 'recommendation_selecting_quality'),
    'recommendation:selecting:0',
  );
  t.is(
    autoConfigPhaseStepKey('recommendation', null, 'recommendation_quality_selected'),
    'recommendation',
  );
  t.not(
    autoConfigPhaseStepKey('recommendation', null, 'recommendation_selecting_quality'),
    autoConfigPhaseStepKey('recommendation', null, 'recommendation_quality_selected'),
  );
  t.is(
    autoConfigPhaseStepKey('hardware', null, 'hardware_provider_managed'),
    autoConfigPhaseStepKey('recommendation', null, 'recommendation_provider_managed'),
  );
  t.is(autoConfigPhaseStepKey('cleanup', null, 'cleanup_resources'), 'cleanup');
  t.is(
    autoConfigPhaseStepKey('hardware', null, 'hardware_encoder_rejected'),
    'hardware:rejected:encoder',
  );
  t.is(
    autoConfigPhaseStepKey('bandwidth', 'youtube', 'youtube_probe_completed'),
    'bandwidth:youtube:youtube_probe_completed:0',
  );
  t.is(
    autoConfigPhaseStepKey('bandwidth', 'twitch', 'twitch_probe_failed_estimate_used'),
    'bandwidth:twitch:twitch_probe_failed_estimate_used:0',
  );
  t.is(
    autoConfigPhaseStepKey('bandwidth', 'youtube', 'youtube_probe_source_underfill_completed'),
    'bandwidth:youtube:youtube_probe_source_underfill_completed:0',
  );
  t.not(
    autoConfigPhaseStepKey('bandwidth', 'youtube', 'youtube_probe_completed'),
    autoConfigPhaseStepKey('bandwidth', 'youtube', 'youtube_probe_baseline'),
  );

  t.not(
    autoConfigPhaseStepKey('bandwidth', 'youtube', 'youtube_probe_baseline', {
      targetBitrateKbps: 4500,
    }),
    autoConfigPhaseStepKey('bandwidth', 'youtube', 'youtube_probe_baseline', {
      targetBitrateKbps: 6000,
    }),
  );
  t.is(
    autoConfigPhaseStepKey('bandwidth', 'youtube', 'youtube_probe_measuring', {
      targetBitrateKbps: 4500,
    }),
    autoConfigPhaseStepKey('bandwidth', 'youtube', 'unknown_native_code', {
      targetBitrateKbps: 4500,
    }),
  );
  t.not(
    autoConfigPhaseStepKey('hardware', null, 'hardware_testing_encoder', {
      encoderTitle: 'NVIDIA NVENC H.264',
      width: 1920,
      height: 1080,
      fpsNum: 60,
      fpsDen: 1,
    }),
    autoConfigPhaseStepKey('hardware', null, 'hardware_testing_encoder', {
      encoderTitle: 'Intel QSV H.264',
      width: 1920,
      height: 1080,
      fpsNum: 60,
      fpsDen: 1,
    }),
  );
  t.not(
    autoConfigPhaseStepKey('recommendation', null, 'recommendation_selecting_quality', {
      availableBitrateKbps: 4500,
    }),
    autoConfigPhaseStepKey('recommendation', null, 'recommendation_selecting_quality', {
      availableBitrateKbps: 6000,
    }),
  );
});

test('joint Dual Output progress follows native hardware and recommendation phases', t => {
  t.is(
    autoConfigPhaseStepKey('hardware', null, 'dual_output_testing_workload', {
      encoderTitle: 'NVIDIA NVENC H.264',
      width: 1920,
      height: 1080,
      fpsNum: 60,
      fpsDen: 1,
    }),
    'hardware:dual-output:workload:NVIDIA NVENC H.264:1920x1080:60/1',
  );
  t.is(
    autoConfigPhaseStepKey('recommendation', null, 'dual_output_allocating_upload', {
      selectedBitrateKbps: 5000,
      availableBitrateKbps: 10000,
    }),
    'recommendation:dual-output:allocating:5000:10000',
  );

  const workload = sanitizeAutoConfigProgressDetail(
    {
      type: 'progress',
      phase: 'hardware',
      progress: 20,
      code: 'dual_output_testing_workload',
      width: 1920,
      height: 1080,
      fpsNum: 60,
      fpsDen: 1,
      targetBitrateKbps: 10000,
    },
    'hardware',
  );
  t.is(workload.provider, null);
  t.is(workload.targetBitrateKbps, null, 'hardware work does not claim a probe bitrate');
  t.is(workload.width, 1920);

  const allocation = sanitizeAutoConfigProgressDetail(
    {
      type: 'progress',
      phase: 'recommendation',
      progress: 75,
      code: 'dual_output_allocating_upload',
      selectedBitrateKbps: 5000,
      availableBitrateKbps: 10000,
    },
    'recommendation',
  );
  t.is(allocation.selectedBitrateKbps, 5000);
  t.is(allocation.availableBitrateKbps, 10000);
});

test('progress pacing coalesces repeats but preserves A to B to A transitions', t => {
  t.is(autoConfigPhaseStepDisposition('A', [], 'A'), 'update-displayed');
  t.is(autoConfigPhaseStepDisposition('A', ['B'], 'B'), 'update-pending-tail');
  t.is(autoConfigPhaseStepDisposition('A', ['B'], 'A'), 'enqueue');
  t.is(autoConfigPhaseStepDisposition('A', ['B', 'A'], 'B'), 'enqueue');
});

test('active probe target bitrate feedback is conservatively validated', t => {
  t.is(sanitizeAutoConfigProbeTargetBitrateKbps(10000), 10000);
  t.is(sanitizeAutoConfigProbeTargetBitrateKbps(0), null);
  t.is(sanitizeAutoConfigProbeTargetBitrateKbps(-1), null);
  t.is(sanitizeAutoConfigProbeTargetBitrateKbps(1.5), null);
  t.is(sanitizeAutoConfigProbeTargetBitrateKbps(Number.POSITIVE_INFINITY), null);
  t.is(sanitizeAutoConfigProbeTargetBitrateKbps('6000'), null);
  t.is(sanitizeAutoConfigProbeTargetBitrateKbps(100001), null);
});

test('attempt progress detail preserves only bounded native status metadata', t => {
  const event: IAutoConfigEvent = {
    type: 'progress',
    phase: 'hardware',
    progress: 25,
    code: 'hardware_testing_encoder',
    encoderId: 'obs_nvenc_h264_tex',
    encoderFamily: 'obs_nvenc_h264_tex',
    encoderTitle: 'NVIDIA NVENC H.264',
    width: 1920,
    height: 1080,
    fpsNum: 60000,
    fpsDen: 1001,
    additionalVideo: {
      display: 'vertical',
      width: 1080,
      height: 1920,
      fpsNum: 60000,
      fpsDen: 1001,
    },
    targetBitrateKbps: 6000,
    availableBitrateKbps: 9000,
  };

  t.deepEqual(sanitizeAutoConfigProgressDetail(event, 'hardware'), {
    code: 'hardware_testing_encoder',
    provider: null,
    targetBitrateKbps: null,
    availableBitrateKbps: 9000,
    encoderId: 'obs_nvenc_h264_tex',
    encoderFamily: 'obs_nvenc_h264_tex',
    encoderTitle: 'NVIDIA NVENC H.264',
    width: 1920,
    height: 1080,
    fpsNum: 60000,
    fpsDen: 1001,
    additionalVideo: {
      display: 'vertical',
      width: 1080,
      height: 1920,
      fpsNum: 60000,
      fpsDen: 1001,
    },
    selectedBitrateKbps: null,
  });
});

test('malformed progress metadata cannot leak into mirrored UI state', t => {
  const event = ({
    type: 'progress',
    phase: 'bandwidth',
    progress: 40,
    code: '<script>',
    probe: { id: 'youtube', kind: 'youtube-unbound' },
    targetBitrateKbps: 10000,
    availableBitrateKbps: Number.POSITIVE_INFINITY,
    encoderId: 'x'.repeat(300),
    encoderFamily: 'legacy',
    encoderTitle: 'x'.repeat(300),
    width: -1,
    additionalVideo: { display: 'horizontal', width: 1080, height: 1920 },
  } as unknown) as IAutoConfigEvent;

  t.deepEqual(sanitizeAutoConfigProgressDetail(event, 'bandwidth'), {
    code: null,
    provider: 'youtube',
    targetBitrateKbps: 10000,
    availableBitrateKbps: null,
    encoderId: null,
    encoderFamily: null,
    encoderTitle: null,
    width: null,
    height: null,
    fpsNum: null,
    fpsDen: null,
    additionalVideo: null,
    selectedBitrateKbps: null,
  });
});

test('probe evidence is validated and strips attempt-local or unknown fields', t => {
  t.deepEqual(
    sanitizeAutoConfigProbeEvidence([
      {
        platform: 'twitch',
        method: 'twitch-bandwidth-test',
        success: true,
        streamKey: 'must-not-leak',
      },
      {
        platform: 'youtube',
        method: 'youtube-unbound-ramp',
        success: true,
      },
      {
        platform: 'twitch',
        method: 'twitch-enhanced-broadcasting-test',
        success: true,
        internalLadder: 'must-not-leak',
      },
      {
        platform: 'other',
        method: 'unknown',
        success: true,
      },
      {
        platform: 'youtube',
        method: 'invalid-negative',
        success: false,
      },
      {
        platform: 'youtube',
        method: 'youtube-unbound-ramp',
        success: false,
      },
    ]),
    [
      {
        platform: 'twitch',
        method: 'twitch-bandwidth-test',
        success: true,
      },
      {
        platform: 'youtube',
        method: 'youtube-unbound-ramp',
        success: true,
      },
      {
        platform: 'twitch',
        method: 'twitch-enhanced-broadcasting-test',
        success: true,
      },
      {
        platform: 'youtube',
        method: 'youtube-unbound-ramp',
        success: false,
      },
    ],
  );
});

test('malformed probe evidence is discarded at the renderer boundary', t => {
  t.deepEqual(sanitizeAutoConfigProbeEvidence(null), []);
  t.deepEqual(
    sanitizeAutoConfigProbeEvidence([
      null,
      { platform: 'twitch' },
      {
        platform: 'youtube',
        method: 'x'.repeat(65),
        success: true,
      },
      {
        platform: 'youtube',
        method: 'youtube-unbound-ramp',
        success: 'yes',
      },
      {
        platform: 'youtube',
        method: 'unsupported-youtube-method',
        success: false,
      },
      {
        platform: 'youtube',
        method: 'twitch-bandwidth-test',
        success: false,
      },
      {
        platform: 'other',
        method: 'unknown',
        success: true,
      },
    ]),
    [],
  );
});
