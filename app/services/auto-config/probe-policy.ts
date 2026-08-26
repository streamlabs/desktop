import {
  IAutoConfigCapabilities,
  IAutoConfigEvent,
  IAutoOptimizerProgressDetail,
  IAutoOptimizerProbeEvidence,
  IAutoOptimizerTopology,
  TAutoOptimizerEncoderFamily,
  TAutoOptimizerPhase,
  TAutoOptimizerProbeMethod,
  TAutoOptimizerProbeProvider,
} from './types';

const AUTO_OPTIMIZER_ENCODER_FAMILIES = new Set([
  'obs_nvenc_h264_tex',
  'qsv',
  'amd',
  'apple',
  'x264',
]);

export interface IAutoConfigProbeRuntimeSupport {
  twitchFeatureEnabled: boolean;
  youtubeFeatureEnabled: boolean;
  canConfirmYoutubeIngest: boolean;
}

export interface IAutoConfigProbeCoverage {
  measurement: 'active' | 'estimated';
  estimateReason?: 'probe_disabled' | 'partial_provider_probes';
  allowPromotion: boolean;
}

/**
 * Describe how much of a leg's provider-probe plan is available. A successful
 * provider remains useful when another provider cannot be prepared, but that
 * partial evidence must not unlock a resolution or frame-rate promotion.
 */
export function autoConfigProbeCoverage(
  expectedProbeCount: number,
  availableProbeCount: number,
): IAutoConfigProbeCoverage {
  if (availableProbeCount <= 0) {
    return {
      measurement: 'estimated',
      estimateReason: 'probe_disabled',
      allowPromotion: false,
    };
  }
  if (availableProbeCount < expectedProbeCount) {
    return {
      measurement: 'active',
      estimateReason: 'partial_provider_probes',
      allowPromotion: false,
    };
  }
  return { measurement: 'active', allowPromotion: true };
}

/**
 * Validate active native evidence against the exact attempt Desktop prepared.
 * At least one attempted provider must succeed. Any selected or attempted
 * provider without successful evidence makes the result partial and is
 * accepted only when native lowers confidence to low.
 */
export function isValidAutoConfigActiveProbeCoverage(p: {
  destinations: Array<{ platform: string }>;
  attemptedCandidates: Array<{ provider: TAutoOptimizerProbeProvider }>;
  evidence: IAutoOptimizerProbeEvidence[];
  confidence: string | undefined;
}): boolean {
  const selectedProviders = new Set<TAutoOptimizerProbeProvider>(
    p.destinations.flatMap(destination =>
      destination.platform === 'twitch' || destination.platform === 'youtube'
        ? [destination.platform]
        : [],
    ),
  );
  const attemptedProviders = new Set(p.attemptedCandidates.map(candidate => candidate.provider));
  const successfulProviders = new Set(
    p.evidence.filter(item => item.success).map(item => item.provider),
  );

  if (!attemptedProviders.size) return false;
  if ([...attemptedProviders].some(provider => !selectedProviders.has(provider))) return false;
  if ([...successfulProviders].some(provider => !attemptedProviders.has(provider))) return false;
  if (![...attemptedProviders].some(provider => successfulProviders.has(provider))) return false;

  const isPartial =
    [...attemptedProviders].some(provider => !successfulProviders.has(provider)) ||
    [...selectedProviders].some(provider => !successfulProviders.has(provider));
  return !isPartial || p.confidence === 'low';
}

/** The session API can still optimize with estimates when no active probe is available. */
export function hasRequiredAutoConfigCapabilities(
  capabilities: IAutoConfigCapabilities | null | undefined,
): boolean {
  return Boolean(
    capabilities &&
      capabilities.apiVersion === 2 &&
      capabilities.resultSchemaVersion === 1 &&
      capabilities.previewApplySplit === true &&
      capabilities.awaitableCancel === true &&
      capabilities.perUploadLegResults === true &&
      capabilities.desktopOwnedApply === true &&
      capabilities.bandwidthModes?.includes('estimate'),
  );
}

/** Active modes are optional enhancements on top of the required estimate mode. */
export function supportedAutoConfigProbeProviders(
  capabilities: IAutoConfigCapabilities,
  runtime: IAutoConfigProbeRuntimeSupport,
): Set<TAutoOptimizerProbeProvider> {
  const providers = new Set<TAutoOptimizerProbeProvider>();
  if (
    runtime.twitchFeatureEnabled &&
    capabilities.bandwidthModes.includes('twitch-standard-active')
  ) {
    providers.add('twitch');
  }
  if (
    runtime.youtubeFeatureEnabled &&
    runtime.canConfirmYoutubeIngest &&
    capabilities.multipleActiveProbes === true &&
    capabilities.bandwidthModes.includes('youtube-unbound-active')
  ) {
    providers.add('youtube');
  }
  return providers;
}

/**
 * Filter credential-free candidates against the negotiated native/runtime
 * capabilities. Supported provider probes remain useful independently; a
 * shared leg with partial coverage is identified explicitly and cannot promote
 * video quality from that incomplete evidence.
 */
export function filterAutoConfigTopologyProbes(
  topology: IAutoOptimizerTopology,
  supportedProviders: ReadonlySet<TAutoOptimizerProbeProvider>,
): IAutoOptimizerTopology {
  const filtered: IAutoOptimizerTopology = {
    ...topology,
    legs: topology.legs.map(leg => ({
      ...leg,
      destinations: leg.destinations.map(destination => ({ ...destination })),
      probeCandidates: leg.probeCandidates.map(candidate => ({ ...candidate })),
    })),
    probeCandidates: [],
  };
  const populatedLegs = filtered.legs.filter(leg => leg.destinations.length > 0);
  // There is no aggregate uplink allocator for multiple simultaneous outputs.
  // Sequentially giving each leg the full measured uplink would overcommit the
  // connection, so every multi-leg Dual Output topology remains estimate-only.
  // A multi-destination leg nested under Dual Output is also excluded because
  // the native contract only supports its single direct upload form.
  const unsafeDualOutput =
    filtered.type === 'dual-output' &&
    (populatedLegs.length !== 1 ||
      populatedLegs[0].route !== 'direct' ||
      populatedLegs[0].destinations.length !== 1);
  filtered.legs.forEach(leg => {
    const originalCandidates = leg.probeCandidates;
    const supportedCandidates = unsafeDualOutput
      ? []
      : originalCandidates.filter(candidate => supportedProviders.has(candidate.provider));
    leg.probeCandidates = supportedCandidates;
    if (originalCandidates.length) {
      const coverage = autoConfigProbeCoverage(
        originalCandidates.length,
        supportedCandidates.length,
      );
      leg.measurement = coverage.measurement;
      leg.estimateReason = unsafeDualOutput ? 'dual_output' : coverage.estimateReason;
    }
  });
  filtered.probeCandidates = filtered.legs.flatMap(leg => leg.probeCandidates);
  return filtered;
}

/** Give real sequential work and terminal decisions distinct readable milestones. */
export function autoConfigPhaseStepKey(
  phase: TAutoOptimizerPhase,
  provider?: TAutoOptimizerProbeProvider | null,
  code?: string | null,
  detail?: Pick<
    IAutoOptimizerProgressDetail,
    'encoderId' | 'width' | 'height' | 'fpsNum' | 'fpsDen'
  >,
): string {
  if (
    phase === 'bandwidth' &&
    provider &&
    (code === `${provider}_probe_completed` ||
      code === `${provider}_probe_failed_estimate_used` ||
      code === `${provider}_probe_unstable_estimate_used` ||
      (provider === 'youtube' && code === 'youtube_probe_source_underfill_completed'))
  ) {
    return `${phase}:${provider}:complete`;
  }
  if (phase === 'bandwidth' && provider) return `${phase}:${provider}`;
  if (phase === 'hardware' && code === 'hardware_discovering_encoders') {
    return 'hardware:discovering';
  }
  if (phase === 'hardware' && code === 'hardware_validating_encoder') {
    return 'hardware:validating';
  }
  if (
    phase === 'hardware' &&
    (code === 'hardware_testing_encoder_surfaces' ||
      code === 'hardware_validating_target_cadence' ||
      code === 'hardware_target_cadence_rejected')
  ) {
    const kind =
      code === 'hardware_testing_encoder_surfaces'
        ? 'surfaces'
        : code === 'hardware_validating_target_cadence'
        ? 'target-cadence'
        : 'target-cadence-rejected';
    const attempt = detail
      ? [
          detail.encoderId || 'encoder',
          `${detail.width || 0}x${detail.height || 0}`,
          `${detail.fpsNum || 0}/${detail.fpsDen || 0}`,
        ].join(':')
      : '';
    return `hardware:${kind}${attempt ? `:${attempt}` : ''}`;
  }
  if (phase === 'hardware' && code === 'hardware_encoder_selected') {
    return 'hardware:selected';
  }
  if (phase === 'recommendation' && code === 'recommendation_selecting_quality') {
    return 'recommendation:selecting';
  }
  if (phase === 'recommendation' && code === 'recommendation_quality_selected') {
    return 'recommendation:selected';
  }
  if (phase === 'recommendation' && code === 'recommendation_provider_managed') {
    return 'recommendation:provider-managed';
  }
  return String(phase);
}

/** Validate optional applied video-bitrate feedback from the native probe. */
export function sanitizeAutoConfigProbeTargetBitrateKbps(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 100000
    ? value
    : null;
}

function sanitizeProgressText(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
    ? value
    : null;
}

function sanitizeProgressInteger(value: unknown, maximum: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= maximum
    ? value
    : null;
}

/**
 * Keep native attempt detail serializable and bounded before mirroring it to
 * visible renderers. Unknown codes remain available for diagnostics but never
 * become untranslated UI text.
 */
export function sanitizeAutoConfigProgressDetail(
  event: IAutoConfigEvent,
  phase: TAutoOptimizerPhase,
): IAutoOptimizerProgressDetail {
  const provider =
    phase === 'bandwidth' && (event.provider === 'twitch' || event.provider === 'youtube')
      ? event.provider
      : null;
  const encoderFamily = AUTO_OPTIMIZER_ENCODER_FAMILIES.has(String(event.encoderFamily))
    ? (event.encoderFamily as TAutoOptimizerEncoderFamily)
    : null;

  return {
    code:
      typeof event.code === 'string' && /^[a-z0-9_]+$/.test(event.code) && event.code.length <= 128
        ? event.code
        : null,
    provider,
    targetBitrateKbps:
      provider !== null ? sanitizeAutoConfigProbeTargetBitrateKbps(event.targetBitrateKbps) : null,
    availableBitrateKbps: sanitizeAutoConfigProbeTargetBitrateKbps(
      event.availableBitrateKbps,
    ),
    encoderId: sanitizeProgressText(event.encoderId, 256),
    encoderFamily,
    encoderTitle: sanitizeProgressText(event.encoderTitle, 256),
    width: sanitizeProgressInteger(event.width, 16384),
    height: sanitizeProgressInteger(event.height, 16384),
    fpsNum: sanitizeProgressInteger(event.fpsNum, 1000000),
    fpsDen: sanitizeProgressInteger(event.fpsDen, 1000000),
    selectedBitrateKbps: sanitizeAutoConfigProbeTargetBitrateKbps(event.selectedBitrateKbps),
  };
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isAutoOptimizerProbeMethod(
  provider: TAutoOptimizerProbeProvider,
  method: unknown,
): method is TAutoOptimizerProbeMethod {
  return (
    (provider === 'twitch' && method === 'twitch-bandwidth-test') ||
    (provider === 'youtube' && method === 'youtube-unbound-ramp')
  );
}

/**
 * Treat native output as untrusted at the renderer boundary. Probe IDs and any
 * unknown fields remain attempt-local and are intentionally not mirrored.
 */
export function sanitizeAutoConfigProbeEvidence(value: unknown): IAutoOptimizerProbeEvidence[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const evidence = item as Record<string, unknown>;
    if (evidence.provider !== 'twitch' && evidence.provider !== 'youtube') return [];
    if (
      !isAutoOptimizerProbeMethod(evidence.provider, evidence.method) ||
      typeof evidence.success !== 'boolean'
    ) {
      return [];
    }
    const hasMeasured = evidence.measuredKbps !== undefined;
    const hasSafe = evidence.safeKbps !== undefined;
    const hasHeadroom = evidence.headroomPercent !== undefined;
    if (
      (hasMeasured && !isFiniteNonNegative(evidence.measuredKbps)) ||
      (hasSafe && !isFiniteNonNegative(evidence.safeKbps)) ||
      (hasHeadroom &&
        (!isFiniteNonNegative(evidence.headroomPercent) || evidence.headroomPercent > 100)) ||
      (evidence.success && (!hasMeasured || !hasSafe || !hasHeadroom))
    ) {
      return [];
    }

    return [
      {
        provider: evidence.provider,
        method: evidence.method,
        success: evidence.success,
        ...(hasMeasured ? { measuredKbps: evidence.measuredKbps as number } : {}),
        ...(hasSafe ? { safeKbps: evidence.safeKbps as number } : {}),
        ...(hasHeadroom ? { headroomPercent: evidence.headroomPercent as number } : {}),
        ...(typeof evidence.ceilingReached === 'boolean'
          ? { ceilingReached: evidence.ceilingReached }
          : {}),
      },
    ];
  });
}
