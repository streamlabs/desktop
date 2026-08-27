import test from 'ava';
import {
  autoConfigProbeCoverage,
  autoConfigPhaseStepKey,
  filterAutoConfigTopologyProbes,
  hasRequiredAutoConfigCapabilities,
  isValidAutoConfigActiveProbeCoverage,
  sanitizeAutoConfigProgressDetail,
  sanitizeAutoConfigProbeEvidence,
  sanitizeAutoConfigProbeTargetBitrateKbps,
  supportedAutoConfigProbeProviders,
} from '../../app/services/auto-config/probe-policy';
import {
  IAutoConfigCapabilities,
  IAutoConfigEvent,
  IAutoOptimizerTopology,
  TAutoOptimizerProbeProvider,
} from '../../app/services/auto-config/types';

function capabilities(patch: Partial<IAutoConfigCapabilities> = {}): IAutoConfigCapabilities {
  return {
    apiVersion: 2,
    resultSchemaVersion: 1,
    previewApplySplit: true,
    awaitableCancel: true,
    perUploadLegResults: true,
    desktopOwnedApply: true,
    multipleActiveProbes: true,
    bandwidthModes: ['estimate', 'twitch-standard-active', 'youtube-unbound-active'],
    ...patch,
  };
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
        destinations: [{ platform: 'twitch' }, { platform: 'youtube' }],
        route: 'cloud-restream',
        probeCandidates,
        measurement: 'active',
      },
    ],
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
});

test('YouTube probing requires its flag, confirmation bridge, and multi-probe contract', t => {
  const native = capabilities();

  t.deepEqual(
    [
      ...supportedAutoConfigProbeProviders(native, {
        twitchFeatureEnabled: true,
        youtubeFeatureEnabled: true,
        canConfirmYoutubeIngest: true,
      }),
    ],
    ['twitch', 'youtube'],
  );
  t.deepEqual(
    [
      ...supportedAutoConfigProbeProviders(native, {
        twitchFeatureEnabled: true,
        youtubeFeatureEnabled: false,
        canConfirmYoutubeIngest: true,
      }),
    ],
    ['twitch'],
  );
  t.deepEqual(
    [
      ...supportedAutoConfigProbeProviders(capabilities({ multipleActiveProbes: false }), {
        twitchFeatureEnabled: true,
        youtubeFeatureEnabled: true,
        canConfirmYoutubeIngest: true,
      }),
    ],
    ['twitch'],
  );
  t.deepEqual(
    [
      ...supportedAutoConfigProbeProviders(native, {
        twitchFeatureEnabled: true,
        youtubeFeatureEnabled: true,
        canConfirmYoutubeIngest: false,
      }),
    ],
    ['twitch'],
  );
  t.deepEqual(
    [
      ...supportedAutoConfigProbeProviders(native, {
        twitchFeatureEnabled: false,
        youtubeFeatureEnabled: true,
        canConfirmYoutubeIngest: true,
      }),
    ],
    ['youtube'],
  );
});

test('a shared cloud leg retains the supported provider when another is unavailable', t => {
  const topology = sharedCloudTopology();
  const filtered = filterAutoConfigTopologyProbes(
    topology,
    new Set<TAutoOptimizerProbeProvider>(['twitch']),
  );

  t.is(filtered.legs[0].measurement, 'active');
  t.is(filtered.legs[0].estimateReason, 'partial_provider_probes');
  t.deepEqual(
    filtered.legs[0].probeCandidates.map(candidate => candidate.provider),
    ['twitch'],
  );
  t.deepEqual(filtered.probeCandidates.map(candidate => candidate.provider), ['twitch']);
  t.is(topology.legs[0].measurement, 'active', 'the classifier output is not mutated');
  t.is(topology.probeCandidates.length, 2);
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
    attemptedCandidates: [{ provider: 'twitch' as const }],
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
      { provider: 'twitch' as const },
      { provider: 'youtube' as const },
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
  t.false(
    isValidAutoConfigActiveProbeCoverage({ ...runtimePartial, confidence: 'medium' }),
  );
  t.false(
    isValidAutoConfigActiveProbeCoverage({ ...runtimePartial, confidence: 'high' }),
  );
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
      attemptedCandidates: [{ provider: 'twitch' }],
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

test('a shared cloud leg remains estimate-only when no provider probe is supported', t => {
  const filtered = filterAutoConfigTopologyProbes(
    sharedCloudTopology(),
    new Set<TAutoOptimizerProbeProvider>(),
  );

  t.is(filtered.legs[0].measurement, 'estimated');
  t.is(filtered.legs[0].estimateReason, 'probe_disabled');
  t.deepEqual(filtered.probeCandidates, []);
});

test('a shared cloud leg retains deterministic candidates when every provider is supported', t => {
  const filtered = filterAutoConfigTopologyProbes(
    sharedCloudTopology(),
    new Set<TAutoOptimizerProbeProvider>(['youtube', 'twitch']),
  );

  t.deepEqual(
    filtered.probeCandidates.map(candidate => candidate.provider),
    ['twitch', 'youtube'],
  );
  t.is(filtered.legs[0].measurement, 'active');
  t.is(filtered.legs[0].estimateReason, undefined);
});

test('multi-leg Dual Output remains estimate-only without an aggregate uplink allocator', t => {
  const topology: IAutoOptimizerTopology = {
    type: 'dual-output',
    probeCandidates: [],
    legs: ['twitch', 'youtube'].map((provider, index) => ({
      legId: index ? 'vertical' : 'horizontal',
      display: index ? ('vertical' as const) : ('horizontal' as const),
      destinations: [{ platform: provider as 'twitch' | 'youtube' }],
      route: 'direct' as const,
      probeCandidates: [
        {
          probeId: `${index ? 'vertical' : 'horizontal'}-${provider}`,
          kind:
            provider === 'twitch'
              ? ('twitch-standard' as const)
              : ('youtube-unbound' as const),
          legId: index ? 'vertical' : 'horizontal',
          provider: provider as 'twitch' | 'youtube',
        },
      ],
      measurement: 'active' as const,
    })),
  };
  topology.probeCandidates = topology.legs.flatMap(leg => leg.probeCandidates);

  const filtered = filterAutoConfigTopologyProbes(
    topology,
    new Set<TAutoOptimizerProbeProvider>(['twitch', 'youtube']),
  );
  t.is(filtered.legs[0].measurement, 'estimated');
  t.is(filtered.legs[0].estimateReason, 'dual_output');
  t.is(filtered.legs[1].measurement, 'estimated');
  t.is(filtered.legs[1].estimateReason, 'dual_output');
  t.deepEqual(filtered.probeCandidates, []);
});

test('a multi-destination leg nested under Dual Output is estimate-only', t => {
  const topology = sharedCloudTopology();
  topology.type = 'dual-output';

  const filtered = filterAutoConfigTopologyProbes(
    topology,
    new Set<TAutoOptimizerProbeProvider>(['twitch', 'youtube']),
  );

  t.is(filtered.legs[0].measurement, 'estimated');
  t.is(filtered.legs[0].estimateReason, 'dual_output');
  t.deepEqual(filtered.probeCandidates, []);
});

test('YouTube display both cannot create two active probe leases', t => {
  const legs = ['horizontal', 'vertical'].map(display => ({
    legId: display,
    display: display as 'horizontal' | 'vertical',
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
    new Set<TAutoOptimizerProbeProvider>(['youtube']),
  );

  t.true(filtered.legs.every(leg => leg.measurement === 'estimated'));
  t.deepEqual(filtered.probeCandidates, []);
});

test('sequential provider bandwidth events receive distinct pacing keys', t => {
  t.is(autoConfigPhaseStepKey('bandwidth', 'twitch'), 'bandwidth:twitch');
  t.is(autoConfigPhaseStepKey('bandwidth', 'youtube'), 'bandwidth:youtube');
  t.not(
    autoConfigPhaseStepKey('bandwidth', 'twitch'),
    autoConfigPhaseStepKey('bandwidth', 'youtube'),
  );
  t.is(autoConfigPhaseStepKey('hardware', 'youtube'), 'hardware');
  t.is(
    autoConfigPhaseStepKey('hardware', null, 'hardware_discovering_encoders'),
    'hardware:discovering',
  );
  t.is(
    autoConfigPhaseStepKey('hardware', null, 'hardware_validating_encoder'),
    'hardware:validating',
  );
  t.not(
    autoConfigPhaseStepKey('hardware', null, 'hardware_testing_encoder'),
    autoConfigPhaseStepKey('hardware', null, 'hardware_validating_encoder'),
  );
  t.is(
    autoConfigPhaseStepKey('hardware', null, 'hardware_encoder_selected'),
    'hardware:selected',
  );
  const surfaceAttempt = {
    encoderId: 'obs_nvenc_h264_tex',
    width: 1920,
    height: 1080,
    fpsNum: 30,
    fpsDen: 1,
  };
  t.is(
    autoConfigPhaseStepKey(
      'hardware',
      null,
      'hardware_testing_encoder_surfaces',
      surfaceAttempt,
    ),
    'hardware:surfaces:obs_nvenc_h264_tex:1920x1080:30/1',
  );
  t.is(
    autoConfigPhaseStepKey('hardware', null, 'hardware_validating_target_cadence', {
      ...surfaceAttempt,
      fpsNum: 60,
    }),
    'hardware:target-cadence:obs_nvenc_h264_tex:1920x1080:60/1',
  );
  t.not(
    autoConfigPhaseStepKey(
      'hardware',
      null,
      'hardware_testing_encoder_surfaces',
      surfaceAttempt,
    ),
    autoConfigPhaseStepKey('hardware', null, 'hardware_testing_encoder_surfaces', {
      ...surfaceAttempt,
      width: 1280,
      height: 720,
    }),
  );
  t.is(
    autoConfigPhaseStepKey('recommendation', null, 'recommendation_selecting_quality'),
    'recommendation:selecting',
  );
  t.is(
    autoConfigPhaseStepKey('recommendation', null, 'recommendation_quality_selected'),
    'recommendation:selected',
  );
  t.not(
    autoConfigPhaseStepKey('recommendation', null, 'recommendation_selecting_quality'),
    autoConfigPhaseStepKey('recommendation', null, 'recommendation_quality_selected'),
  );
  t.is(autoConfigPhaseStepKey('cleanup', null, 'cleanup_resources'), 'cleanup');
  t.is(
    autoConfigPhaseStepKey('hardware', null, 'hardware_encoder_rejected'),
    'hardware',
  );
  t.is(
    autoConfigPhaseStepKey('bandwidth', 'youtube', 'youtube_probe_completed'),
    'bandwidth:youtube:complete',
  );
  t.is(
    autoConfigPhaseStepKey('bandwidth', 'twitch', 'twitch_probe_failed_estimate_used'),
    'bandwidth:twitch:complete',
  );
  t.is(
    autoConfigPhaseStepKey(
      'bandwidth',
      'youtube',
      'youtube_probe_source_underfill_completed',
    ),
    'bandwidth:youtube:complete',
  );
  t.not(
    autoConfigPhaseStepKey('bandwidth', 'youtube', 'youtube_probe_completed'),
    autoConfigPhaseStepKey('bandwidth', 'youtube', 'youtube_probe_baseline'),
  );
});

test('active probe target bitrate feedback is conservatively validated', t => {
  t.is(sanitizeAutoConfigProbeTargetBitrateKbps(12000), 12000);
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
    selectedBitrateKbps: null,
  });
});

test('malformed progress metadata cannot leak into mirrored UI state', t => {
  const event = {
    schemaVersion: 1,
    sessionId: 'session',
    sequence: 4,
    type: 'progress',
    phase: 'bandwidth',
    progress: 40,
    code: '<script>',
    provider: 'youtube',
    targetBitrateKbps: 12000,
    availableBitrateKbps: Number.POSITIVE_INFINITY,
    encoderId: 'x'.repeat(300),
    encoderFamily: 'legacy',
    encoderTitle: 'x'.repeat(300),
    width: -1,
  } as unknown as IAutoConfigEvent;

  t.deepEqual(sanitizeAutoConfigProgressDetail(event, 'bandwidth'), {
    code: null,
    provider: 'youtube',
    targetBitrateKbps: 12000,
    availableBitrateKbps: null,
    encoderId: null,
    encoderFamily: null,
    encoderTitle: null,
    width: null,
    height: null,
    fpsNum: null,
    fpsDen: null,
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
    ]),
    [],
  );
});
