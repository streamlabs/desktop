import test from 'ava';
import {
  areAutoConfigActiveCanvasIdentitiesValid,
  autoConfigProbeCoverage,
  autoConfigPhaseStepDisposition,
  autoConfigPhaseStepKey,
  filterAutoConfigTopologyProbes,
  hasRequiredAutoConfigCapabilities,
  isEligibleAutoConfigDualOutputActiveTopology,
  isEligibleAutoConfigEnhancedBroadcastingDualOutputTopology,
  isValidAutoConfigActiveProbeCoverage,
  sanitizeAutoConfigProgressDetail,
  sanitizeAutoConfigProbeEvidence,
  sanitizeAutoConfigProbeTargetBitrateKbps,
  supportedAutoConfigProbeKinds,
} from '../../app/services/auto-config/probe-policy';
import {
  IAutoConfigCapabilities,
  IAutoConfigEvent,
  IAutoOptimizerTopology,
  TAutoOptimizerProbeKind,
} from '../../app/services/auto-config/types';

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

function capabilities(patch: Partial<IAutoConfigCapabilities> = {}): IAutoConfigCapabilities {
  return {
    apiVersion: 2,
    resultSchemaVersion: 1,
    previewApplySplit: true,
    awaitableCancel: true,
    perUploadLegResults: true,
    desktopOwnedApply: true,
    multipleActiveProbes: true,
    dualOutputActiveProbes: true,
    enhancedBroadcastingDualOutputWorkload: true,
    bandwidthModes: [
      'estimate',
      'twitch-standard-active',
      'twitch-enhanced-broadcasting-active',
      'youtube-unbound-active',
    ],
    ...patch,
  };
}

function twitchYoutubeDualOutputTopology(): IAutoOptimizerTopology {
  const legs = ['twitch', 'youtube'].map((provider, index) => ({
    legId: index ? 'vertical' : 'horizontal',
    display: index ? ('vertical' as const) : ('horizontal' as const),
    outputKind: 'standard' as const,
    destinations: [{ platform: provider as 'twitch' | 'youtube' }],
    route: 'direct' as const,
    probeCandidates: [
      {
        probeId: `${index ? 'vertical' : 'horizontal'}-${provider}`,
        kind: provider === 'twitch' ? ('twitch-standard' as const) : ('youtube-unbound' as const),
        legId: index ? 'vertical' : 'horizontal',
        provider: provider as 'twitch' | 'youtube',
      },
    ],
    measurement: 'active' as const,
  }));
  return {
    type: 'dual-output',
    legs,
    probeCandidates: legs.flatMap(leg => leg.probeCandidates),
  };
}

function twitchKickYoutubeDualOutputTopology(): IAutoOptimizerTopology {
  const topology = twitchYoutubeDualOutputTopology();
  topology.legs[0].destinations.push({ platform: 'kick' });
  topology.legs[0].route = 'cloud-restream';
  return topology;
}

function sharedCloudTopology(): IAutoOptimizerTopology {
  const probeCandidates = [
    {
      probeId: 'horizontal-twitch',
      kind: 'twitch-standard' as const,
      legId: 'horizontal',
      provider: 'twitch' as const,
    },
    {
      probeId: 'horizontal-youtube',
      kind: 'youtube-unbound' as const,
      legId: 'horizontal',
      provider: 'youtube' as const,
    },
  ];
  return {
    type: 'cloud-multistream',
    probeCandidates,
    legs: [
      {
        legId: 'horizontal',
        display: 'horizontal',
        outputKind: 'standard',
        destinations: [{ platform: 'twitch' }, { platform: 'youtube' }],
        route: 'cloud-restream',
        probeCandidates,
        measurement: 'active',
      },
    ],
  };
}

function enhancedBroadcastingDualOutputTopology(): IAutoOptimizerTopology {
  const enhancedCandidate = {
    probeId: 'twitch-enhanced-broadcasting-twitch',
    kind: 'twitch-enhanced-broadcasting' as const,
    legId: 'twitch-enhanced-broadcasting',
    provider: 'twitch' as const,
  };
  const youtubeCandidate = {
    probeId: 'horizontal-standard-youtube',
    kind: 'youtube-unbound' as const,
    legId: 'horizontal-standard',
    provider: 'youtube' as const,
  };
  return {
    type: 'enhanced-broadcasting-dual-output',
    legs: [
      {
        legId: 'twitch-enhanced-broadcasting',
        display: 'both',
        outputKind: 'twitch-enhanced-broadcasting',
        destinations: [{ platform: 'twitch' }],
        route: 'direct',
        probeCandidates: [enhancedCandidate],
        measurement: 'active',
      },
      {
        legId: 'horizontal-standard',
        display: 'horizontal',
        outputKind: 'standard',
        destinations: [{ platform: 'youtube' }, { platform: 'kick' }],
        route: 'cloud-restream',
        probeCandidates: [youtubeCandidate],
        measurement: 'active',
      },
    ],
    probeCandidates: [enhancedCandidate, youtubeCandidate],
  };
}

test('estimate support is required while active provider modes are optional', t => {
  t.true(
    hasRequiredAutoConfigCapabilities(
      capabilities({ bandwidthModes: ['estimate'], multipleActiveProbes: false }),
    ),
  );
  t.false(hasRequiredAutoConfigCapabilities(capabilities({ bandwidthModes: [] })));
  t.false(hasRequiredAutoConfigCapabilities(capabilities({ apiVersion: 1 })));
  t.false(
    hasRequiredAutoConfigCapabilities(
      capabilities({ dualOutputActiveProbes: (undefined as unknown) as boolean }),
    ),
  );
  t.false(
    hasRequiredAutoConfigCapabilities(
      capabilities({
        enhancedBroadcastingDualOutputWorkload: (undefined as unknown) as boolean,
      }),
    ),
  );
});

test('active probe kinds require their exact native mode and YouTube ingest support', t => {
  const native = capabilities();

  t.deepEqual(
    [
      ...supportedAutoConfigProbeKinds(native, {
        canConfirmYoutubeIngest: true,
      }),
    ],
    ['twitch-standard', 'twitch-enhanced-broadcasting', 'youtube-unbound'],
  );
  t.deepEqual(
    [
      ...supportedAutoConfigProbeKinds(
        capabilities({
          bandwidthModes: ['estimate', 'youtube-unbound-active'],
        }),
        {
          canConfirmYoutubeIngest: true,
        },
      ),
    ],
    ['youtube-unbound'],
  );
  t.deepEqual(
    [
      ...supportedAutoConfigProbeKinds(capabilities({ multipleActiveProbes: false }), {
        canConfirmYoutubeIngest: true,
      }),
    ],
    ['twitch-standard', 'twitch-enhanced-broadcasting'],
  );
  t.deepEqual(
    [
      ...supportedAutoConfigProbeKinds(native, {
        canConfirmYoutubeIngest: false,
      }),
    ],
    ['twitch-standard', 'twitch-enhanced-broadcasting'],
  );
});

test('a shared cloud leg retains the supported provider when another is unavailable', t => {
  const topology = sharedCloudTopology();
  const filtered = filterAutoConfigTopologyProbes(
    topology,
    new Set<TAutoOptimizerProbeKind>(['twitch-standard']),
  );

  t.is(filtered.legs[0].measurement, 'active');
  t.is(filtered.legs[0].estimateReason, 'partial_provider_probes');
  t.deepEqual(
    filtered.legs[0].probeCandidates.map(candidate => candidate.provider),
    ['twitch'],
  );
  t.deepEqual(
    filtered.probeCandidates.map(candidate => candidate.provider),
    ['twitch'],
  );
  t.is(topology.legs[0].measurement, 'active', 'the classifier output is not mutated');
  t.is(topology.probeCandidates.length, 2);
});

test('Enhanced Broadcasting requires its exact native capability', t => {
  const candidate = {
    probeId: 'horizontal-twitch',
    kind: 'twitch-enhanced-broadcasting' as const,
    legId: 'horizontal',
    provider: 'twitch' as const,
  };
  const topology: IAutoOptimizerTopology = {
    type: 'enhanced-broadcasting',
    probeCandidates: [candidate],
    legs: [
      {
        legId: 'horizontal',
        display: 'horizontal',
        outputKind: 'twitch-enhanced-broadcasting',
        destinations: [{ platform: 'twitch' }],
        route: 'direct',
        probeCandidates: [candidate],
        measurement: 'active',
      },
    ],
  };

  const standardOnly = filterAutoConfigTopologyProbes(
    topology,
    new Set<TAutoOptimizerProbeKind>(['twitch-standard']),
  );
  t.is(standardOnly.legs[0].measurement, 'estimated');
  t.deepEqual(standardOnly.probeCandidates, []);

  const enhanced = filterAutoConfigTopologyProbes(
    topology,
    new Set<TAutoOptimizerProbeKind>(['twitch-enhanced-broadcasting']),
  );
  t.is(enhanced.legs[0].measurement, 'active');
  t.deepEqual(enhanced.probeCandidates, [candidate]);
});

test('mixed Enhanced Broadcasting keeps only its Twitch and YouTube representatives', t => {
  const topology = enhancedBroadcastingDualOutputTopology();
  t.true(isEligibleAutoConfigEnhancedBroadcastingDualOutputTopology(topology));

  const filtered = filterAutoConfigTopologyProbes(
    topology,
    new Set<TAutoOptimizerProbeKind>(['twitch-enhanced-broadcasting', 'youtube-unbound']),
    { enhancedBroadcastingDualOutputWorkload: true },
  );

  t.true(isEligibleAutoConfigEnhancedBroadcastingDualOutputTopology(filtered));
  t.deepEqual(
    filtered.legs.map(leg => ({
      outputKind: leg.outputKind,
      destinations: leg.destinations.map(destination => destination.platform),
      providers: leg.probeCandidates.map(candidate => candidate.provider),
      measurement: leg.measurement,
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

test('mixed Enhanced Broadcasting becomes fully estimate-only without concurrent-workload capability', t => {
  const topology = enhancedBroadcastingDualOutputTopology();
  const supportedKinds = new Set<TAutoOptimizerProbeKind>([
    'twitch-enhanced-broadcasting',
    'youtube-unbound',
  ]);

  for (const options of [{}, { enhancedBroadcastingDualOutputWorkload: false }]) {
    const filtered = filterAutoConfigTopologyProbes(topology, supportedKinds, options);
    t.deepEqual(filtered.probeCandidates, []);
    t.true(filtered.legs.every(leg => leg.probeCandidates.length === 0));
    t.true(filtered.legs.every(leg => leg.measurement === 'estimated'));
    t.true(filtered.legs.every(leg => leg.estimateReason === 'enhanced_broadcasting'));
  }

  const missingTwitchMode = filterAutoConfigTopologyProbes(
    topology,
    new Set<TAutoOptimizerProbeKind>(['youtube-unbound']),
    { enhancedBroadcastingDualOutputWorkload: true },
  );
  t.deepEqual(missingTwitchMode.probeCandidates, []);
  t.true(missingTwitchMode.legs.every(leg => leg.measurement === 'estimated'));
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
        provider: 'twitch' as const,
        method: 'twitch-bandwidth-test' as const,
        measuredKbps: 6013,
        safeKbps: 6000,
        headroomPercent: 0,
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
      provider: 'twitch' as const,
      method: 'twitch-bandwidth-test' as const,
      measuredKbps: 6013,
      safeKbps: 6000,
      headroomPercent: 0,
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
    provider: 'twitch' as const,
    method: 'twitch-bandwidth-test' as const,
    measuredKbps: 6013,
    safeKbps: 6000,
    headroomPercent: 0,
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
      { provider: 'youtube' as const, method: 'youtube-unbound-ramp' as const, success: false },
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
        { provider: 'twitch', method: 'twitch-bandwidth-test', success: false },
        { provider: 'youtube', method: 'youtube-unbound-ramp', success: false },
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
          provider: 'youtube',
          method: 'youtube-unbound-ramp',
          measuredKbps: 8000,
          safeKbps: 8000,
          headroomPercent: 0,
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
          provider: 'twitch',
          method: 'twitch-bandwidth-test',
          measuredKbps: 6000,
          safeKbps: 6000,
          headroomPercent: 0,
          success: true,
        },
        {
          provider: 'youtube',
          method: 'youtube-unbound-ramp',
          measuredKbps: 8000,
          safeKbps: 8000,
          headroomPercent: 0,
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
    provider: 'twitch' as const,
    method: 'twitch-bandwidth-test' as const,
    measuredKbps: 6000,
    safeKbps: 6000,
    headroomPercent: 0,
    success: true,
  };
  const enhancedEvidence = {
    provider: 'twitch' as const,
    method: 'twitch-enhanced-broadcasting-test' as const,
    success: true,
    testedWidth: 1920,
    testedHeight: 1080,
    testedFpsNum: 60,
    testedFpsDen: 1,
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

test('a shared cloud leg remains estimate-only when no provider probe is supported', t => {
  const filtered = filterAutoConfigTopologyProbes(
    sharedCloudTopology(),
    new Set<TAutoOptimizerProbeKind>(),
  );

  t.is(filtered.legs[0].measurement, 'estimated');
  t.is(filtered.legs[0].estimateReason, 'probe_disabled');
  t.deepEqual(filtered.probeCandidates, []);
});

test('a shared cloud leg retains deterministic candidates when every provider is supported', t => {
  const filtered = filterAutoConfigTopologyProbes(
    sharedCloudTopology(),
    new Set<TAutoOptimizerProbeKind>(['youtube-unbound', 'twitch-standard']),
  );

  t.deepEqual(
    filtered.probeCandidates.map(candidate => candidate.provider),
    ['twitch', 'youtube'],
  );
  t.is(filtered.legs[0].measurement, 'active');
  t.is(filtered.legs[0].estimateReason, undefined);
});

test('multi-leg Dual Output remains estimate-only without the native aggregate capability', t => {
  const topology = twitchYoutubeDualOutputTopology();

  const filtered = filterAutoConfigTopologyProbes(
    topology,
    new Set<TAutoOptimizerProbeKind>(['twitch-standard', 'youtube-unbound']),
  );
  t.is(filtered.legs[0].measurement, 'estimated');
  t.is(filtered.legs[0].estimateReason, 'dual_output');
  t.is(filtered.legs[1].measurement, 'estimated');
  t.is(filtered.legs[1].estimateReason, 'dual_output');
  t.deepEqual(filtered.probeCandidates, []);
});

test('the exact Twitch and YouTube two-leg Dual Output topology keeps both active probes', t => {
  const topology = twitchYoutubeDualOutputTopology();
  t.true(isEligibleAutoConfigDualOutputActiveTopology(topology));

  const filtered = filterAutoConfigTopologyProbes(
    topology,
    new Set<TAutoOptimizerProbeKind>(['twitch-standard', 'youtube-unbound']),
    { dualOutputActiveProbes: true },
  );
  t.deepEqual(
    filtered.legs.map(leg => [leg.display, leg.probeCandidates[0]?.provider, leg.measurement]),
    [
      ['horizontal', 'twitch', 'active'],
      ['vertical', 'youtube', 'active'],
    ],
  );
  t.deepEqual(
    filtered.probeCandidates.map(candidate => candidate.provider),
    ['twitch', 'youtube'],
  );
});

test('Dual Output keeps one supported probe per canvas when other platforms share it', t => {
  const topology = twitchKickYoutubeDualOutputTopology();
  t.true(isEligibleAutoConfigDualOutputActiveTopology(topology));

  const filtered = filterAutoConfigTopologyProbes(
    topology,
    new Set<TAutoOptimizerProbeKind>(['twitch-standard', 'youtube-unbound']),
    { dualOutputActiveProbes: true },
  );
  t.deepEqual(
    filtered.legs.map(leg => ({
      destinations: leg.destinations.map(destination => destination.platform),
      providers: leg.probeCandidates.map(candidate => candidate.provider),
      measurement: leg.measurement,
      estimateReason: leg.estimateReason,
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
  const topology = twitchKickYoutubeDualOutputTopology();
  topology.legs[0].destinations.splice(1, 0, { platform: 'youtube' });
  topology.legs[0].probeCandidates.push({
    probeId: 'horizontal-youtube',
    kind: 'youtube-unbound',
    legId: 'horizontal',
    provider: 'youtube',
  });
  topology.probeCandidates = topology.legs.flatMap(leg => leg.probeCandidates);

  const filtered = filterAutoConfigTopologyProbes(
    topology,
    new Set<TAutoOptimizerProbeKind>(['twitch-standard', 'youtube-unbound']),
    { dualOutputActiveProbes: true },
  );
  t.deepEqual(
    filtered.legs.map(leg => leg.probeCandidates.map(candidate => candidate.provider)),
    [['twitch'], ['youtube']],
  );
  t.true(isEligibleAutoConfigDualOutputActiveTopology(filtered));
});

test('Dual Output remains estimate-only when a canvas has no supported representative', t => {
  const topology = twitchKickYoutubeDualOutputTopology();
  topology.legs[1].destinations = [{ platform: 'kick' }];
  topology.legs[1].route = 'direct';
  topology.legs[1].probeCandidates = [];
  topology.probeCandidates = topology.legs.flatMap(leg => leg.probeCandidates);

  const filtered = filterAutoConfigTopologyProbes(
    topology,
    new Set<TAutoOptimizerProbeKind>(['twitch-standard', 'youtube-unbound']),
    { dualOutputActiveProbes: true },
  );
  t.true(filtered.legs.every(leg => leg.measurement === 'estimated'));
  t.deepEqual(filtered.probeCandidates, []);
});

test('the active Dual Output topology requires an exact unique top-level candidate mirror', t => {
  const duplicate = twitchYoutubeDualOutputTopology();
  duplicate.probeCandidates = [
    { ...duplicate.probeCandidates[0] },
    { ...duplicate.probeCandidates[0] },
  ];
  t.false(isEligibleAutoConfigDualOutputActiveTopology(duplicate));

  const tampered = twitchYoutubeDualOutputTopology();
  tampered.probeCandidates[1] = {
    ...tampered.probeCandidates[1],
    legId: 'horizontal',
  };
  t.false(isEligibleAutoConfigDualOutputActiveTopology(tampered));

  const reusedProbeId = twitchYoutubeDualOutputTopology();
  reusedProbeId.legs[1].probeCandidates[0].probeId =
    reusedProbeId.legs[0].probeCandidates[0].probeId;
  reusedProbeId.probeCandidates = reusedProbeId.legs.flatMap(leg => leg.probeCandidates);
  t.false(isEligibleAutoConfigDualOutputActiveTopology(reusedProbeId));
});

test('the exact Dual Output topology requires both provider probe kinds', t => {
  for (const kind of ['twitch-standard', 'youtube-unbound'] as const) {
    const filtered = filterAutoConfigTopologyProbes(
      twitchYoutubeDualOutputTopology(),
      new Set<TAutoOptimizerProbeKind>([kind]),
      { dualOutputActiveProbes: true },
    );
    t.true(filtered.legs.every(leg => leg.measurement === 'estimated'));
    t.true(filtered.legs.every(leg => leg.estimateReason === 'dual_output'));
    t.deepEqual(filtered.probeCandidates, []);
  }
});

test('a single multi-destination leg nested under Dual Output is estimate-only', t => {
  const topology = sharedCloudTopology();
  topology.type = 'dual-output';

  const filtered = filterAutoConfigTopologyProbes(
    topology,
    new Set<TAutoOptimizerProbeKind>(['twitch-standard', 'youtube-unbound']),
    { dualOutputActiveProbes: true },
  );

  t.is(filtered.legs[0].measurement, 'estimated');
  t.is(filtered.legs[0].estimateReason, 'dual_output');
  t.deepEqual(filtered.probeCandidates, []);
});

test('YouTube display both cannot create two active probe leases', t => {
  const legs = ['horizontal', 'vertical'].map(display => ({
    legId: display,
    display: display as 'horizontal' | 'vertical',
    outputKind: 'standard' as const,
    destinations: [{ platform: 'youtube' as const }],
    route: 'direct' as const,
    probeCandidates: [
      {
        probeId: `${display}-youtube`,
        kind: 'youtube-unbound' as const,
        legId: display,
        provider: 'youtube' as const,
      },
    ],
    measurement: 'active' as const,
  }));
  const topology: IAutoOptimizerTopology = {
    type: 'dual-output',
    legs,
    probeCandidates: legs.flatMap(leg => leg.probeCandidates),
  };

  const filtered = filterAutoConfigTopologyProbes(
    topology,
    new Set<TAutoOptimizerProbeKind>(['youtube-unbound']),
    { dualOutputActiveProbes: true },
  );

  t.true(filtered.legs.every(leg => leg.measurement === 'estimated'));
  t.deepEqual(filtered.probeCandidates, []);
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
      schemaVersion: 1,
      sessionId: 'session',
      sequence: 1,
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
      schemaVersion: 1,
      sessionId: 'session',
      sequence: 2,
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
    schemaVersion: 1,
    sessionId: 'session',
    sequence: 3,
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
    schemaVersion: 1,
    sessionId: 'session',
    sequence: 4,
    type: 'progress',
    phase: 'bandwidth',
    progress: 40,
    code: '<script>',
    provider: 'youtube',
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
        probeId: 'horizontal-twitch',
        provider: 'twitch',
        method: 'twitch-bandwidth-test',
        measuredKbps: 6013,
        safeKbps: 6000,
        headroomPercent: 0,
        success: true,
        ceilingReached: false,
        streamKey: 'must-not-leak',
      },
      {
        provider: 'youtube',
        method: 'youtube-unbound-ramp',
        measuredKbps: 7900,
        safeKbps: 8000,
        headroomPercent: 0,
        success: true,
      },
      {
        provider: 'twitch',
        method: 'twitch-enhanced-broadcasting-test',
        success: true,
        testedWidth: 1920,
        testedHeight: 1080,
        testedFpsNum: 60,
        testedFpsDen: 1,
        testedAdditionalVideo: {
          display: 'vertical',
          width: 1080,
          height: 1920,
          fpsNum: 60,
          fpsDen: 1,
        },
        videoTrackCount: 3,
        configuredAggregateBitrateKbps: 7800,
        internalLadder: 'must-not-leak',
      },
      {
        provider: 'other',
        method: 'unknown',
        measuredKbps: 1,
        safeKbps: 1,
        headroomPercent: 0,
        success: true,
      },
      {
        provider: 'youtube',
        method: 'invalid-negative',
        measuredKbps: -1,
        safeKbps: 1,
        headroomPercent: 0,
        success: false,
      },
      {
        provider: 'youtube',
        method: 'youtube-unbound-ramp',
        success: false,
      },
    ]),
    [
      {
        provider: 'twitch',
        method: 'twitch-bandwidth-test',
        measuredKbps: 6013,
        safeKbps: 6000,
        headroomPercent: 0,
        success: true,
        ceilingReached: false,
      },
      {
        provider: 'youtube',
        method: 'youtube-unbound-ramp',
        measuredKbps: 7900,
        safeKbps: 8000,
        headroomPercent: 0,
        success: true,
      },
      {
        provider: 'twitch',
        method: 'twitch-enhanced-broadcasting-test',
        success: true,
        testedWidth: 1920,
        testedHeight: 1080,
        testedFpsNum: 60,
        testedFpsDen: 1,
        testedAdditionalVideo: {
          display: 'vertical',
          width: 1080,
          height: 1920,
          fpsNum: 60,
          fpsDen: 1,
        },
        videoTrackCount: 3,
        configuredAggregateBitrateKbps: 7800,
      },
      {
        provider: 'youtube',
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
      { provider: 'twitch' },
      {
        provider: 'youtube',
        method: 'x'.repeat(65),
        measuredKbps: 1,
        safeKbps: 1,
        headroomPercent: 0,
        success: true,
      },
      {
        provider: 'youtube',
        method: 'youtube-unbound-ramp',
        measuredKbps: Number.POSITIVE_INFINITY,
        safeKbps: 1,
        headroomPercent: 101,
        success: true,
      },
      {
        provider: 'youtube',
        method: 'unsupported-youtube-method',
        success: false,
      },
      {
        provider: 'youtube',
        method: 'twitch-bandwidth-test',
        success: false,
      },
      {
        provider: 'twitch',
        method: 'twitch-enhanced-broadcasting-test',
        success: true,
        testedWidth: 1919,
        testedHeight: 1080,
        testedFpsNum: 60,
        testedFpsDen: 1,
      },
      {
        provider: 'twitch',
        method: 'twitch-enhanced-broadcasting-test',
        success: true,
        testedWidth: 1920,
        testedHeight: 1080,
        testedFpsNum: 60,
      },
      {
        provider: 'twitch',
        method: 'twitch-enhanced-broadcasting-test',
        success: true,
        testedWidth: 1920,
        testedHeight: 1080,
        testedFpsNum: 60,
        testedFpsDen: 1,
        testedAdditionalVideo: {
          display: 'horizontal',
          width: 1080,
          height: 1920,
          fpsNum: 60,
          fpsDen: 1,
        },
      },
    ]),
    [],
  );
});
