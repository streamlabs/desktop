import {
  IAutoConfigCapabilities,
  IAutoConfigAdditionalVideoTuple,
  IAutoConfigEvent,
  IAutoOptimizerProgressDetail,
  IAutoOptimizerProbeEvidence,
  IAutoOptimizerTopology,
  TAutoOptimizerEncoderFamily,
  TAutoOptimizerPhase,
  TAutoOptimizerProbeKind,
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
  canConfirmYoutubeIngest: boolean;
}

export interface IAutoConfigProbeCoverage {
  measurement: 'active' | 'estimated';
  estimateReason?: 'probe_disabled' | 'partial_provider_probes';
  allowPromotion: boolean;
}

/**
 * Validate the registered canvas identities required before Desktop prepares
 * an active paired-workload request (Enhanced Broadcasting or two-leg Dual
 * Output). OSN object IDs are zero-based, so zero is a valid live canvas
 * identity; missing, fractional, negative, or duplicate paired identities
 * remain invalid.
 */
export function areAutoConfigActiveCanvasIdentitiesValid(
  primaryCanvasId: unknown,
  additionalCanvasId: unknown,
  paired: boolean,
): boolean {
  const isValid = (value: unknown): value is number =>
    Number.isSafeInteger(value) && Number(value) >= 0;

  return (
    isValid(primaryCanvasId) &&
    (!paired ||
      (isValid(additionalCanvasId) && Number(additionalCanvasId) !== Number(primaryCanvasId)))
  );
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
 * At least one attempted provider must succeed. By default, any selected or
 * attempted provider without successful evidence makes the result partial and
 * is accepted only when native lowers confidence to low. A joint Dual Output
 * attempt may explicitly use one supported provider to represent each canvas.
 */
export function isValidAutoConfigActiveProbeCoverage(p: {
  destinations: Array<{ platform: string }>;
  attemptedCandidates: Array<{
    provider: TAutoOptimizerProbeProvider;
    kind: TAutoOptimizerProbeKind;
  }>;
  evidence: IAutoOptimizerProbeEvidence[];
  confidence: string | undefined;
  /**
   * A jointly validated Dual Output leg deliberately selects one safe probe
   * provider to represent the canvas upload. Other probe-capable destinations
   * on that same canvas are not additional upload legs and do not make the
   * evidence partial.
   */
  requireAllProbeCapableDestinations?: boolean;
}): boolean {
  const selectedProviders = new Set<TAutoOptimizerProbeProvider>(
    p.destinations.flatMap(destination =>
      destination.platform === 'twitch' || destination.platform === 'youtube'
        ? [destination.platform]
        : [],
    ),
  );
  const attemptedProviders = new Set(p.attemptedCandidates.map(candidate => candidate.provider));
  const methodForKind: Record<TAutoOptimizerProbeKind, TAutoOptimizerProbeMethod> = {
    'twitch-standard': 'twitch-bandwidth-test',
    'twitch-enhanced-broadcasting': 'twitch-enhanced-broadcasting-test',
    'youtube-unbound': 'youtube-unbound-ramp',
  };
  const attemptedMethods = new Set(
    p.attemptedCandidates.map(
      candidate => `${candidate.provider}:${methodForKind[candidate.kind]}`,
    ),
  );
  const successfulProviders = new Set(
    p.evidence.filter(item => item.success).map(item => item.provider),
  );

  if (!attemptedProviders.size) return false;
  if ([...attemptedProviders].some(provider => !selectedProviders.has(provider))) return false;
  if (p.evidence.some(item => !attemptedMethods.has(`${item.provider}:${item.method}`))) {
    return false;
  }
  if (![...attemptedProviders].some(provider => successfulProviders.has(provider))) return false;

  const isPartial =
    [...attemptedProviders].some(provider => !successfulProviders.has(provider)) ||
    (p.requireAllProbeCapableDestinations !== false &&
      [...selectedProviders].some(provider => !successfulProviders.has(provider)));
  return !isPartial || p.confidence === 'low';
}

/** The session API can still optimize with estimates when no active probe is available. */
export function hasRequiredAutoConfigCapabilities(
  capabilities: IAutoConfigCapabilities | null | undefined,
): boolean {
  return Boolean(
    capabilities &&
      capabilities.apiVersion === 1 &&
      capabilities.resultSchemaVersion === 1 &&
      capabilities.previewApplySplit === true &&
      capabilities.awaitableCancel === true &&
      capabilities.perUploadLegResults === true &&
      capabilities.desktopOwnedApply === true &&
      typeof capabilities.dualOutputActiveProbes === 'boolean' &&
      typeof capabilities.enhancedBroadcastingDualOutputWorkload === 'boolean' &&
      capabilities.bandwidthModes?.includes('estimate'),
  );
}

/** Active modes are optional enhancements on top of the required estimate mode. */
export function supportedAutoConfigProbeKinds(
  capabilities: IAutoConfigCapabilities,
  runtime: IAutoConfigProbeRuntimeSupport,
): Set<TAutoOptimizerProbeKind> {
  const kinds = new Set<TAutoOptimizerProbeKind>();
  if (capabilities.bandwidthModes.includes('twitch-standard-active')) {
    kinds.add('twitch-standard');
  }
  if (capabilities.bandwidthModes.includes('twitch-enhanced-broadcasting-active')) {
    kinds.add('twitch-enhanced-broadcasting');
  }
  if (
    runtime.canConfirmYoutubeIngest &&
    capabilities.multipleActiveProbes === true &&
    capabilities.bandwidthModes.includes('youtube-unbound-active')
  ) {
    kinds.add('youtube-unbound');
  }
  return kinds;
}

/**
 * Identify the two-canvas shape whose aggregate upload and concurrent encoder
 * workload the native optimizer can validate as a single attempt. Each canvas
 * is represented by exactly one supported provider probe. Additional
 * destinations sharing that canvas are allowed but are not themselves probed.
 */
export function isEligibleAutoConfigDualOutputActiveTopology(
  topology: IAutoOptimizerTopology,
): boolean {
  if (
    topology.type !== 'dual-output' ||
    topology.legs.length !== 2 ||
    topology.probeCandidates.length !== 2
  ) {
    return false;
  }

  const displays = new Set(topology.legs.map(leg => leg.display));
  const legIds = new Set(topology.legs.map(leg => leg.legId));
  const providers = new Set<TAutoOptimizerProbeProvider>();
  if (
    displays.size !== 2 ||
    !displays.has('horizontal') ||
    !displays.has('vertical') ||
    legIds.size !== 2
  ) {
    return false;
  }

  for (const leg of topology.legs) {
    if (!leg.destinations.length || leg.probeCandidates.length !== 1) return false;
    const candidate = leg.probeCandidates[0];
    const carriesProvider = leg.destinations.some(
      destination => destination.platform === candidate.provider,
    );
    if (
      !carriesProvider ||
      candidate.legId !== leg.legId ||
      (candidate.provider === 'twitch' && candidate.kind !== 'twitch-standard') ||
      (candidate.provider === 'youtube' && candidate.kind !== 'youtube-unbound')
    ) {
      return false;
    }
    providers.add(candidate.provider);
  }

  const candidateKey = (candidate: IAutoOptimizerTopology['probeCandidates'][number]) =>
    `${candidate.probeId}\u0000${candidate.legId}\u0000${candidate.provider}\u0000${candidate.kind}`;
  const legProbeKeys = topology.legs.flatMap(leg => leg.probeCandidates.map(candidateKey));
  const topLevelProbeKeys = topology.probeCandidates.map(candidateKey);
  const probeIds = topology.probeCandidates.map(candidate => candidate.probeId);
  return (
    providers.size === 2 &&
    providers.has('twitch') &&
    providers.has('youtube') &&
    new Set(legProbeKeys).size === 2 &&
    new Set(topLevelProbeKeys).size === 2 &&
    new Set(probeIds).size === 2 &&
    topLevelProbeKeys.every(key => legProbeKeys.includes(key))
  );
}

/**
 * Validate the exact V1 physical-output shape for Twitch Dual Stream Enhanced
 * Broadcasting plus one standard output for each canvas carrying non-Twitch
 * destinations. The standard outputs may be workload-tested without an active
 * provider bandwidth probe.
 */
export function isEligibleAutoConfigEnhancedBroadcastingDualOutputTopology(
  topology: IAutoOptimizerTopology,
): boolean {
  if (topology.type !== 'enhanced-broadcasting-dual-output' || topology.legs.length < 2) {
    return false;
  }

  const enhancedLegs = topology.legs.filter(
    leg => leg.outputKind === 'twitch-enhanced-broadcasting',
  );
  const companionLegs = topology.legs.filter(leg => leg.outputKind === 'standard');
  if (
    enhancedLegs.length !== 1 ||
    companionLegs.length < 1 ||
    companionLegs.length > 2 ||
    enhancedLegs[0].display !== 'both' ||
    enhancedLegs[0].destinations.length !== 1 ||
    enhancedLegs[0].destinations[0].platform !== 'twitch'
  ) {
    return false;
  }

  const enhancedCandidates = enhancedLegs[0].probeCandidates;
  if (
    enhancedCandidates.length !== 1 ||
    enhancedCandidates[0].legId !== enhancedLegs[0].legId ||
    enhancedCandidates[0].provider !== 'twitch' ||
    enhancedCandidates[0].kind !== 'twitch-enhanced-broadcasting'
  ) {
    return false;
  }

  const companionDisplays = new Set<string>();
  for (const leg of companionLegs) {
    if (
      (leg.display !== 'horizontal' && leg.display !== 'vertical') ||
      companionDisplays.has(leg.display) ||
      !leg.destinations.length ||
      leg.destinations.some(destination => destination.platform === 'twitch') ||
      leg.probeCandidates.some(
        candidate =>
          candidate.legId !== leg.legId ||
          candidate.provider !== 'youtube' ||
          candidate.kind !== 'youtube-unbound',
      ) ||
      leg.probeCandidates.length > 1
    ) {
      return false;
    }
    companionDisplays.add(leg.display);
  }

  const candidateKey = (candidate: IAutoOptimizerTopology['probeCandidates'][number]) =>
    `${candidate.probeId}\u0000${candidate.legId}\u0000${candidate.provider}\u0000${candidate.kind}`;
  const legCandidates = topology.legs.flatMap(leg => leg.probeCandidates).map(candidateKey);
  const topLevelCandidates = topology.probeCandidates.map(candidateKey);
  return (
    new Set(topology.legs.map(leg => leg.legId)).size === topology.legs.length &&
    new Set(topLevelCandidates).size === topLevelCandidates.length &&
    legCandidates.length === topLevelCandidates.length &&
    topLevelCandidates.every(candidate => legCandidates.includes(candidate))
  );
}

/**
 * Select one supported provider per canvas for the joint two-leg experiment.
 * Prefer the classifier's deterministic provider order, while requiring the
 * pair to cover both Twitch and YouTube so native can establish two independent
 * lower bounds for the shared aggregate allocator.
 */
function selectAutoConfigDualOutputProbePair(
  topology: IAutoOptimizerTopology,
  supportedKinds: ReadonlySet<TAutoOptimizerProbeKind>,
): IAutoOptimizerTopology | null {
  if (topology.type !== 'dual-output' || topology.legs.length !== 2) return null;

  const candidatesByLeg = topology.legs.map(leg =>
    leg.probeCandidates.filter(candidate => supportedKinds.has(candidate.kind)),
  );
  for (const first of candidatesByLeg[0]) {
    for (const second of candidatesByLeg[1]) {
      if (first.provider === second.provider) continue;
      const selectedByLeg = new Map([
        [first.legId, first],
        [second.legId, second],
      ]);
      const selected: IAutoOptimizerTopology = {
        ...topology,
        legs: topology.legs.map(leg => ({
          ...leg,
          destinations: leg.destinations.map(destination => ({ ...destination })),
          probeCandidates: selectedByLeg.has(leg.legId) ? [selectedByLeg.get(leg.legId)!] : [],
          measurement: 'active',
          estimateReason: undefined,
        })),
        probeCandidates: [first, second],
      };
      if (isEligibleAutoConfigDualOutputActiveTopology(selected)) return selected;
    }
  }
  return null;
}

/**
 * Filter credential-free candidates against the negotiated native/runtime
 * capabilities. Supported provider probes remain useful independently; a
 * shared leg with partial coverage is identified explicitly and cannot promote
 * video quality from that incomplete evidence.
 */
export function filterAutoConfigTopologyProbes(
  topology: IAutoOptimizerTopology,
  supportedKinds: ReadonlySet<TAutoOptimizerProbeKind>,
  options: {
    dualOutputActiveProbes?: boolean;
    enhancedBroadcastingDualOutputWorkload?: boolean;
  } = {},
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
  // Native owns the allocator and simultaneous hardware proof for the two-leg
  // Twitch/YouTube experiment. When a canvas also targets an unsupported V1
  // provider, select one supported representative for that canvas instead of
  // disabling both active measurements.
  const selectedDualOutput =
    options.dualOutputActiveProbes === true
      ? selectAutoConfigDualOutputProbePair(topology, supportedKinds)
      : null;
  const unsafeDualOutput = filtered.type === 'dual-output' && !selectedDualOutput;
  const eligibleEnhancedBroadcastingDualOutput =
    options.enhancedBroadcastingDualOutputWorkload === true &&
    supportedKinds.has('twitch-enhanced-broadcasting') &&
    isEligibleAutoConfigEnhancedBroadcastingDualOutputTopology(topology);
  const unsafeEnhancedBroadcastingDualOutput =
    filtered.type === 'enhanced-broadcasting-dual-output' &&
    !eligibleEnhancedBroadcastingDualOutput;
  filtered.legs.forEach(leg => {
    const originalCandidates = leg.probeCandidates;
    if (unsafeDualOutput || unsafeEnhancedBroadcastingDualOutput) {
      leg.probeCandidates = [];
      leg.measurement = 'estimated';
      leg.estimateReason = unsafeDualOutput ? 'dual_output' : 'enhanced_broadcasting';
      return;
    }
    const selectedLeg = selectedDualOutput?.legs.find(selected => selected.legId === leg.legId);
    const supportedCandidates = selectedDualOutput
      ? selectedLeg!.probeCandidates
      : originalCandidates.filter(candidate => supportedKinds.has(candidate.kind));
    leg.probeCandidates = supportedCandidates;
    if (selectedDualOutput) {
      leg.measurement = 'active';
      leg.estimateReason = undefined;
    } else if (eligibleEnhancedBroadcastingDualOutput) {
      leg.measurement = supportedCandidates.length ? 'active' : 'estimated';
      leg.estimateReason = supportedCandidates.length ? undefined : 'probe_disabled';
    } else if (originalCandidates.length) {
      const coverage = autoConfigProbeCoverage(
        originalCandidates.length,
        supportedCandidates.length,
      );
      leg.measurement = coverage.measurement;
      leg.estimateReason = coverage.estimateReason;
    }
  });
  filtered.probeCandidates = filtered.legs.flatMap(leg => leg.probeCandidates);
  return filtered;
}

const EXPLICIT_BANDWIDTH_PROGRESS_CODES = new Set([
  'twitch_probe_confirming_capacity',
  'youtube_probe_waiting_for_ingest',
  'youtube_probe_baseline',
  'youtube_probe_confirming_stability',
  'youtube_probe_retrying',
  'twitch_probe_completed',
  'youtube_probe_completed',
  'youtube_probe_source_underfill_completed',
  'twitch_probe_unstable_estimate_used',
  'youtube_probe_unstable_estimate_used',
  'twitch_probe_failed_estimate_used',
  'youtube_probe_failed_estimate_used',
]);
const BITRATE_BANDWIDTH_PROGRESS_CODES = new Set([
  'twitch_probe_confirming_capacity',
  'youtube_probe_baseline',
  'youtube_probe_confirming_stability',
  'youtube_probe_retrying',
]);
/** Give real sequential work and terminal decisions distinct readable milestones. */
export function autoConfigPhaseStepKey(
  phase: TAutoOptimizerPhase,
  provider?: TAutoOptimizerProbeProvider | null,
  code?: string | null,
  detail?: Partial<
    Pick<
      IAutoOptimizerProgressDetail,
      | 'encoderId'
      | 'encoderTitle'
      | 'width'
      | 'height'
      | 'fpsNum'
      | 'fpsDen'
      | 'additionalVideo'
      | 'targetBitrateKbps'
      | 'availableBitrateKbps'
      | 'selectedBitrateKbps'
    >
  >,
): string {
  const tuple = detail
    ? `${detail.width || 0}x${detail.height || 0}:${detail.fpsNum || 0}/${detail.fpsDen || 0}`
    : '0x0:0/0';
  const additionalTuple = detail?.additionalVideo
    ? `${detail.additionalVideo.width}x${detail.additionalVideo.height}:${detail.additionalVideo.fpsNum}/${detail.additionalVideo.fpsDen}`
    : 'none';
  const encoder = detail?.encoderTitle || detail?.encoderId || 'encoder';

  if (phase === 'hardware' && code === 'dual_output_testing_workload') {
    return `hardware:dual-output:workload:${encoder}:${tuple}`;
  }
  if (phase === 'recommendation' && code === 'dual_output_allocating_upload') {
    return `recommendation:dual-output:allocating:${detail?.selectedBitrateKbps || 0}:${
      detail?.availableBitrateKbps || 0
    }`;
  }
  if (phase === 'bandwidth' && provider === 'twitch') {
    if (code === 'enhanced_broadcasting_requesting_ladder') {
      return 'bandwidth:twitch:enhanced-broadcasting:requesting-ladder';
    }
    if (
      code === 'enhanced_broadcasting_testing_candidate' ||
      code === 'enhanced_broadcasting_testing_concurrent_outputs' ||
      code === 'enhanced_broadcasting_validating_target_cadence' ||
      code === 'enhanced_broadcasting_candidate_rejected' ||
      code === 'enhanced_broadcasting_candidate_selected'
    ) {
      return `bandwidth:twitch:${code}:${tuple}${
        detail?.additionalVideo ? `:${additionalTuple}` : ''
      }`;
    }
  }
  if (phase === 'bandwidth' && provider) {
    if (
      code === 'active_probe_not_eligible' ||
      code === 'active_probe_set_incomplete' ||
      code === 'dual_output_multiple_active_legs'
    ) {
      return 'bandwidth:estimate';
    }
    const status = code && EXPLICIT_BANDWIDTH_PROGRESS_CODES.has(code) ? code : 'measuring';
    const bitrate =
      status === 'measuring' || BITRATE_BANDWIDTH_PROGRESS_CODES.has(status)
        ? detail?.targetBitrateKbps || 0
        : 0;
    return `${phase}:${provider}:${status}:${bitrate}`;
  }
  if (phase === 'hardware' && code === 'hardware_discovering_encoders') {
    return 'hardware:discovering';
  }
  if (phase === 'hardware' && code === 'hardware_provider_managed') {
    return 'provider-managed';
  }
  if (
    phase === 'hardware' &&
    (code === 'hardware_testing_encoder' || code === 'hardware_testing_x264')
  ) {
    return `hardware:${code}:${encoder}:${tuple}`;
  }
  if (phase === 'hardware' && code === 'hardware_validating_encoder') {
    return `hardware:validating:${encoder}:${tuple}`;
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
    if (code === 'hardware_testing_encoder_surfaces') {
      return `hardware:${kind}:${encoder}:${detail?.width || 0}x${detail?.height || 0}`;
    }
    return `hardware:${kind}:${encoder}:${tuple}`;
  }
  if (phase === 'hardware' && code === 'hardware_encoder_rejected') {
    return `hardware:rejected:${encoder}`;
  }
  if (phase === 'hardware' && code === 'hardware_encoder_selected') {
    return `hardware:selected:${encoder}:${tuple}`;
  }
  if (phase === 'recommendation' && code === 'recommendation_selecting_quality') {
    return `recommendation:selecting:${detail?.availableBitrateKbps || 0}`;
  }
  if (phase === 'recommendation' && code === 'recommendation_quality_selected') {
    if (
      !detail?.width ||
      !detail?.height ||
      !detail?.fpsNum ||
      !detail?.fpsDen ||
      !detail?.selectedBitrateKbps
    ) {
      return 'recommendation';
    }
    return `recommendation:selected:${tuple}:${detail?.selectedBitrateKbps || 0}`;
  }
  if (phase === 'recommendation' && code === 'recommendation_provider_managed') {
    return 'provider-managed';
  }
  return String(phase);
}

export type TAutoConfigPhaseStepDisposition =
  | 'update-displayed'
  | 'update-pending-tail'
  | 'enqueue';

/**
 * Coalesce only uninterrupted repeats of the same visible status. If another
 * status is already queued, a return to the currently displayed status is a
 * real A -> B -> A transition and must be queued again.
 */
export function autoConfigPhaseStepDisposition(
  displayedKey: string | null,
  pendingKeys: string[],
  nextKey: string,
): TAutoConfigPhaseStepDisposition {
  if (!pendingKeys.length && displayedKey === nextKey) return 'update-displayed';
  if (pendingKeys[pendingKeys.length - 1] === nextKey) return 'update-pending-tail';
  return 'enqueue';
}

/** Validate optional applied video-bitrate feedback from the native probe. */
export function sanitizeAutoConfigProbeTargetBitrateKbps(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 100000
    ? value
    : null;
}

function sanitizeProgressText(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : null;
}

function sanitizeProgressInteger(value: unknown, maximum: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= maximum
    ? value
    : null;
}

function sanitizeAdditionalVideoTuple(value: unknown): IAutoConfigAdditionalVideoTuple | null {
  if (!value || typeof value !== 'object') return null;
  const tuple = value as Record<string, unknown>;
  const width = sanitizeProgressInteger(tuple.width, 16384);
  const height = sanitizeProgressInteger(tuple.height, 16384);
  const fpsNum = sanitizeProgressInteger(tuple.fpsNum, 1000000);
  const fpsDen = sanitizeProgressInteger(tuple.fpsDen, 1000000);
  if (
    tuple.display !== 'vertical' ||
    !width ||
    width % 2 !== 0 ||
    !height ||
    height % 2 !== 0 ||
    !fpsNum ||
    !fpsDen ||
    fpsNum / fpsDen > 240
  ) {
    return null;
  }
  return { display: 'vertical', width, height, fpsNum, fpsDen };
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
  const code =
    typeof event.code === 'string' && /^[a-z0-9_]+$/.test(event.code) && event.code.length <= 128
      ? event.code
      : null;
  const provider =
    phase === 'bandwidth' && (event.provider === 'twitch' || event.provider === 'youtube')
      ? event.provider
      : null;
  const encoderFamily = AUTO_OPTIMIZER_ENCODER_FAMILIES.has(String(event.encoderFamily))
    ? (event.encoderFamily as TAutoOptimizerEncoderFamily)
    : null;

  return {
    code,
    provider,
    targetBitrateKbps:
      provider !== null ? sanitizeAutoConfigProbeTargetBitrateKbps(event.targetBitrateKbps) : null,
    availableBitrateKbps: sanitizeAutoConfigProbeTargetBitrateKbps(event.availableBitrateKbps),
    encoderId: sanitizeProgressText(event.encoderId, 256),
    encoderFamily,
    encoderTitle: sanitizeProgressText(event.encoderTitle, 256),
    width: sanitizeProgressInteger(event.width, 16384),
    height: sanitizeProgressInteger(event.height, 16384),
    fpsNum: sanitizeProgressInteger(event.fpsNum, 1000000),
    fpsDen: sanitizeProgressInteger(event.fpsDen, 1000000),
    additionalVideo: sanitizeAdditionalVideoTuple(event.additionalVideo),
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
    (provider === 'twitch' &&
      (method === 'twitch-bandwidth-test' || method === 'twitch-enhanced-broadcasting-test')) ||
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
    const enhancedBroadcasting = evidence.method === 'twitch-enhanced-broadcasting-test';
    const hasMeasured = evidence.measuredKbps !== undefined;
    const hasSafe = evidence.safeKbps !== undefined;
    const hasHeadroom = evidence.headroomPercent !== undefined;
    if (
      (hasMeasured && !isFiniteNonNegative(evidence.measuredKbps)) ||
      (hasSafe && !isFiniteNonNegative(evidence.safeKbps)) ||
      (hasHeadroom &&
        (!isFiniteNonNegative(evidence.headroomPercent) || evidence.headroomPercent > 100)) ||
      (!enhancedBroadcasting && evidence.success && (!hasMeasured || !hasSafe || !hasHeadroom))
    ) {
      return [];
    }

    const testedWidth = sanitizeProgressInteger(evidence.testedWidth, 16384);
    const testedHeight = sanitizeProgressInteger(evidence.testedHeight, 16384);
    const testedFpsNum = sanitizeProgressInteger(evidence.testedFpsNum, 1000000);
    const testedFpsDen = sanitizeProgressInteger(evidence.testedFpsDen, 1000000);
    const videoTrackCount = sanitizeProgressInteger(evidence.videoTrackCount, 64);
    const configuredAggregateBitrateKbps = sanitizeAutoConfigProbeTargetBitrateKbps(
      evidence.configuredAggregateBitrateKbps,
    );
    const testedAdditionalVideo = sanitizeAdditionalVideoTuple(evidence.testedAdditionalVideo);
    if (
      (evidence.testedWidth !== undefined && !testedWidth) ||
      (evidence.testedHeight !== undefined && !testedHeight) ||
      (evidence.testedFpsNum !== undefined && !testedFpsNum) ||
      (evidence.testedFpsDen !== undefined && !testedFpsDen) ||
      (evidence.videoTrackCount !== undefined && !videoTrackCount) ||
      (evidence.configuredAggregateBitrateKbps !== undefined && !configuredAggregateBitrateKbps) ||
      (evidence.testedAdditionalVideo !== undefined && !testedAdditionalVideo) ||
      (!enhancedBroadcasting && evidence.testedAdditionalVideo !== undefined) ||
      (testedFpsNum && testedFpsDen && testedFpsNum / testedFpsDen > 240) ||
      (enhancedBroadcasting &&
        evidence.success &&
        (!testedWidth ||
          testedWidth % 2 !== 0 ||
          !testedHeight ||
          testedHeight % 2 !== 0 ||
          !testedFpsNum ||
          !testedFpsDen))
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
        ...(testedWidth ? { testedWidth } : {}),
        ...(testedHeight ? { testedHeight } : {}),
        ...(testedFpsNum ? { testedFpsNum } : {}),
        ...(testedFpsDen ? { testedFpsDen } : {}),
        ...(videoTrackCount ? { videoTrackCount } : {}),
        ...(configuredAggregateBitrateKbps ? { configuredAggregateBitrateKbps } : {}),
        ...(testedAdditionalVideo ? { testedAdditionalVideo } : {}),
      },
    ];
  });
}
