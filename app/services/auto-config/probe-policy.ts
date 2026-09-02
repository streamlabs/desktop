import {
  IAutoConfigAdditionalVideoTuple,
  IAutoConfigEvent,
  IAutoConfigAttemptRequestOutput,
  IAutoConfigRequestOutput,
  IAutoOptimizerProbeCandidate,
  IAutoOptimizerProgressDetail,
  IAutoOptimizerProbeEvidence,
  IAutoOptimizerStreamSetup,
  TAutoOptimizerEncoderFamily,
  TAutoOptimizerPhase,
  TAutoOptimizerProbeKind,
  TAutoOptimizerProbeMethod,
  TAutoOptimizerProbeProvider,
} from './types';

/**
 * Retain only acceptance inputs after OSN has copied the request. Provider
 * credentials live exclusively in nested probes and must not survive in the
 * attempt context used to validate the eventual result.
 */
export function credentialFreeAutoConfigRequestOutput(
  output: IAutoConfigRequestOutput,
): IAutoConfigAttemptRequestOutput {
  return {
    outputId: output.outputId,
    display: output.display,
    outputKind: output.outputKind,
    destinations: [...output.destinations],
    current: { ...output.current },
    ...(output.limits ? { limits: { ...output.limits } } : {}),
    ...(output.additionalVideo
      ? {
          additionalVideo: {
            display: output.additionalVideo.display,
            current: { ...output.additionalVideo.current },
            ...(output.additionalVideo.limits
              ? { limits: { ...output.additionalVideo.limits } }
              : {}),
          },
        }
      : {}),
    ...(output.estimateReason ? { estimateReason: output.estimateReason } : {}),
  };
}

const AUTO_OPTIMIZER_ENCODER_FAMILIES = new Set([
  'obs_nvenc_h264_tex',
  'qsv',
  'amd',
  'apple',
  'x264',
]);

export interface IAutoConfigProbeCoverage {
  measurement: 'active' | 'estimated';
  estimateReason?: 'probe_disabled' | 'partial_provider_probes';
  allowPromotion: boolean;
}

/**
 * Validate the registered canvas identities required before Desktop prepares
 * an active paired-workload request (Enhanced Broadcasting or two-output Dual
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
 * Describe how much of an output's provider-probe plan is available. A successful
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
   * A jointly validated Dual Output output deliberately selects one safe probe
   * provider to represent the canvas upload. Other probe-capable destinations
   * on that same canvas are not additional outputs and do not make the
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
    p.evidence.filter(item => item.success).map(item => item.platform),
  );

  if (!attemptedProviders.size) return false;
  if ([...attemptedProviders].some(provider => !selectedProviders.has(provider))) return false;
  if (p.evidence.some(item => !attemptedMethods.has(`${item.platform}:${item.method}`))) {
    return false;
  }
  if (![...attemptedProviders].some(provider => successfulProviders.has(provider))) return false;

  const isPartial =
    [...attemptedProviders].some(provider => !successfulProviders.has(provider)) ||
    (p.requireAllProbeCapableDestinations !== false &&
      [...selectedProviders].some(provider => !successfulProviders.has(provider)));
  return !isPartial || p.confidence === 'low';
}

/**
 * The paired V1 native facade defines the complete probe contract, including
 * YouTube ingest confirmation on its run handle.
 */
export function supportedAutoConfigProbeKinds(): ReadonlySet<TAutoOptimizerProbeKind> {
  return new Set<TAutoOptimizerProbeKind>([
    'twitch-standard',
    'twitch-enhanced-broadcasting',
    'youtube-unbound',
  ]);
}

export function autoConfigProviderForProbeKind(kind: unknown): TAutoOptimizerProbeProvider | null {
  if (kind === 'twitch-standard' || kind === 'twitch-enhanced-broadcasting') return 'twitch';
  return kind === 'youtube-unbound' ? 'youtube' : null;
}

/**
 * Identify the two-canvas shape whose aggregate upload and concurrent encoder
 * workload the native optimizer can validate as a single attempt. Each canvas
 * is represented by exactly one supported provider probe. Additional
 * destinations sharing that canvas are allowed but are not themselves probed.
 */
export function isEligibleAutoConfigDualOutputActiveStreamSetup(
  streamSetup: IAutoOptimizerStreamSetup,
): boolean {
  if (streamSetup.type !== 'dual-output' || streamSetup.outputs.length !== 2) {
    return false;
  }

  const displays = new Set(streamSetup.outputs.map(output => output.display));
  const outputIds = new Set(streamSetup.outputs.map(output => output.outputId));
  const providers = new Set<TAutoOptimizerProbeProvider>();
  if (
    displays.size !== 2 ||
    !displays.has('horizontal') ||
    !displays.has('vertical') ||
    outputIds.size !== 2
  ) {
    return false;
  }

  for (const output of streamSetup.outputs) {
    if (!output.destinations.length || output.probeCandidates.length !== 1) return false;
    const candidate = output.probeCandidates[0];
    const carriesProvider = output.destinations.some(
      destination => destination.platform === candidate.provider,
    );
    if (
      !carriesProvider ||
      candidate.outputId !== output.outputId ||
      (candidate.provider === 'twitch' && candidate.kind !== 'twitch-standard') ||
      (candidate.provider === 'youtube' && candidate.kind !== 'youtube-unbound')
    ) {
      return false;
    }
    providers.add(candidate.provider);
  }

  const candidateKey = (candidate: IAutoOptimizerProbeCandidate) =>
    `${candidate.probeId}\u0000${candidate.outputId}\u0000${candidate.provider}\u0000${candidate.kind}`;
  const candidates = streamSetup.outputs.flatMap(output => output.probeCandidates);
  const candidateKeys = candidates.map(candidateKey);
  const probeIds = candidates.map(candidate => candidate.probeId);
  return (
    providers.size === 2 &&
    providers.has('twitch') &&
    providers.has('youtube') &&
    candidates.length === 2 &&
    new Set(candidateKeys).size === 2 &&
    new Set(probeIds).size === 2
  );
}

/**
 * Validate the exact V1 physical-output shape for Twitch Dual Stream Enhanced
 * Broadcasting plus one standard output for each canvas carrying non-Twitch
 * destinations. The standard outputs may be workload-tested without an active
 * provider bandwidth probe.
 */
export function isEligibleAutoConfigEnhancedBroadcastingDualOutputStreamSetup(
  streamSetup: IAutoOptimizerStreamSetup,
): boolean {
  if (streamSetup.type !== 'enhanced-broadcasting-dual-output' || streamSetup.outputs.length < 2) {
    return false;
  }

  const enhancedOutputs = streamSetup.outputs.filter(
    output => output.outputKind === 'twitch-enhanced-broadcasting',
  );
  const companionOutputs = streamSetup.outputs.filter(output => output.outputKind === 'standard');
  if (
    enhancedOutputs.length !== 1 ||
    companionOutputs.length < 1 ||
    companionOutputs.length > 2 ||
    enhancedOutputs[0].display !== 'both' ||
    enhancedOutputs[0].destinations.length !== 1 ||
    enhancedOutputs[0].destinations[0].platform !== 'twitch'
  ) {
    return false;
  }

  const enhancedCandidates = enhancedOutputs[0].probeCandidates;
  if (
    enhancedCandidates.length !== 1 ||
    enhancedCandidates[0].outputId !== enhancedOutputs[0].outputId ||
    enhancedCandidates[0].provider !== 'twitch' ||
    enhancedCandidates[0].kind !== 'twitch-enhanced-broadcasting'
  ) {
    return false;
  }

  const companionDisplays = new Set<string>();
  for (const output of companionOutputs) {
    if (
      (output.display !== 'horizontal' && output.display !== 'vertical') ||
      companionDisplays.has(output.display) ||
      !output.destinations.length ||
      output.destinations.some(destination => destination.platform === 'twitch') ||
      output.probeCandidates.some(
        candidate =>
          candidate.outputId !== output.outputId ||
          candidate.provider !== 'youtube' ||
          candidate.kind !== 'youtube-unbound',
      ) ||
      output.probeCandidates.length > 1
    ) {
      return false;
    }
    companionDisplays.add(output.display);
  }

  const candidateKey = (candidate: IAutoOptimizerProbeCandidate) =>
    `${candidate.probeId}\u0000${candidate.outputId}\u0000${candidate.provider}\u0000${candidate.kind}`;
  const candidateKeys = streamSetup.outputs
    .flatMap(output => output.probeCandidates)
    .map(candidateKey);
  return (
    new Set(streamSetup.outputs.map(output => output.outputId)).size ===
      streamSetup.outputs.length && new Set(candidateKeys).size === candidateKeys.length
  );
}

/**
 * Select one supported provider per canvas for the joint two-output experiment.
 * Prefer the classifier's deterministic provider order, while requiring the
 * pair to cover both Twitch and YouTube so native can establish two independent
 * lower bounds for the shared aggregate allocator.
 */
function selectAutoConfigDualOutputProbePair(
  streamSetup: IAutoOptimizerStreamSetup,
  supportedKinds: ReadonlySet<TAutoOptimizerProbeKind>,
): IAutoOptimizerStreamSetup | null {
  if (streamSetup.type !== 'dual-output' || streamSetup.outputs.length !== 2) return null;

  const candidatesByOutput = streamSetup.outputs.map(output =>
    output.probeCandidates.filter(candidate => supportedKinds.has(candidate.kind)),
  );
  for (const first of candidatesByOutput[0]) {
    for (const second of candidatesByOutput[1]) {
      if (first.provider === second.provider) continue;
      const selectedByOutput = new Map([
        [first.outputId, first],
        [second.outputId, second],
      ]);
      const selected: IAutoOptimizerStreamSetup = {
        ...streamSetup,
        outputs: streamSetup.outputs.map(output => ({
          ...output,
          destinations: output.destinations.map(destination => ({ ...destination })),
          probeCandidates: selectedByOutput.has(output.outputId)
            ? [selectedByOutput.get(output.outputId)!]
            : [],
          measurement: 'active',
          estimateReason: undefined,
        })),
      };
      if (isEligibleAutoConfigDualOutputActiveStreamSetup(selected)) return selected;
    }
  }
  return null;
}

/**
 * Filter credential-free candidates against the providers this Desktop run can
 * prepare. Supported provider probes remain useful independently; a shared output
 * with partial coverage is identified explicitly and cannot promote video
 * quality from that incomplete evidence.
 */
export function filterAutoConfigStreamSetupProbes(
  streamSetup: IAutoOptimizerStreamSetup,
  supportedKinds: ReadonlySet<TAutoOptimizerProbeKind>,
): IAutoOptimizerStreamSetup {
  const filtered: IAutoOptimizerStreamSetup = {
    ...streamSetup,
    outputs: streamSetup.outputs.map(output => ({
      ...output,
      destinations: output.destinations.map(destination => ({ ...destination })),
      probeCandidates: output.probeCandidates.map(candidate => ({ ...candidate })),
    })),
  };
  // Native owns the allocator and simultaneous hardware proof for the two-output
  // Twitch/YouTube experiment. When a canvas also targets an unsupported V1
  // provider, select one supported representative for that canvas instead of
  // disabling both active measurements.
  const selectedDualOutput = selectAutoConfigDualOutputProbePair(streamSetup, supportedKinds);
  const unsafeDualOutput = filtered.type === 'dual-output' && !selectedDualOutput;
  const eligibleEnhancedBroadcastingDualOutput =
    supportedKinds.has('twitch-enhanced-broadcasting') &&
    isEligibleAutoConfigEnhancedBroadcastingDualOutputStreamSetup(streamSetup);
  const unsafeEnhancedBroadcastingDualOutput =
    filtered.type === 'enhanced-broadcasting-dual-output' &&
    !eligibleEnhancedBroadcastingDualOutput;
  filtered.outputs.forEach(output => {
    const originalCandidates = output.probeCandidates;
    if (unsafeDualOutput || unsafeEnhancedBroadcastingDualOutput) {
      output.probeCandidates = [];
      output.measurement = 'estimated';
      output.estimateReason = unsafeDualOutput ? 'dual_output' : 'enhanced_broadcasting';
      return;
    }
    const selectedOutput = selectedDualOutput?.outputs.find(
      selected => selected.outputId === output.outputId,
    );
    const supportedCandidates = selectedDualOutput
      ? selectedOutput!.probeCandidates
      : originalCandidates.filter(candidate => supportedKinds.has(candidate.kind));
    output.probeCandidates = supportedCandidates;
    if (selectedDualOutput) {
      output.measurement = 'active';
      output.estimateReason = undefined;
    } else if (eligibleEnhancedBroadcastingDualOutput) {
      output.measurement = supportedCandidates.length ? 'active' : 'estimated';
      output.estimateReason = supportedCandidates.length ? undefined : 'probe_disabled';
    } else if (originalCandidates.length) {
      const coverage = autoConfigProbeCoverage(
        originalCandidates.length,
        supportedCandidates.length,
      );
      output.measurement = coverage.measurement;
      output.estimateReason = coverage.estimateReason;
    }
  });
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
    let kind = 'target-cadence-rejected';
    if (code === 'hardware_testing_encoder_surfaces') kind = 'surfaces';
    else if (code === 'hardware_validating_target_cadence') kind = 'target-cadence';
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
  const provider = phase === 'bandwidth' ? autoConfigProviderForProbeKind(event.probe?.kind) : null;
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
 * Keep only the public provider provenance needed by Desktop presentation and
 * attempt-relative validation.
 */
export function sanitizeAutoConfigProbeEvidence(value: unknown): IAutoOptimizerProbeEvidence[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const evidence = item as Record<string, unknown>;
    if (evidence.platform !== 'twitch' && evidence.platform !== 'youtube') return [];
    if (
      !isAutoOptimizerProbeMethod(evidence.platform, evidence.method) ||
      typeof evidence.success !== 'boolean'
    ) {
      return [];
    }

    return [
      {
        platform: evidence.platform,
        method: evidence.method,
        success: evidence.success,
      },
    ];
  });
}
