import {
  IAutoConfigAdditionalVideoTuple,
  IAutoConfigEvent,
  IAutoOptimizerProbeCandidate,
  IAutoOptimizerProgressDetail,
  IAutoOptimizerProbeEvidence,
  IAutoOptimizerStreamSetup,
  TAutoOptimizerEncoderFamily,
  TAutoOptimizerPhase,
  TAutoOptimizerProbeKind,
  TAutoOptimizerProbeMethod,
  TAutoOptimizerProbePlatform,
} from './types';

const AUTO_OPTIMIZER_ENCODER_FAMILIES = new Set([
  'obs_nvenc_h264_tex',
  'qsv',
  'amd',
  'apple',
  'x264',
]);

/**
 * Validate OSN's bandwidth-test evidence against the platforms selected for
 * this run. At least one selected platform must succeed. Missing evidence makes
 * the result partial and requires low confidence, except Dual Output may
 * deliberately select one Twitch or YouTube representative per canvas.
 */
export function isValidAutoConfigActiveProbeCoverage(p: {
  destinations: Array<{ platform: string }>;
  attemptedCandidates: Array<{
    platform: TAutoOptimizerProbePlatform;
    kind: TAutoOptimizerProbeKind;
  }>;
  evidence: IAutoOptimizerProbeEvidence[];
  confidence: string | undefined;
  /**
   * For jointly tested Dual Output, one selected Twitch or YouTube test
   * represents each canvas. Other testable destinations sharing that canvas do
   * not require separate evidence.
   */
  requireAllProbeCapableDestinations?: boolean;
}): boolean {
  const selectedPlatforms = new Set<TAutoOptimizerProbePlatform>(
    p.destinations.flatMap(destination =>
      destination.platform === 'twitch' || destination.platform === 'youtube'
        ? [destination.platform]
        : [],
    ),
  );
  const attemptedPlatforms = new Set(p.attemptedCandidates.map(candidate => candidate.platform));
  const methodForKind: Record<TAutoOptimizerProbeKind, TAutoOptimizerProbeMethod> = {
    'twitch-standard': 'twitch-bandwidth-test',
    'twitch-enhanced-broadcasting': 'twitch-enhanced-broadcasting-test',
    'youtube-unbound': 'youtube-unbound-ramp',
  };
  const attemptedMethods = new Set(
    p.attemptedCandidates.map(
      candidate => `${candidate.platform}:${methodForKind[candidate.kind]}`,
    ),
  );
  const successfulPlatforms = new Set(
    p.evidence.filter(item => item.success).map(item => item.platform),
  );

  if (!attemptedPlatforms.size) return false;
  if ([...attemptedPlatforms].some(platform => !selectedPlatforms.has(platform))) return false;
  if (p.evidence.some(item => !attemptedMethods.has(`${item.platform}:${item.method}`))) {
    return false;
  }
  if (![...attemptedPlatforms].some(platform => successfulPlatforms.has(platform))) return false;

  const isPartial =
    [...attemptedPlatforms].some(platform => !successfulPlatforms.has(platform)) ||
    (p.requireAllProbeCapableDestinations !== false &&
      [...selectedPlatforms].some(platform => !successfulPlatforms.has(platform)));
  return !isPartial || p.confidence === 'low';
}

export function autoConfigPlatformForProbeKind(kind: unknown): TAutoOptimizerProbePlatform | null {
  if (kind === 'twitch-standard' || kind === 'twitch-enhanced-broadcasting') return 'twitch';
  return kind === 'youtube-unbound' ? 'youtube' : null;
}

/**
 * Recognize the supported two-canvas Dual Output setup: one Twitch test on one
 * canvas and one YouTube test on the other. OSN validates their combined upload
 * budget and concurrent encoder workload; other destinations may share either
 * canvas without being tested.
 */
export function isEligibleAutoConfigDualOutputActiveStreamSetup(
  streamSetup: IAutoOptimizerStreamSetup,
): boolean {
  if (streamSetup.type !== 'dual-output' || streamSetup.outputs.length !== 2) {
    return false;
  }

  const displays = new Set(streamSetup.outputs.map(output => output.display));
  const outputIds = new Set(streamSetup.outputs.map(output => output.outputId));
  const probePlatforms = new Set<TAutoOptimizerProbePlatform>();
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
    const carriesProbePlatform = output.destinations.some(
      destination => destination.platform === candidate.platform,
    );
    if (
      !carriesProbePlatform ||
      candidate.outputId !== output.outputId ||
      (candidate.platform === 'twitch' && candidate.kind !== 'twitch-standard') ||
      (candidate.platform === 'youtube' && candidate.kind !== 'youtube-unbound')
    ) {
      return false;
    }
    probePlatforms.add(candidate.platform);
  }

  const candidateKey = (candidate: IAutoOptimizerProbeCandidate) =>
    `${candidate.probeId}\u0000${candidate.outputId}\u0000${candidate.platform}\u0000${candidate.kind}`;
  const candidates = streamSetup.outputs.flatMap(output => output.probeCandidates);
  const candidateKeys = candidates.map(candidateKey);
  const probeIds = candidates.map(candidate => candidate.probeId);
  return (
    probePlatforms.size === 2 &&
    probePlatforms.has('twitch') &&
    probePlatforms.has('youtube') &&
    candidates.length === 2 &&
    new Set(candidateKeys).size === 2 &&
    new Set(probeIds).size === 2
  );
}

/**
 * Accept the supported Twitch Dual Stream Enhanced Broadcasting setup: one
 * paired Twitch output plus at most one standard output for each canvas used by
 * non-Twitch destinations. A standard companion may be workload-tested even
 * when it has no live bandwidth test.
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
    enhancedCandidates[0].platform !== 'twitch' ||
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
          candidate.platform !== 'youtube' ||
          candidate.kind !== 'youtube-unbound',
      ) ||
      output.probeCandidates.length > 1
    ) {
      return false;
    }
    companionDisplays.add(output.display);
  }

  const candidateKey = (candidate: IAutoOptimizerProbeCandidate) =>
    `${candidate.probeId}\u0000${candidate.outputId}\u0000${candidate.platform}\u0000${candidate.kind}`;
  const candidateKeys = streamSetup.outputs
    .flatMap(output => output.probeCandidates)
    .map(candidateKey);
  return (
    new Set(streamSetup.outputs.map(output => output.outputId)).size ===
      streamSetup.outputs.length && new Set(candidateKeys).size === candidateKeys.length
  );
}

/**
 * Select one testable platform per canvas for Dual Output. Preserve the
 * deterministic candidate order, require one Twitch and one YouTube selection,
 * and let OSN derive the shared upload budget from both measurements.
 */
function selectAutoConfigDualOutputProbePair(
  streamSetup: IAutoOptimizerStreamSetup,
): IAutoOptimizerStreamSetup | null {
  if (streamSetup.type !== 'dual-output' || streamSetup.outputs.length !== 2) return null;

  const candidatesByOutput = streamSetup.outputs.map(output => output.probeCandidates);
  for (const first of candidatesByOutput[0]) {
    for (const second of candidatesByOutput[1]) {
      if (first.platform === second.platform) continue;
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
 * Select only test combinations supported by the OSN request contract.
 * Platform credentials can still fail during preparation; partial platform
 * coverage must not promote video quality.
 */
export function prepareAutoConfigStreamSetup(
  streamSetup: IAutoOptimizerStreamSetup,
): IAutoOptimizerStreamSetup {
  const filtered: IAutoOptimizerStreamSetup = {
    ...streamSetup,
    outputs: streamSetup.outputs.map(output => ({
      ...output,
      destinations: output.destinations.map(destination => ({ ...destination })),
      probeCandidates: output.probeCandidates.map(candidate => ({ ...candidate })),
    })),
  };
  // OSN allocates bandwidth and validates both encoder workloads together for
  // Twitch and YouTube Dual Output. If a canvas also targets a destination
  // without a supported bandwidth test, use one supported platform on that
  // canvas as its representative instead of disabling both tests.
  const selectedDualOutput = selectAutoConfigDualOutputProbePair(streamSetup);
  const unsafeDualOutput = filtered.type === 'dual-output' && !selectedDualOutput;
  const eligibleEnhancedBroadcastingDualOutput = isEligibleAutoConfigEnhancedBroadcastingDualOutputStreamSetup(
    streamSetup,
  );
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
    const selectedCandidates = selectedDualOutput
      ? selectedOutput!.probeCandidates
      : originalCandidates;
    output.probeCandidates = selectedCandidates;
    if (selectedDualOutput) {
      output.measurement = 'active';
      output.estimateReason = undefined;
    } else if (eligibleEnhancedBroadcastingDualOutput) {
      output.measurement = selectedCandidates.length ? 'active' : 'estimated';
      output.estimateReason = selectedCandidates.length ? undefined : 'probe_disabled';
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
/** Build stable keys for sequential work and terminal progress states. */
export function autoConfigPhaseStepKey(
  phase: TAutoOptimizerPhase,
  platform?: TAutoOptimizerProbePlatform | null,
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
  if (phase === 'bandwidth' && platform === 'twitch') {
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
  if (phase === 'bandwidth' && platform) {
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
    return `${phase}:${platform}:${status}:${bitrate}`;
  }
  if (phase === 'hardware' && code === 'hardware_discovering_encoders') {
    return 'hardware:discovering';
  }
  if (phase === 'hardware' && code === 'hardware_provider_managed') {
    return 'twitch-managed';
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
    return 'twitch-managed';
  }
  return String(phase);
}

export type TAutoConfigPhaseStepDisposition =
  | 'update-displayed'
  | 'update-pending-tail'
  | 'enqueue';

/**
 * Merge only consecutive repeats of the same visible status. If another status
 * is queued, preserve A -> B -> A as three separate transitions.
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

/** Validate the optional video bitrate reported for the current bandwidth test. */
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
 * Before sending OSN progress details to visible renderers, keep only bounded,
 * serializable fields. Preserve unknown status codes for diagnostics, but never
 * display them as untranslated UI text.
 */
export function sanitizeAutoConfigProgressDetail(
  event: IAutoConfigEvent,
  phase: TAutoOptimizerPhase,
): IAutoOptimizerProgressDetail {
  const code =
    typeof event.code === 'string' && /^[a-z0-9_]+$/.test(event.code) && event.code.length <= 128
      ? event.code
      : null;
  const platform = phase === 'bandwidth' ? autoConfigPlatformForProbeKind(event.probe?.kind) : null;
  const encoderFamily = AUTO_OPTIMIZER_ENCODER_FAMILIES.has(String(event.encoderFamily))
    ? (event.encoderFamily as TAutoOptimizerEncoderFamily)
    : null;

  return {
    code,
    platform,
    targetBitrateKbps:
      platform !== null ? sanitizeAutoConfigProbeTargetBitrateKbps(event.targetBitrateKbps) : null,
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
  platform: TAutoOptimizerProbePlatform,
  method: unknown,
): method is TAutoOptimizerProbeMethod {
  return (
    (platform === 'twitch' &&
      (method === 'twitch-bandwidth-test' || method === 'twitch-enhanced-broadcasting-test')) ||
    (platform === 'youtube' && method === 'youtube-unbound-ramp')
  );
}

/** Keep only the platform evidence needed to display and validate this run's result. */
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
