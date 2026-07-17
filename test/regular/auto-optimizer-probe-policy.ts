import test from 'ava';
import {
  autoConfigPhaseStepKey,
  filterAutoConfigTopologyProbes,
  hasRequiredAutoConfigCapabilities,
  sanitizeAutoConfigProbeEvidence,
  sanitizeAutoConfigProbeTargetBitrateKbps,
  supportedAutoConfigProbeProviders,
} from '../../app/services/auto-config/probe-policy';
import {
  IAutoConfigCapabilities,
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
      kind: 'twitch-standard-v1' as const,
      legId: 'horizontal',
      provider: 'twitch' as const,
    },
    {
      probeId: 'horizontal-youtube',
      kind: 'youtube-unbound-v1' as const,
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

test('a shared cloud leg falls back atomically when one provider is unavailable', t => {
  const topology = sharedCloudTopology();
  const filtered = filterAutoConfigTopologyProbes(
    topology,
    new Set<TAutoOptimizerProbeProvider>(['twitch']),
  );

  t.is(filtered.legs[0].measurement, 'estimated');
  t.is(filtered.legs[0].estimateReason, 'probe_disabled');
  t.deepEqual(filtered.legs[0].probeCandidates, []);
  t.deepEqual(filtered.probeCandidates, []);
  t.is(topology.legs[0].measurement, 'active', 'the classifier output is not mutated');
  t.is(topology.probeCandidates.length, 2);
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
              ? ('twitch-standard-v1' as const)
              : ('youtube-unbound-v1' as const),
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

test('YouTube display both cannot create two active probe leases in V1', t => {
  const legs = ['horizontal', 'vertical'].map(display => ({
    legId: display,
    display: display as 'horizontal' | 'vertical',
    destinations: [{ platform: 'youtube' as const }],
    route: 'direct' as const,
    probeCandidates: [
      {
        probeId: `${display}-youtube`,
        kind: 'youtube-unbound-v1' as const,
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

test('probe evidence is validated and strips attempt-local or unknown fields', t => {
  t.deepEqual(
    sanitizeAutoConfigProbeEvidence([
      {
        probeId: 'horizontal-twitch',
        provider: 'twitch',
        method: 'twitch-standard-active',
        measuredKbps: 6000,
        safeKbps: 4200,
        headroomPercent: 30,
        success: true,
        ceilingReached: false,
        streamKey: 'must-not-leak',
      },
      {
        provider: 'youtube',
        method: 'youtube-unbound-active',
        measuredKbps: 9000,
        safeKbps: 7200,
        headroomPercent: 20,
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
        method: 'youtube-unbound-active',
        success: false,
      },
    ]),
    [
      {
        provider: 'twitch',
        method: 'twitch-standard-active',
        measuredKbps: 6000,
        safeKbps: 4200,
        headroomPercent: 30,
        success: true,
        ceilingReached: false,
      },
      {
        provider: 'youtube',
        method: 'youtube-unbound-active',
        measuredKbps: 9000,
        safeKbps: 7200,
        headroomPercent: 20,
        success: true,
      },
      {
        provider: 'youtube',
        method: 'youtube-unbound-active',
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
        method: 'youtube-unbound-active',
        measuredKbps: Number.POSITIVE_INFINITY,
        safeKbps: 1,
        headroomPercent: 101,
        success: true,
      },
    ]),
    [],
  );
});
