import cloneDeep from 'lodash/cloneDeep';
import isEqual from 'lodash/isEqual';
import Vue from 'vue';
import * as obs from '../../../obs-api';
import { Inject, mutation, PersistentStatefulService, ViewHandler } from 'services/core';
import { IGoLiveSettings } from 'services/streaming';
import { ISettingsSubCategory, SettingsService } from 'services/settings';
import { EEncoderFamily, IOutputSettings, OutputSettingsService } from 'services/settings/output';
import { EncoderQueryService } from 'services/settings/output/encoder-query';
import { encoderPresetFromSettingsValue } from 'services/settings/output/encoder-settings-policy';
import { VideoSettingsService, TDisplayType } from 'services/settings-v2/video';
import { UserService } from 'services/user';
import { TwitchService } from 'services/platforms/twitch';
import { IYoutubeAutoOptimizerProbeLease, YoutubeService } from 'services/platforms/youtube';
import { DualOutputService } from 'services/dual-output';
import { WindowsService } from 'services/windows';
import { SourcesService } from 'services/sources';
import { ScenesService } from 'services/scenes';
import { NavigationService } from 'services/navigation';
import { byOS, OS } from 'util/operating-systems';
import { $t } from 'services/i18n';
import { classifyAutoOptimizerTopology, isAutoOptimizerProfileCompatible } from './topology';
import { autoOptimizerRecommendationBitrateCap } from './bitrate-policy';
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
  supportedAutoConfigProbeKinds,
} from './probe-policy';
import {
  isValidAutoConfigDualOutputResultEnvelope,
  isValidAutoConfigEnhancedBroadcastingDualOutputResultEnvelope,
  validateAutoConfigRecommendation,
} from './result-policy';
import {
  autoOptimizerCanvasAllowsQualityPromotion,
  autoOptimizerDisplayFrameRate,
  autoOptimizerPromotesResolution,
  buildAutoOptimizerRequestLimits,
} from './resolution-policy';
import {
  captureRawOutputValues,
  buildAutoOptimizerVideoSettingsPatches,
  outputTransactionValuesMatch,
  shouldApplyAutoOptimizerVideoSettings,
  shouldCaptureTargetPresetForRollback,
  selectAutoOptimizerStandardOutputRecommendation,
  TRawOutputValues,
} from './output-transaction-policy';
import {
  IAutoConfigCapabilities,
  IAutoConfigActiveProbe,
  IAutoConfigEvent,
  IAutoConfigNativeResult,
  IAutoConfigRequest,
  IAutoConfigRequestLeg,
  IAutoOptimizerAdvice,
  IAutoOptimizerDestination,
  IAutoOptimizerError,
  IAutoOptimizerLegResult,
  IAutoOptimizerProfile,
  IAutoOptimizerProgressDetail,
  IAutoOptimizerResult,
  IAutoOptimizerState,
  IAutoOptimizerTopology,
  TAutoOptimizerPhase,
  TAutoOptimizerPlatform,
  TAutoOptimizerProbeProvider,
  TAutoOptimizerPromptState,
} from './types';

export * from './types';
export { classifyAutoOptimizerTopology } from './topology';

// Native may spend up to four minutes exhausting bounded encoder/quality
// candidates, followed by sequential Twitch and YouTube probes. This is only
// a final dead-session guard; each real substep continues to update the UI.
const NATIVE_RUN_TIMEOUT_MS = 420000;
const MIN_PHASE_VISIBLE_MS = 1000;
const YOUTUBE_INGEST_CONFIRMATION_TIMEOUT_MS = 12000;
const CLEANUP_PROGRESS_START = 95;
const CLEANUP_PROGRESS_MAX = 99;
const CLEANUP_PROGRESS_STEP = 0.2;
const CLEANUP_PROGRESS_INTERVAL_MS = 1000;

class AutoOptimizerProbeSetupError extends Error {
  readonly code = 'active_probe_setup_failed';
  readonly retryable = true;

  constructor() {
    super("We couldn't prepare the bandwidth test. Try again, or continue without optimization.");
    this.name = 'AutoOptimizerProbeSetupError';
  }
}

interface INodeObsAutoConfig {
  GetAutoConfigCapabilities?: () => string;
  CreateAutoConfigSession?: (requestJson: string, callback: (event: unknown) => void) => string;
  StartAutoConfigSession?: (sessionId: string) => void;
  ConfirmAutoConfigProbeIngest?: (sessionId: string, probeId: string, received: boolean) => void;
  GetAutoConfigResult?: (sessionId: string) => string;
  CancelAutoConfigSession?: (sessionId: string) => void;
  CloseAutoConfigSession?: (sessionId: string) => void;
}

interface ISettingsSnapshot {
  output: IOutputSettings;
  rawOutputFormData: ISettingsSubCategory[];
  rawOutputValues: TRawOutputValues;
  targetPreset?: ITargetEncoderPresetSnapshot;
  horizontalVideo: typeof VideoSettingsService.prototype.state.horizontal;
  verticalVideo: typeof VideoSettingsService.prototype.state.vertical;
  liveVideoDisplays: TDisplayType[];
}

interface ITargetEncoderPresetSnapshot {
  mode: IOutputSettings['mode'];
  encoderId: string;
  encoderFamily: EEncoderFamily;
  field: string;
  value: string;
}

interface IPreparedAutoConfigRequest {
  request: IAutoConfigRequest;
  topology: IAutoOptimizerTopology;
}

type TConcreteAutoOptimizerPhase = Exclude<TAutoOptimizerPhase, null>;

interface IPhaseStep {
  phase: TConcreteAutoOptimizerPhase;
  detail: IAutoOptimizerProgressDetail;
  key: string;
  progress: number;
}

function initialFlowState(): Omit<IAutoOptimizerState, 'promptStates'> {
  return {
    stage: 'idle',
    phase: null,
    progress: 0,
    progressDetail: null,
    topology: null,
    result: null,
    error: null,
  };
}

function clampProgress(progress: unknown): number {
  const value = Number(progress);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function emptyProgressDetail(): IAutoOptimizerProgressDetail {
  return {
    code: null,
    provider: null,
    targetBitrateKbps: null,
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
  };
}

function parseJson<T>(value: unknown): T | null {
  try {
    if (typeof value === 'string') return JSON.parse(value) as T;
    if (value && typeof value === 'object') return value as T;
  } catch (e: unknown) {}
  return null;
}

function normalizePlatform(platform: string): TAutoOptimizerPlatform {
  const known: TAutoOptimizerPlatform[] = [
    'twitch',
    'youtube',
    'facebook',
    'kick',
    'tiktok',
    'custom',
    'other',
  ];
  return known.includes(platform as TAutoOptimizerPlatform)
    ? (platform as TAutoOptimizerPlatform)
    : 'other';
}

class AutoConfigViews extends ViewHandler<IAutoOptimizerState> {
  get isOpen() {
    return this.state.stage !== 'idle';
  }

  get canCancel() {
    return this.state.stage === 'running';
  }
}

/**
 * Worker-owned Auto Optimizer coordinator. Only serializable, credential-free
 * progress and results are mirrored to visible renderer processes. The Go Live
 * draft, stream key, native session and rollback snapshot remain in the worker.
 */
export class AutoConfigService extends PersistentStatefulService<IAutoOptimizerState> {
  @Inject() private outputSettingsService: OutputSettingsService;
  @Inject() private encoderQueryService: EncoderQueryService;
  @Inject() private settingsService: SettingsService;
  @Inject() private videoSettingsService: VideoSettingsService;
  @Inject() private userService: UserService;
  @Inject() private twitchService: TwitchService;
  @Inject() private youtubeService: YoutubeService;
  @Inject() private dualOutputService: DualOutputService;
  @Inject() private windowsService: WindowsService;
  @Inject() private sourcesService: SourcesService;
  @Inject() private scenesService: ScenesService;
  @Inject() private navigationService: NavigationService;

  static defaultState: IAutoOptimizerState = {
    ...initialFlowState(),
    promptStates: {},
  };

  static filter(state: IAutoOptimizerState) {
    return {
      ...initialFlowState(),
      promptStates: state.promptStates || {},
    };
  }

  private frozenGoLiveSettings: IGoLiveSettings | null = null;
  private pendingGoLiveProfile: IAutoOptimizerProfile | null = null;
  private nativeSessionId: string | null = null;
  private lastEventSequence = -1;
  private runToken = 0;
  private terminalResolver: (() => void) | null = null;
  private displayedPhaseStep: IPhaseStep | null = null;
  private displayedPhaseSince = 0;
  private pendingPhaseSteps: IPhaseStep[] = [];
  private phaseDrainPromise: Promise<void> | null = null;
  private youtubeProbeLeases = new Map<string, IYoutubeAutoOptimizerProbeLease>();
  private youtubeConfirmationPromises = new Map<string, Promise<void>>();
  private probeAbortController: AbortController | null = null;
  /** Exact credential-free native inputs retained only for the active attempt. */
  private attemptRequestLegs = new Map<string, IAutoConfigRequestLeg>();

  init() {
    super.init();
    this.RESET_FLOW();
  }

  get views() {
    return new AutoConfigViews(this.state);
  }

  /**
   * Called after the final Go Live settings have been validated. Returns true
   * only when the confirmed attempt should pause for Auto Optimizer.
   */
  async interceptGoLive(settings: IGoLiveSettings): Promise<boolean> {
    const frozen = this.cloneGoLiveSettings(settings);
    if (this.state.stage !== 'idle') {
      // Repeated confirmation for the same draft resumes its current flow. A
      // genuinely new draft must never receive a stale recommendation.
      if (this.frozenGoLiveSettings && isEqual(frozen, this.frozenGoLiveSettings)) return true;
      ++this.runToken;
      try {
        await this.cleanupOptimizerRun(true);
      } catch (e: unknown) {
        // Keep the newly validated draft even when the old probe could not be
        // cleaned up. Continuing later must never stream stale selections.
        this.frozenGoLiveSettings = this.deepFreeze(frozen);
        this.SET_ERROR(this.toError(e, 'cleanup_failed', false));
        return true;
      }
      this.frozenGoLiveSettings = null;
      this.RESET_FLOW();
    }
    this.pendingGoLiveProfile = null;
    if (!this.userService.isLoggedIn) return false;
    if (this.settingsService.views.hasHDRSettings) return false;
    if (this.getPromptState() !== 'unseen') return false;
    const capabilities = this.getNativeCapabilities();
    if (!hasRequiredAutoConfigCapabilities(capabilities)) return false;

    this.frozenGoLiveSettings = this.deepFreeze(frozen);
    const topology = filterAutoConfigTopologyProbes(
      classifyAutoOptimizerTopology(
        frozen,
        this.dualOutputService.state.dualOutputMode && this.userService.isLoggedIn,
        this.twitchService.views.hasTwitchDualStreamAccess,
      ),
      supportedAutoConfigProbeKinds(capabilities!, {
        canConfirmYoutubeIngest:
          typeof this.nativeApi().ConfirmAutoConfigProbeIngest === 'function',
      }),
      {
        dualOutputActiveProbes: capabilities!.dualOutputActiveProbes === true,
        enhancedBroadcastingDualOutputWorkload:
          capabilities!.enhancedBroadcastingDualOutputWorkload === true,
      },
    );
    if (!topology.legs.some(leg => leg.destinations.length > 0)) {
      this.frozenGoLiveSettings = null;
      return false;
    }

    this.SET_INTRO(topology);
    return true;
  }

  async startOptimization(): Promise<void> {
    if (!this.frozenGoLiveSettings || !this.state.topology) {
      this.SET_ERROR({
        code: 'missing_go_live_settings',
        message: 'Go Live settings are no longer available. Please reopen Go Live.',
        retryable: false,
      });
      return;
    }
    if (this.state.stage !== 'intro') return;

    // Move away from the clickable intro before the first await. Besides
    // giving the UI immediate feedback, this makes duplicate clicks idempotent
    // while the worker starts or cleans up a native session.
    const token = ++this.runToken;
    let topology = cloneDeep(this.state.topology);
    this.SET_RUNNING(topology);
    this.beginPhasePacing();

    try {
      await this.cleanupOptimizerRun();
    } catch (e: unknown) {
      if (token !== this.runToken) return;
      await this.waitForPhasePacing(token);
      if (token !== this.runToken) return;
      this.SET_ERROR(this.toError(e, 'cleanup_failed', false));
      return;
    }
    if (token !== this.runToken) return;

    try {
      const prepared = await this.createNativeRequest(topology);
      if (token !== this.runToken) {
        this.clearProbeCredentials(prepared.request);
        return;
      }
      topology = prepared.topology;
      const request = prepared.request;
      this.attemptRequestLegs = new Map(request.legs.map(leg => [leg.legId, cloneDeep(leg)]));
      this.SET_TOPOLOGY(topology);

      const native = this.nativeApi();
      this.lastEventSequence = -1;
      let sessionId = '';
      try {
        sessionId = native.CreateAutoConfigSession!(JSON.stringify(request), event => {
          this.handleNativeEvent(event, token);
        });
      } finally {
        this.clearProbeCredentials(request);
      }
      if (!sessionId) throw new Error('Native optimizer did not create a session');

      this.nativeSessionId = sessionId;
      const terminal = this.createTerminalWaiter();
      native.StartAutoConfigSession!(sessionId);
      await terminal;

      if (token !== this.runToken || this.nativeSessionId !== sessionId) return;
      const nativeResult = parseJson<IAutoConfigNativeResult>(
        native.GetAutoConfigResult!(sessionId),
      );
      if (!this.isValidNativeResult(nativeResult, sessionId)) {
        throw new Error('Native optimizer returned an invalid result');
      }

      const result = this.toPublicResult(nativeResult);
      if (!this.isCompleteResultForTopology(result)) {
        throw new Error(nativeResult.error?.code || 'Optimization failed');
      }
      const stopCleanupProgress = this.startCleanupProgress(token);
      try {
        await this.cleanupOptimizerRun();
      } finally {
        stopCleanupProgress();
      }
      await this.waitForPhasePacing(token);
      if (token !== this.runToken) return;
      this.SET_RESULT(result);
    } catch (e: unknown) {
      if (token !== this.runToken) return;
      let terminalError = this.toError(e, 'optimization_failed', true);
      try {
        await this.cleanupOptimizerRun(true);
      } catch (cleanupError: unknown) {
        terminalError = this.toError(cleanupError, 'cleanup_failed', false);
      }
      await this.waitForPhasePacing(token);
      if (token !== this.runToken) return;
      this.SET_ERROR(terminalError);
    }
  }

  async retry(): Promise<void> {
    if (!this.frozenGoLiveSettings) return;
    const capabilities = this.getNativeCapabilities();
    if (!hasRequiredAutoConfigCapabilities(capabilities)) {
      this.SET_ERROR({
        code: 'native_optimizer_unavailable',
        message: 'Auto Optimizer is unavailable. Please continue with your current settings.',
        retryable: false,
      });
      return;
    }
    this.SET_INTRO(
      filterAutoConfigTopologyProbes(
        classifyAutoOptimizerTopology(
          this.frozenGoLiveSettings,
          this.dualOutputService.state.dualOutputMode && this.userService.isLoggedIn,
          this.twitchService.views.hasTwitchDualStreamAccess,
        ),
        supportedAutoConfigProbeKinds(capabilities!, {
          canConfirmYoutubeIngest:
            typeof this.nativeApi().ConfirmAutoConfigProbeIngest === 'function',
        }),
        {
          dualOutputActiveProbes: capabilities!.dualOutputActiveProbes === true,
          enhancedBroadcastingDualOutputWorkload:
            capabilities!.enhancedBroadcastingDualOutputWorkload === true,
        },
      ),
    );
    await this.startOptimization();
  }

  async cancelOptimization(): Promise<void> {
    const topology = this.state.topology;
    ++this.runToken;
    this.SET_CANCELLING();
    try {
      await this.cleanupOptimizerRun(true);
      if (topology) this.SET_INTRO(topology);
      else this.RESET_FLOW();
    } catch (e: unknown) {
      this.SET_ERROR(this.toError(e, 'cleanup_failed', false));
    }
  }

  async skipAndContinue(): Promise<boolean> {
    if (!this.frozenGoLiveSettings || this.state.stage === 'cancelling') return false;
    ++this.runToken;
    this.SET_CANCELLING();
    try {
      await this.cleanupOptimizerRun(true);
    } catch (e: unknown) {
      this.SET_ERROR(this.toError(e, 'cleanup_failed', false));
      return false;
    }
    this.setPromptState('declined');
    this.frozenGoLiveSettings = null;
    this.pendingGoLiveProfile = null;
    this.RESET_FLOW();
    return true;
  }

  async continueWithoutOptimization(): Promise<boolean> {
    if (!this.frozenGoLiveSettings || this.state.stage === 'cancelling') return false;
    ++this.runToken;
    this.SET_CANCELLING();
    try {
      await this.cleanupOptimizerRun(true);
    } catch (e: unknown) {
      this.SET_ERROR(this.toError(e, 'cleanup_failed', false));
      return false;
    }
    this.frozenGoLiveSettings = null;
    this.pendingGoLiveProfile = null;
    this.RESET_FLOW();
    return true;
  }

  async applyAndContinue(): Promise<boolean> {
    if (!this.frozenGoLiveSettings || !this.state.result || this.state.stage !== 'review') {
      return false;
    }

    this.SET_APPLYING();
    let profile: IAutoOptimizerProfile;
    try {
      profile = await this.applyResultTransactionally(this.state.result);
    } catch (e: unknown) {
      this.SET_ERROR(this.toError(e, 'apply_failed', true));
      return false;
    }

    this.pendingGoLiveProfile = profile;
    this.setPromptState('completed');
    this.frozenGoLiveSettings = null;
    this.RESET_FLOW();
    return true;
  }

  /**
   * Consume the profile saved for this confirmed attempt. The compatibility
   * check prevents a stale profile from crossing an unexpected topology change.
   */
  consumePendingGoLiveProfile(settings: IGoLiveSettings): IAutoOptimizerProfile | null {
    const profile = this.pendingGoLiveProfile;
    this.pendingGoLiveProfile = null;
    if (!profile) return null;

    return isAutoOptimizerProfileCompatible(
      profile,
      settings,
      this.dualOutputService.state.dualOutputMode && this.userService.isLoggedIn,
      this.twitchService.views.hasTwitchDualStreamAccess,
    )
      ? cloneDeep(profile)
      : null;
  }

  async close(): Promise<void> {
    ++this.runToken;
    try {
      await this.cleanupOptimizerRun(true);
    } catch (e: unknown) {
      this.SET_ERROR(this.toError(e, 'cleanup_failed', false));
      return;
    }
    this.frozenGoLiveSettings = null;
    this.pendingGoLiveProfile = null;
    this.RESET_FLOW();
    await this.windowsService.closeChildWindow();
  }

  /** Called when Electron closes the Go Live host without using the in-flow X. */
  async closeFromHost(): Promise<void> {
    this.pendingGoLiveProfile = null;
    if (this.state.stage === 'idle') return;

    ++this.runToken;
    try {
      await this.cleanupOptimizerRun(true);
    } catch (e: unknown) {
      this.SET_ERROR(this.toError(e, 'cleanup_failed', false));
      return;
    }
    this.frozenGoLiveSettings = null;
    this.RESET_FLOW();
  }

  openAdvice() {
    if (this.state.stage !== 'review') return;
    const advice = this.state.result?.advice;
    if (!advice) return;

    if (advice.type === 'webcam') {
      const sourceType = byOS({
        [OS.Windows]: 'dshow_input' as const,
        [OS.Mac]: 'macos_avcapture' as const,
      });
      this.windowsService.showWindow({
        componentName: 'AddSource',
        title: $t('Add Source'),
        queryParams: { sourceType },
        size: { width: 600, height: 320 },
        preservePrevWindow: true,
      });
    } else {
      // Browsing overlays leaves the confirmed Go Live attempt. Clear the
      // review synchronously so the next Go Live entry starts with settings.
      // Keep the prompt unseen because no recommendation was applied or skipped.
      ++this.runToken;
      this.frozenGoLiveSettings = null;
      this.pendingGoLiveProfile = null;
      this.RESET_FLOW();
      this.navigationService.navigate('BrowseOverlays');
      this.windowsService.closeChildWindow();
    }
  }

  private nativeApi(): INodeObsAutoConfig {
    return obs.NodeObs as INodeObsAutoConfig;
  }

  private getNativeCapabilities(): IAutoConfigCapabilities | null {
    try {
      const native = this.nativeApi();
      const methods: Array<keyof INodeObsAutoConfig> = [
        'GetAutoConfigCapabilities',
        'CreateAutoConfigSession',
        'StartAutoConfigSession',
        'GetAutoConfigResult',
        'CancelAutoConfigSession',
        'CloseAutoConfigSession',
      ];
      if (!methods.every(method => typeof native[method] === 'function')) return null;
      return parseJson<IAutoConfigCapabilities>(native.GetAutoConfigCapabilities!());
    } catch (e: unknown) {
      console.warn('[Auto Optimizer] Native capability check failed; continuing normal Go Live');
      return null;
    }
  }

  private async createNativeRequest(
    sourceTopology: IAutoOptimizerTopology,
  ): Promise<IPreparedAutoConfigRequest> {
    const credentialProbes: IAutoConfigActiveProbe[] = [];
    try {
      return await this.createNativeRequestWithCredentials(sourceTopology, credentialProbes);
    } catch (error: unknown) {
      this.clearActiveProbeCredentials(credentialProbes);
      await this.releaseYoutubeProbeLeases();
      throw error;
    }
  }

  private async createNativeRequestWithCredentials(
    sourceTopology: IAutoOptimizerTopology,
    credentialProbes: IAutoConfigActiveProbe[],
  ): Promise<IPreparedAutoConfigRequest> {
    const topology = cloneDeep(sourceTopology);
    const activeDualOutput = isEligibleAutoConfigDualOutputActiveTopology(topology);
    const activeEnhancedBroadcastingDualOutput = isEligibleAutoConfigEnhancedBroadcastingDualOutputTopology(
      topology,
    );
    const requestedActiveProbeCount = topology.probeCandidates.length;
    const activeProbes: IAutoConfigActiveProbe[] = [];
    if (activeDualOutput || activeEnhancedBroadcastingDualOutput) {
      const horizontalCanvasId = this.videoSettingsService.contexts.horizontal?.canvasId;
      const verticalCanvasId = this.videoSettingsService.contexts.vertical?.canvasId;
      if (!areAutoConfigActiveCanvasIdentitiesValid(horizontalCanvasId, verticalCanvasId, true)) {
        throw new AutoOptimizerProbeSetupError();
      }
    }
    this.probeAbortController?.abort();
    const controller = new AbortController();
    this.probeAbortController = controller;

    for (const leg of topology.legs) {
      const expectedProbeCount = leg.probeCandidates.length;
      const alreadyPartial = leg.estimateReason === 'partial_provider_probes';
      const acquired: Array<{
        candidate: typeof leg.probeCandidates[number];
        probe: IAutoConfigActiveProbe;
      }> = [];

      for (const candidate of leg.probeCandidates) {
        try {
          if (
            candidate.kind === 'twitch-standard' ||
            candidate.kind === 'twitch-enhanced-broadcasting'
          ) {
            const streamKey = await this.twitchService.fetchStreamKey();
            if (!streamKey) throw new Error('Twitch did not return a stream key');
            const probe: IAutoConfigActiveProbe = {
              probeId: candidate.probeId,
              kind: candidate.kind,
              legId: candidate.legId,
              serviceName: 'Twitch',
              server: 'auto',
              streamKey,
            };
            credentialProbes.push(probe);
            acquired.push({
              candidate,
              probe,
            });
          } else {
            const lease = await this.youtubeService.acquireAutoOptimizerProbe({
              signal: controller.signal,
            });
            const probe: IAutoConfigActiveProbe = {
              probeId: lease.probeId,
              kind: candidate.kind,
              legId: candidate.legId,
              serviceName: 'YouTube - RTMPS',
              server: lease.server,
              streamKey: lease.streamKey,
            };
            // The native request now owns the only in-memory credential copy.
            // A deferred API cleanup retains identifiers only.
            lease.server = '';
            lease.streamKey = '';
            this.youtubeProbeLeases.set(lease.probeId, lease);
            credentialProbes.push(probe);
            acquired.push({
              candidate: { ...candidate, probeId: lease.probeId },
              probe,
            });
          }
        } catch (error: unknown) {
          if ((error as { name?: string } | null)?.name === 'AbortError') throw error;
          console.warn(
            `[Auto Optimizer] ${candidate.provider} bandwidth probe unavailable; using estimate`,
          );
        }
      }

      leg.probeCandidates = acquired.map(({ candidate }) => candidate);
      if (expectedProbeCount > 0) {
        const coverage = autoConfigProbeCoverage(expectedProbeCount, acquired.length);
        leg.measurement = coverage.measurement;
        leg.estimateReason =
          coverage.measurement === 'active' && alreadyPartial
            ? 'partial_provider_probes'
            : coverage.estimateReason;
      }
      if (acquired.length) {
        // A provider that was prepared successfully still supplies useful path
        // evidence when another provider is unavailable. OSN lowers confidence
        // for that partial provider set; Desktop keeps the missing route marked
        // as estimated and prevents quality promotion below.
        activeProbes.push(...acquired.map(({ probe }) => probe));
      }
    }
    topology.probeCandidates = topology.legs.flatMap(leg => leg.probeCandidates);
    if (activeDualOutput && activeProbes.length !== requestedActiveProbeCount) {
      // This topology is one aggregate experiment, not two independently
      // promotable provider probes. Never pass a partially credentialed pair
      // to native, and delete any temporary YouTube resource before surfacing
      // the retryable setup failure.
      this.clearActiveProbeCredentials(credentialProbes);
      throw new AutoOptimizerProbeSetupError();
    }
    if (
      activeEnhancedBroadcastingDualOutput &&
      !activeProbes.some(probe => probe.kind === 'twitch-enhanced-broadcasting')
    ) {
      // The paired Twitch ladder owns the canvas recommendation and is the
      // anchor for the concurrent companion workload. A missing optional
      // YouTube probe may lower bandwidth confidence; a missing Twitch probe
      // makes the combined experiment impossible.
      this.clearActiveProbeCredentials(credentialProbes);
      throw new AutoOptimizerProbeSetupError();
    }
    if (requestedActiveProbeCount > 0 && activeProbes.length === 0) {
      // Runtime setup failures are actionable and retryable. Falling through to
      // an estimate would hide the provider/API problem and leave the user with
      // no explanation for why a requested measurement never ran.
      throw new AutoOptimizerProbeSetupError();
    }

    const output = this.outputSettingsService.getSettings();
    const legs: IAutoConfigRequestLeg[] = topology.legs.map(leg => {
      const display: TDisplayType = leg.display === 'vertical' ? 'vertical' : 'horizontal';
      const video = this.videoSettingsService.state[display];
      const canvasId = this.videoSettingsService.contexts[display]?.canvasId;
      const additionalCanvasId = this.videoSettingsService.contexts.vertical?.canvasId;
      if (
        (topology.type === 'enhanced-broadcasting' ||
          topology.type === 'enhanced-broadcasting-dual-output') &&
        leg.measurement === 'active' &&
        !areAutoConfigActiveCanvasIdentitiesValid(
          canvasId,
          additionalCanvasId,
          leg.display === 'both',
        )
      ) {
        throw new AutoOptimizerProbeSetupError();
      }
      const maxBitrateKbps = autoOptimizerRecommendationBitrateCap(
        leg.outputKind,
        leg.destinations.map(item => item.platform),
      );
      return {
        legId: leg.legId,
        display: leg.display,
        outputKind: leg.outputKind,
        destinations: leg.destinations,
        current: {
          canvasId,
          width: video.outputWidth,
          height: video.outputHeight,
          fpsNum: video.fpsNum,
          fpsDen: video.fpsDen,
          bitrateKbps: output.streaming.bitrate,
          encoderId: output.streaming.encoderId,
          // V1 deliberately benchmarks and recommends H.264 only. This is a
          // requested codec, not an inference from an encoder identifier.
          codec: 'h264',
          preset: output.streaming.preset || undefined,
        },
        // Resolution and frame-rate promotion are permitted only with complete
        // provider coverage. Partial and estimate-only paths may lower a tested
        // tuple, but their request ceiling cannot rise above the current output.
        limits: buildAutoOptimizerRequestLimits({
          allowPromotion:
            ((leg.measurement === 'active' && leg.estimateReason !== 'partial_provider_probes') ||
              activeEnhancedBroadcastingDualOutput) &&
            autoOptimizerCanvasAllowsQualityPromotion(
              video.baseWidth,
              video.baseHeight,
              video.outputWidth,
              video.outputHeight,
            ),
          currentWidth: video.outputWidth,
          currentHeight: video.outputHeight,
          currentFpsNum: video.fpsNum,
          currentFpsDen: video.fpsDen,
          maxBitrateKbps,
        }),
        ...(leg.display === 'both'
          ? {
              additionalVideo: {
                display: 'vertical' as const,
                current: {
                  canvasId: additionalCanvasId,
                  width: this.videoSettingsService.state.vertical.outputWidth,
                  height: this.videoSettingsService.state.vertical.outputHeight,
                  fpsNum: this.videoSettingsService.state.vertical.fpsNum,
                  fpsDen: this.videoSettingsService.state.vertical.fpsDen,
                  bitrateKbps: output.streaming.bitrate,
                  encoderId: output.streaming.encoderId,
                  codec: 'h264',
                  preset: output.streaming.preset || undefined,
                },
                limits: buildAutoOptimizerRequestLimits({
                  allowPromotion:
                    ((leg.measurement === 'active' &&
                      leg.estimateReason !== 'partial_provider_probes') ||
                      activeEnhancedBroadcastingDualOutput) &&
                    autoOptimizerCanvasAllowsQualityPromotion(
                      this.videoSettingsService.state.vertical.baseWidth,
                      this.videoSettingsService.state.vertical.baseHeight,
                      this.videoSettingsService.state.vertical.outputWidth,
                      this.videoSettingsService.state.vertical.outputHeight,
                    ),
                  currentWidth: this.videoSettingsService.state.vertical.outputWidth,
                  currentHeight: this.videoSettingsService.state.vertical.outputHeight,
                  currentFpsNum: this.videoSettingsService.state.vertical.fpsNum,
                  currentFpsDen: this.videoSettingsService.state.vertical.fpsDen,
                  maxBitrateKbps,
                }),
              },
            }
          : {}),
        estimateReason: leg.estimateReason as IAutoConfigRequestLeg['estimateReason'],
      };
    });

    return {
      topology,
      request: {
        schemaVersion: 1,
        topology: topology.type,
        legs,
        activeProbes: activeProbes.length ? activeProbes : undefined,
      },
    };
  }

  private createTerminalWaiter(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.terminalResolver = null;
        reject(new Error('Auto Optimizer timed out'));
      }, NATIVE_RUN_TIMEOUT_MS);
      this.terminalResolver = () => {
        clearTimeout(timeout);
        this.terminalResolver = null;
        resolve();
      };
    });
  }

  private handleNativeEvent(value: unknown, token: number) {
    if (token !== this.runToken) return;
    const event = parseJson<IAutoConfigEvent>(value);
    if (!event || event.schemaVersion !== 1 || event.sessionId !== this.nativeSessionId) return;
    if (!Number.isInteger(event.sequence) || event.sequence <= this.lastEventSequence) return;
    this.lastEventSequence = event.sequence;

    const provider: TAutoOptimizerProbeProvider | null =
      event.provider === 'twitch' || event.provider === 'youtube' ? event.provider : null;
    if (
      event.code === 'youtube_probe_waiting_for_ingest' &&
      provider === 'youtube' &&
      typeof event.probeId === 'string' &&
      event.probeId
    ) {
      this.startYoutubeIngestConfirmation(event.probeId, event.sessionId, token);
    }

    const phase: TConcreteAutoOptimizerPhase | null =
      event.phase === 'preflight' ||
      event.phase === 'hardware' ||
      event.phase === 'bandwidth' ||
      event.phase === 'recommendation'
        ? event.phase
        : null;
    if (phase) {
      const detail = sanitizeAutoConfigProgressDetail(event, phase);
      this.queuePhaseProgress(phase, clampProgress(event.progress), token, detail);
    }

    if (event.type === 'complete' || event.type === 'cancelled') {
      this.terminalResolver?.();
    }
  }

  private startYoutubeIngestConfirmation(probeId: string, sessionId: string, token: number) {
    if (this.youtubeConfirmationPromises.has(probeId)) return;

    const lease = this.youtubeProbeLeases.get(probeId);
    const controller = this.probeAbortController;
    const confirmation = (async () => {
      let received = false;
      if (lease && controller && !controller.signal.aborted) {
        try {
          received = await this.youtubeService.waitForAutoOptimizerProbeActive(lease, {
            signal: controller.signal,
            timeoutMs: YOUTUBE_INGEST_CONFIRMATION_TIMEOUT_MS,
          });
        } catch (error: unknown) {
          if ((error as { name?: string } | null)?.name === 'AbortError') return;
          console.warn('[Auto Optimizer] YouTube ingest confirmation failed', error);
        }
      }

      if (
        token !== this.runToken ||
        controller?.signal.aborted ||
        this.nativeSessionId !== sessionId
      ) {
        return;
      }
      try {
        this.nativeApi().ConfirmAutoConfigProbeIngest?.(sessionId, probeId, received);
      } catch (error: unknown) {
        console.warn('[Auto Optimizer] Could not confirm YouTube probe ingest', error);
      }
    })();
    this.youtubeConfirmationPromises.set(probeId, confirmation);
  }

  private beginPhasePacing() {
    this.displayedPhaseStep = {
      phase: 'preflight',
      detail: emptyProgressDetail(),
      key: autoConfigPhaseStepKey('preflight'),
      progress: 0,
    };
    this.displayedPhaseSince = Date.now();
    this.pendingPhaseSteps = [];
    this.phaseDrainPromise = null;
  }

  private queuePhaseProgress(
    phase: TConcreteAutoOptimizerPhase,
    progress: number,
    token: number,
    detail: IAutoOptimizerProgressDetail,
  ) {
    if (token !== this.runToken || this.state.stage !== 'running') return;
    const key = autoConfigPhaseStepKey(phase, detail.provider, detail.code, detail);
    const step: IPhaseStep = {
      phase,
      detail,
      key,
      progress,
    };

    // Exact repeats may update the progress bar while preserving the original
    // one-second copy window. Once another status is queued, A -> B -> A is
    // three real transitions and must remain three queue entries.
    const disposition = autoConfigPhaseStepDisposition(
      this.displayedPhaseStep?.key || null,
      this.pendingPhaseSteps.map(pending => pending.key),
      step.key,
    );
    if (disposition === 'update-displayed') {
      this.displayedPhaseStep = step;
      this.SET_PROGRESS(step.phase, progress, step.detail);
      return;
    }

    if (disposition === 'update-pending-tail') {
      const pendingTail = this.pendingPhaseSteps[this.pendingPhaseSteps.length - 1]!;
      Object.assign(pendingTail, step);
      return;
    }

    this.pendingPhaseSteps.push(step);
    this.startPhaseDrain(token);
  }

  private startPhaseDrain(token: number) {
    if (this.phaseDrainPromise) return;

    const drain = this.drainPhaseQueue(token);
    this.phaseDrainPromise = drain;
    const onSettled = () => {
      if (this.phaseDrainPromise !== drain) return;
      this.phaseDrainPromise = null;
      if (this.isPhasePacingActive(token) && this.pendingPhaseSteps.length) {
        this.startPhaseDrain(token);
      }
    };
    void drain.then(onSettled, onSettled);
  }

  private async drainPhaseQueue(token: number): Promise<void> {
    while (this.isPhasePacingActive(token) && this.pendingPhaseSteps.length) {
      await this.waitForDisplayedPhaseMinimum(token);
      if (!this.isPhasePacingActive(token)) return;

      const step = this.pendingPhaseSteps.shift()!;
      this.displayedPhaseStep = step;
      this.displayedPhaseSince = Date.now();
      this.SET_PROGRESS(step.phase, step.progress, step.detail);
    }
  }

  private async waitForPhasePacing(token: number): Promise<void> {
    while (this.isPhasePacingActive(token) && this.phaseDrainPromise) {
      const drain = this.phaseDrainPromise;
      await drain;
      if (this.phaseDrainPromise === drain) this.phaseDrainPromise = null;
    }
    await this.waitForDisplayedPhaseMinimum(token);
  }

  private async waitForDisplayedPhaseMinimum(token: number): Promise<void> {
    while (this.isPhasePacingActive(token)) {
      const remaining = MIN_PHASE_VISIBLE_MS - Math.max(0, Date.now() - this.displayedPhaseSince);
      if (remaining <= 0) return;
      await new Promise(resolve => setTimeout(resolve, remaining));
    }
  }

  /**
   * Keep the blocking provider cleanup legible without implying completion.
   * Native progress deliberately stops at 95%; Desktop owns the remaining
   * cleanup band and leaves 100% for the transition to the result screen.
   */
  private startCleanupProgress(token: number): () => void {
    const detail: IAutoOptimizerProgressDetail = {
      ...emptyProgressDetail(),
      code: 'cleanup_resources',
    };
    let progress = Math.min(
      CLEANUP_PROGRESS_MAX,
      Math.max(CLEANUP_PROGRESS_START, this.state.progress),
    );
    this.queuePhaseProgress('cleanup', progress, token, detail);

    const timer = setInterval(() => {
      if (!this.isPhasePacingActive(token)) {
        clearInterval(timer);
        return;
      }
      progress = Math.min(CLEANUP_PROGRESS_MAX, progress + CLEANUP_PROGRESS_STEP);
      this.queuePhaseProgress('cleanup', progress, token, detail);
    }, CLEANUP_PROGRESS_INTERVAL_MS);

    return () => clearInterval(timer);
  }

  private isPhasePacingActive(token: number): boolean {
    return token === this.runToken && this.state.stage === 'running';
  }

  private isValidNativeResult(
    result: IAutoConfigNativeResult | null,
    sessionId: string,
  ): result is IAutoConfigNativeResult {
    return Boolean(
      result &&
        result.schemaVersion === 1 &&
        result.sessionId === sessionId &&
        Array.isArray(result.legs) &&
        ['complete', 'partial', 'cancelled', 'failed'].includes(result.status),
    );
  }

  private toPublicResult(nativeResult: IAutoConfigNativeResult): IAutoOptimizerResult {
    const expectedLegs = this.state.topology?.legs || [];
    const activeDualOutput = Boolean(
      this.state.topology && isEligibleAutoConfigDualOutputActiveTopology(this.state.topology),
    );
    const activeEnhancedBroadcastingDualOutput = Boolean(
      this.state.topology &&
        isEligibleAutoConfigEnhancedBroadcastingDualOutputTopology(this.state.topology),
    );
    if (
      activeDualOutput &&
      !isValidAutoConfigDualOutputResultEnvelope(
        nativeResult,
        expectedLegs.map(leg => leg.legId),
      )
    ) {
      return {
        schemaVersion: 1,
        topology: this.state.topology?.type || 'direct-single',
        status: nativeResult.status,
        legs: [],
        advice: this.getAdvice(),
      };
    }
    const combinedWorkloadValidated = Boolean(
      activeEnhancedBroadcastingDualOutput &&
        isValidAutoConfigEnhancedBroadcastingDualOutputResultEnvelope(nativeResult, expectedLegs),
    );
    if (activeEnhancedBroadcastingDualOutput && !combinedWorkloadValidated) {
      return {
        schemaVersion: 1,
        topology: this.state.topology?.type || 'direct-single',
        status: nativeResult.status,
        legs: [],
        advice: this.getAdvice(),
      };
    }
    const jointDualOutputActive =
      activeDualOutput && nativeResult.legs.every(leg => leg.measurement?.mode === 'active');
    const legs: IAutoOptimizerLegResult[] = nativeResult.legs.flatMap(leg => {
      const expected = expectedLegs.find(item => item.legId === leg.legId);
      const requested = this.attemptRequestLegs.get(leg.legId);
      const evidence = sanitizeAutoConfigProbeEvidence(leg.measurement?.probes);
      // state.topology is replaced with the prepared attempt topology before
      // native execution. At least one attempted candidate must succeed;
      // failed or missing selected providers are accepted only at low confidence.
      const activeEvidenceValid =
        leg.measurement?.mode !== 'active' ||
        Boolean(
          expected &&
            isValidAutoConfigActiveProbeCoverage({
              destinations: expected.destinations,
              attemptedCandidates: expected.probeCandidates,
              evidence,
              confidence: leg.measurement?.confidence,
              requireAllProbeCapableDestinations:
                !activeDualOutput && !activeEnhancedBroadcastingDualOutput,
            }),
        );
      const providerOwnsEncoding = expected?.outputKind === 'twitch-enhanced-broadcasting';
      const recommendation = requested
        ? validateAutoConfigRecommendation(leg.recommendation, {
            measurementMode: leg.measurement?.mode,
            currentBitrateKbps: requested.current.bitrateKbps,
            probeEvidence: evidence,
            providerOwnsEncoding,
            enhancedBroadcasting: providerOwnsEncoding,
            combinedWorkloadValidated:
              combinedWorkloadValidated && expected?.outputKind === 'standard',
            qualityProfile:
              jointDualOutputActive ||
              expected?.destinations.some(destination => destination.platform === 'twitch')
                ? 'twitch'
                : 'generic',
            maxBitrateKbps: requested.limits?.maxBitrateKbps,
            maxWidth: requested.limits?.maxWidth,
            maxHeight: requested.limits?.maxHeight,
            maxFpsNum: requested.limits?.maxFpsNum,
            maxFpsDen: requested.limits?.maxFpsDen,
            currentWidth: requested.current.width,
            currentHeight: requested.current.height,
            currentFpsNum: requested.current.fpsNum,
            currentFpsDen: requested.current.fpsDen,
            additionalVideo: requested.additionalVideo,
          })
        : null;
      const valid =
        requested?.display === leg.display &&
        expected?.display === leg.display &&
        (expected?.measurement === 'active' || leg.measurement?.mode === 'estimated') &&
        activeEvidenceValid &&
        typeof leg.legId === 'string' &&
        Array.isArray(leg.destinations) &&
        leg.measurement &&
        ['active', 'estimated'].includes(leg.measurement.mode) &&
        ['high', 'medium', 'low'].includes(leg.measurement.confidence) &&
        recommendation !== null;
      if (!valid || !expected || !recommendation) return [];

      return [
        {
          legId: leg.legId,
          display: leg.display,
          outputKind: expected.outputKind,
          destinations: expected.destinations.map(
            item => ({ platform: normalizePlatform(item.platform) } as IAutoOptimizerDestination),
          ),
          measurement: leg.measurement.mode,
          confidence: leg.measurement.confidence,
          route: expected.route,
          probes: evidence,
          estimateReason: leg.measurement.reason,
          resolution: {
            width: recommendation.width,
            height: recommendation.height,
          },
          fpsNum: recommendation.fpsNum,
          fpsDen: recommendation.fpsDen,
          fps: autoOptimizerDisplayFrameRate(recommendation.fpsNum, recommendation.fpsDen),
          bitrate: recommendation.bitrateKbps,
          ...(recommendation.additionalVideo
            ? {
                additionalVideo: {
                  display: 'vertical' as const,
                  resolution: {
                    width: recommendation.additionalVideo.width,
                    height: recommendation.additionalVideo.height,
                  },
                  fpsNum: recommendation.additionalVideo.fpsNum,
                  fpsDen: recommendation.additionalVideo.fpsDen,
                  fps: autoOptimizerDisplayFrameRate(
                    recommendation.additionalVideo.fpsNum,
                    recommendation.additionalVideo.fpsDen,
                  ),
                },
              }
            : {}),
          ...(recommendation.encoder ? { encoder: recommendation.encoder } : {}),
        },
      ];
    });

    return {
      schemaVersion: 1,
      topology: this.state.topology?.type || 'direct-single',
      status: nativeResult.status,
      legs,
      advice: this.getAdvice(),
    };
  }

  private isCompleteResultForTopology(result: IAutoOptimizerResult): boolean {
    if (result.status !== 'complete' || !this.state.topology) return false;
    const expectedIds = this.state.topology.legs.map(leg => leg.legId);
    const returnedIds = result.legs.map(leg => leg.legId);
    return (
      returnedIds.length === expectedIds.length &&
      new Set(returnedIds).size === returnedIds.length &&
      expectedIds.every(legId => returnedIds.includes(legId))
    );
  }

  private getAdvice(): IAutoOptimizerAdvice | undefined {
    const hasVideoCapture = this.sourcesService.views.sources.some(source =>
      ['dshow_input', 'macos_avcapture', 'av_capture_input'].includes(source.type),
    );
    if (!hasVideoCapture) {
      return {
        type: 'webcam',
        title: 'Add a webcam',
        description: 'We recommend adding a webcam to increase viewer engagement.',
        actionLabel: 'Add a Webcam Source',
      };
    }

    if (this.scenesService.views.scenes.length < 3) {
      return {
        type: 'scenes',
        title: 'Add more scenes',
        description:
          'Looks like you only have a few scenes. Adding more can make your stream look more polished.',
        actionLabel: 'Browse Overlays',
      };
    }
    return undefined;
  }

  private async applyResultTransactionally(
    result: IAutoOptimizerResult,
  ): Promise<IAutoOptimizerProfile> {
    if (!result.legs.length || !this.state.topology) throw new Error('No recommendations to apply');
    // A Settings-window canvas edit may still be inside its 200 ms batching
    // window when the user accepts the result. Apply it before capturing the
    // rollback snapshot or computing the non-shrinking accepted Base Canvas.
    await this.videoSettingsService.flushPendingCanvasSettings();
    const snapshot = this.captureSettingsSnapshot();
    const primary = result.legs.find(leg => leg.display === 'horizontal') || result.legs[0];
    const outputRecommendation = selectAutoOptimizerStandardOutputRecommendation(result.legs);
    const frameRateSignatures = new Set(
      result.legs.flatMap(leg => [
        `${leg.fpsNum}/${leg.fpsDen}`,
        ...(leg.additionalVideo
          ? [`${leg.additionalVideo.fpsNum}/${leg.additionalVideo.fpsDen}`]
          : []),
      ]),
    );
    if (frameRateSignatures.size > 1) {
      throw new Error('This stream topology cannot apply different frame rates per upload leg');
    }
    const providerOwnsEncoding = outputRecommendation === null;
    const applyVideoSettings = shouldApplyAutoOptimizerVideoSettings(
      this.state.topology.type,
      providerOwnsEncoding,
      result.legs.map(leg => leg.measurement),
    );
    const expectedEncoder = providerOwnsEncoding
      ? null
      : (outputRecommendation!.encoder!.family as EEncoderFamily);
    const displaysToApply = Array.from(
      new Set(
        result.legs.flatMap(leg =>
          leg.display === 'both'
            ? (['horizontal', 'vertical'] as TDisplayType[])
            : [leg.display as TDisplayType],
        ),
      ),
    );

    try {
      if (
        applyVideoSettings &&
        displaysToApply.some(display => !this.videoSettingsService.contexts[display])
      ) {
        throw new Error('A required video context is unavailable');
      }
      if (!providerOwnsEncoding) {
        // Simple mode can hide the preset whenever UseAdvanced is disabled,
        // even when the recommended encoder is already selected. Always
        // preserve that target value before enabling/mutating its context.
        // Advanced mode has one shared encoder-settings document, so its
        // active raw form is the complete rollback source.
        if (shouldCaptureTargetPresetForRollback(snapshot.output.mode)) {
          snapshot.targetPreset = this.captureTargetEncoderPresetSnapshot(
            snapshot.output.mode,
            outputRecommendation!.encoder!.id,
            outputRecommendation!.encoder!.family as EEncoderFamily,
          );
        } else {
          this.activateEncoderPresetContext(
            snapshot.output.mode,
            outputRecommendation!.encoder!.id,
            outputRecommendation!.encoder!.family as EEncoderFamily,
          );
        }
        this.outputSettingsService.setSettings({
          streaming: {
            bitrate: outputRecommendation!.bitrate,
            encoder: expectedEncoder!,
            encoderId: outputRecommendation!.encoder!.id,
            preset: outputRecommendation!.encoder!.preset,
          },
        });
      }

      if (applyVideoSettings) {
        // Testing used disposable native mixes and did not mutate these values.
        // Only this user-approved path may grow Base Canvas. Output resolution
        // may differ per display, while OBS cadence is a shared video setting.
        const patches = buildAutoOptimizerVideoSettingsPatches(
          result.legs,
          {
            horizontal: this.videoSettingsService.state.horizontal,
            vertical: this.videoSettingsService.state.vertical,
          },
          primary.fpsNum,
          primary.fpsDen,
        );
        await this.videoSettingsService.applyAutoOptimizerSettings(patches);
      }

      this.verifyAppliedSettings(
        result,
        primary,
        outputRecommendation,
        applyVideoSettings,
        expectedEncoder,
        snapshot,
      );
      return {
        schemaVersion: 1,
        topology: this.state.topology.type,
        legs: cloneDeep(result.legs),
      };
    } catch (e: unknown) {
      let fullyRestored = false;
      try {
        await this.restoreSettingsSnapshot(snapshot);
        fullyRestored = this.matchesSettingsSnapshot(snapshot);
      } catch (restoreError: unknown) {
        console.error('[Auto Optimizer] Failed to restore Output settings', restoreError);
      }
      if (!fullyRestored) {
        throw new Error('Auto Optimizer failed and could not fully restore previous settings');
      }
      throw e;
    }
  }

  private captureSettingsSnapshot(): ISettingsSnapshot {
    const rawOutputFormData = cloneDeep(this.settingsService.state.Output.formData);
    return {
      output: cloneDeep(this.outputSettingsService.getSettings()),
      rawOutputFormData,
      rawOutputValues: captureRawOutputValues(rawOutputFormData),
      horizontalVideo: cloneDeep(this.videoSettingsService.state.horizontal),
      verticalVideo: cloneDeep(this.videoSettingsService.state.vertical),
      liveVideoDisplays: (['horizontal', 'vertical'] as TDisplayType[]).filter(
        display => !!this.videoSettingsService.contexts[display],
      ),
    };
  }

  private async restoreSettingsSnapshot(snapshot: ISettingsSnapshot): Promise<void> {
    if (snapshot.targetPreset) {
      this.activateTargetEncoderPreset(snapshot.targetPreset);
      this.setRawOutputField('Streaming', snapshot.targetPreset.field, snapshot.targetPreset.value);
    }
    this.restoreRawOutputForm(snapshot.rawOutputFormData);
    await this.videoSettingsService.applyAutoOptimizerSettings({
      horizontal: snapshot.horizontalVideo,
      vertical: snapshot.verticalVideo,
    });
  }

  private matchesSettingsSnapshot(snapshot: ISettingsSnapshot): boolean {
    const actualTargetPreset = snapshot.targetPreset
      ? this.readDormantTargetPreset(snapshot.targetPreset)
      : null;
    return (
      isEqual(this.outputSettingsService.getSettings(), snapshot.output) &&
      outputTransactionValuesMatch(
        snapshot.rawOutputValues,
        this.settingsService.state.Output.formData,
        snapshot.targetPreset ? snapshot.targetPreset.value : null,
        actualTargetPreset,
      ) &&
      isEqual(this.videoSettingsService.state.horizontal, snapshot.horizontalVideo) &&
      isEqual(this.videoSettingsService.state.vertical, snapshot.verticalVideo) &&
      snapshot.liveVideoDisplays.every(display =>
        this.obsVideoMatches(
          display === 'horizontal' ? snapshot.horizontalVideo : snapshot.verticalVideo,
          display,
        ),
      )
    );
  }

  private captureTargetEncoderPresetSnapshot(
    mode: IOutputSettings['mode'],
    encoderId: string,
    encoderFamily: EEncoderFamily,
  ): ITargetEncoderPresetSnapshot {
    const field = this.encoderQueryService.resolveStreamingEncoderPreset(mode, encoderId);
    if (!field) throw new Error(`No preset field is available for encoder ${encoderId}`);

    const target: ITargetEncoderPresetSnapshot = {
      mode,
      encoderId,
      encoderFamily,
      field,
      value: '',
    };
    this.activateEncoderPresetContext(mode, encoderId, encoderFamily);
    const value = this.readRawOutputField('Streaming', field);
    if (typeof value !== 'string') {
      throw new Error(`Could not read the current preset for encoder ${encoderId}`);
    }
    target.value = value;
    return target;
  }

  private activateTargetEncoderPreset(target: ITargetEncoderPresetSnapshot) {
    this.activateEncoderPresetContext(target.mode, target.encoderId, target.encoderFamily);
  }

  private activateEncoderPresetContext(
    mode: IOutputSettings['mode'],
    encoderId: string,
    encoderFamily: EEncoderFamily,
  ) {
    if (this.outputSettingsService.getSettings().mode !== mode) {
      throw new Error('Output mode changed during Auto Optimizer apply');
    }
    this.outputSettingsService.setSettings({
      streaming: {
        encoder: encoderFamily,
        encoderId,
      },
    });
    if (mode === 'Simple') {
      const useAdvanced = this.readRawOutputField('Streaming', 'UseAdvanced');
      if (useAdvanced !== true) this.setRawOutputField('Streaming', 'UseAdvanced', true);
    }
    if (this.outputSettingsService.getSettings().streaming.encoderId !== encoderId) {
      throw new Error(`Could not activate encoder ${encoderId}`);
    }
  }

  private readDormantTargetPreset(target: ITargetEncoderPresetSnapshot): string | null {
    // Target snapshots are intentionally Simple-only: these are distinct
    // config keys and remain meaningful after the original encoder is restored.
    const activeFormData = cloneDeep(this.settingsService.state.Output.formData);
    try {
      this.activateTargetEncoderPreset(target);
      const value = this.readRawOutputField('Streaming', target.field);
      return typeof value === 'string' ? value : null;
    } finally {
      // Dormant verification must not leave the target encoder selected.
      this.restoreRawOutputForm(activeFormData);
    }
  }

  private restoreRawOutputForm(formData: ISettingsSubCategory[]) {
    // The first Advanced-mode save switches the encoder. OBS intentionally
    // discards encoder-property values from that same save and creates the
    // selected encoder with defaults. The second save restores those values
    // now that the original encoder is active. This is harmless in Simple mode.
    this.settingsService.setSettings('Output', cloneDeep(formData));
    this.settingsService.setSettings('Output', cloneDeep(formData));
  }

  private readRawOutputField(subCategory: string, field: string): unknown {
    return this.settingsService.findSettingValue(
      this.settingsService.state.Output.formData,
      subCategory,
      field,
    );
  }

  private setRawOutputField(subCategory: string, field: string, value: string | boolean) {
    const formData = cloneDeep(this.settingsService.state.Output.formData);
    const setting = this.settingsService.findSetting(formData, subCategory, field);
    if (!setting) throw new Error(`Output setting ${subCategory}.${field} is unavailable`);
    setting.value = value;
    this.settingsService.setSettings('Output', formData);
  }

  private obsVideoMatches(expected: ISettingsSnapshot['horizontalVideo'], display: TDisplayType) {
    const actual = this.videoSettingsService.contexts[display]?.video;
    if (!actual) return false;
    return (
      actual.baseWidth === expected.baseWidth &&
      actual.baseHeight === expected.baseHeight &&
      actual.outputWidth === expected.outputWidth &&
      actual.outputHeight === expected.outputHeight &&
      actual.fpsNum === expected.fpsNum &&
      actual.fpsDen === expected.fpsDen
    );
  }

  private verifyAppliedSettings(
    result: IAutoOptimizerResult,
    primary: IAutoOptimizerLegResult,
    outputRecommendation: IAutoOptimizerLegResult | null,
    applyVideoSettings: boolean,
    expectedEncoder: EEncoderFamily | null,
    snapshot: ISettingsSnapshot,
  ) {
    const output = this.outputSettingsService.getSettings();
    if (outputRecommendation && output.streaming.bitrate !== outputRecommendation.bitrate) {
      throw new Error('Failed to apply the recommended bitrate');
    }
    if (outputRecommendation && output.streaming.encoder !== expectedEncoder) {
      throw new Error('Failed to apply the recommended encoder');
    }
    if (outputRecommendation && output.streaming.encoderId !== outputRecommendation.encoder!.id) {
      throw new Error('Failed to apply the tested encoder implementation');
    }
    if (outputRecommendation) {
      const presetField = this.encoderQueryService.resolveStreamingEncoderPreset(
        output.mode,
        outputRecommendation.encoder!.id,
      );
      const rawPreset = presetField ? this.readRawOutputField('Streaming', presetField) : null;
      let appliedPreset: string;
      try {
        if (typeof rawPreset !== 'string' || !rawPreset) throw new Error('Missing preset');
        appliedPreset = encoderPresetFromSettingsValue(
          outputRecommendation.encoder!.id,
          output.mode,
          rawPreset,
        );
      } catch (error: unknown) {
        throw new Error('Failed to read the recommended encoder preset');
      }
      if (appliedPreset !== outputRecommendation.encoder!.preset) {
        throw new Error('Failed to apply the recommended encoder preset');
      }
      if (
        output.mode === 'Simple' &&
        this.readRawOutputField('Streaming', 'UseAdvanced') !== true
      ) {
        throw new Error('Failed to enable the recommended encoder preset');
      }
    }
    if (applyVideoSettings) {
      (['horizontal', 'vertical'] as TDisplayType[]).forEach(display => {
        const state = this.videoSettingsService.state[display];
        if (state && (state.fpsNum !== primary.fpsNum || state.fpsDen !== primary.fpsDen)) {
          throw new Error(`Failed to persist the recommended ${display} frame rate`);
        }
        const live = this.videoSettingsService.contexts[display]?.video;
        if (live && (live.fpsNum !== primary.fpsNum || live.fpsDen !== primary.fpsDen)) {
          throw new Error(`Failed to apply the recommended ${display} frame rate`);
        }
      });
      result.legs
        .flatMap(leg => [
          {
            display: (leg.display === 'vertical' ? 'vertical' : 'horizontal') as TDisplayType,
            resolution: leg.resolution,
          },
          ...(leg.additionalVideo
            ? [{ display: leg.additionalVideo.display, resolution: leg.additionalVideo.resolution }]
            : []),
        ])
        .forEach(({ display, resolution }) => {
          const state = this.videoSettingsService.state[display];
          const video = this.videoSettingsService.contexts[display]?.video;
          const previous =
            display === 'vertical' ? snapshot.verticalVideo : snapshot.horizontalVideo;
          const promotedResolution = autoOptimizerPromotesResolution(
            previous.outputWidth,
            previous.outputHeight,
            resolution.width,
            resolution.height,
          );
          if (!state || !video) throw new Error(`The ${display} video context is unavailable`);
          if (
            state.outputWidth !== resolution.width ||
            state.outputHeight !== resolution.height ||
            (promotedResolution && state.baseWidth < resolution.width) ||
            (promotedResolution && state.baseHeight < resolution.height) ||
            video.baseWidth !== state.baseWidth ||
            video.baseHeight !== state.baseHeight ||
            video.outputWidth !== resolution.width ||
            video.outputHeight !== resolution.height
          ) {
            throw new Error(`Failed to apply the recommended ${display} video settings`);
          }
        });
    }
  }

  private clearProbeCredentials(request: IAutoConfigRequest) {
    this.clearActiveProbeCredentials(request.activeProbes || []);
    this.youtubeProbeLeases.forEach(lease => {
      lease.streamKey = '';
      lease.server = '';
    });
  }

  private clearActiveProbeCredentials(probes: IAutoConfigActiveProbe[]) {
    probes.forEach(probe => {
      probe.streamKey = '';
      probe.server = '';
    });
  }

  private async cleanupOptimizerRun(cancel = false): Promise<void> {
    this.attemptRequestLegs.clear();
    this.probeAbortController?.abort();
    this.probeAbortController = null;
    // Redact credentials even when setup failed or was cancelled before native
    // session creation. Release only needs the exact journaled identifiers.
    this.youtubeProbeLeases.forEach(lease => {
      lease.streamKey = '';
      lease.server = '';
    });

    const sessionId = this.nativeSessionId;
    if (sessionId) {
      const native = this.nativeApi();
      // Native cancellation is awaitable at the IPC boundary. Never delete a
      // YouTube resource until this call has stopped and released its output.
      if (cancel) native.CancelAutoConfigSession?.(sessionId);
      native.CloseAutoConfigSession?.(sessionId);
      if (this.nativeSessionId === sessionId) this.nativeSessionId = null;
      this.terminalResolver?.();
    }

    const confirmations = [...this.youtubeConfirmationPromises.values()];
    if (confirmations.length) await Promise.allSettled(confirmations);
    this.youtubeConfirmationPromises.clear();

    await this.releaseYoutubeProbeLeases();
  }

  private async releaseYoutubeProbeLeases(): Promise<void> {
    for (const [probeId, lease] of [...this.youtubeProbeLeases]) {
      try {
        await this.youtubeService.releaseAutoOptimizerProbe(lease);
        this.youtubeProbeLeases.delete(probeId);
      } catch (error: unknown) {
        // Native output is already stopped. Keep the non-secret lease and its
        // recovery journal so a later attempt can retry without blocking the
        // user from reviewing or applying an otherwise valid recommendation.
        console.warn('[Auto Optimizer] Deferred YouTube probe cleanup', error);
      }
    }
  }

  private getIdentityKey(): string {
    return this.userService.isLoggedIn && this.userService.state.userId != null
      ? `account:${this.userService.state.userId}`
      : `install:${this.userService.getLocalUserId()}`;
  }

  private getPromptState(): TAutoOptimizerPromptState {
    return this.state.promptStates[this.getIdentityKey()] || 'unseen';
  }

  private setPromptState(promptState: TAutoOptimizerPromptState) {
    this.SET_PROMPT_STATE(this.getIdentityKey(), promptState);
  }

  private cloneGoLiveSettings(settings: IGoLiveSettings): IGoLiveSettings {
    const copy = cloneDeep(settings);
    Object.values(copy.platforms).forEach(platform => {
      if (platform) delete platform.video;
    });
    copy.customDestinations.forEach(destination => {
      delete destination.video;
    });
    delete copy.autoOptimizerProfile;
    return copy;
  }

  private deepFreeze<T>(value: T): T {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value as any).forEach(item => this.deepFreeze(item));
    return value;
  }

  private toError(error: unknown, fallbackCode: string, retryable: boolean): IAutoOptimizerError {
    const message = error instanceof Error ? error.message : String(error || 'Unknown error');
    if (error instanceof AutoOptimizerProbeSetupError) {
      return { code: error.code, message, retryable: error.retryable };
    }
    return { code: fallbackCode, message, retryable };
  }

  @mutation()
  private SET_INTRO(topology: IAutoOptimizerTopology) {
    Object.assign(this.state, {
      stage: 'intro',
      phase: null,
      progress: 0,
      progressDetail: null,
      topology,
      result: null,
      error: null,
    });
  }

  @mutation()
  private SET_RUNNING(topology: IAutoOptimizerTopology) {
    Object.assign(this.state, {
      stage: 'running',
      phase: 'preflight',
      progress: 0,
      progressDetail: emptyProgressDetail(),
      topology,
      result: null,
      error: null,
    });
  }

  @mutation()
  private SET_TOPOLOGY(topology: IAutoOptimizerTopology) {
    this.state.topology = topology;
  }

  @mutation()
  private SET_PROGRESS(
    phase: TAutoOptimizerPhase,
    progress: number,
    detail: IAutoOptimizerProgressDetail,
  ) {
    this.state.phase = phase;
    // Native progress is global to one session. Keep the mirrored bar
    // monotonic even if a delayed event reports an older percentage.
    this.state.progress = Math.max(this.state.progress, progress);
    this.state.progressDetail = detail;
  }

  @mutation()
  private SET_RESULT(result: IAutoOptimizerResult) {
    Object.assign(this.state, {
      stage: 'review',
      phase: null,
      progress: 100,
      progressDetail: null,
      result,
      error: null,
    });
  }

  @mutation()
  private SET_CANCELLING() {
    this.state.stage = 'cancelling';
    this.state.phase = null;
    this.state.progressDetail = null;
  }

  @mutation()
  private SET_APPLYING() {
    this.state.stage = 'applying';
    this.state.error = null;
  }

  @mutation()
  private SET_ERROR(error: IAutoOptimizerError) {
    this.state.stage = 'error';
    this.state.phase = null;
    this.state.progressDetail = null;
    this.state.error = error;
  }

  @mutation()
  private SET_PROMPT_STATE(identity: string, promptState: TAutoOptimizerPromptState) {
    Vue.set(this.state.promptStates, identity, promptState);
  }

  @mutation()
  private RESET_FLOW() {
    Object.assign(this.state, initialFlowState());
  }
}
