import cloneDeep from 'lodash/cloneDeep';
import isEqual from 'lodash/isEqual';
import Vue from 'vue';
import * as obs from '../../../obs-api';
import { Inject, mutation, PersistentStatefulService, ViewHandler } from 'services/core';
import { IGoLiveSettings } from 'services/streaming';
import { SettingsService } from 'services/settings';
import { EEncoderFamily, IOutputSettings, OutputSettingsService } from 'services/settings/output';
import { VideoSettingsService, TDisplayType } from 'services/settings-v2/video';
import { UserService } from 'services/user';
import { TwitchService } from 'services/platforms/twitch';
import { DualOutputService } from 'services/dual-output';
import { WindowsService } from 'services/windows';
import { SourcesService } from 'services/sources';
import { ScenesService } from 'services/scenes';
import { NavigationService } from 'services/navigation';
import { byOS, OS } from 'util/operating-systems';
import { $t } from 'services/i18n';
import { EAvailableFeatures, IncrementalRolloutService } from 'services/incremental-rollout';
import { classifyAutoOptimizerTopology, isAutoOptimizerProfileCompatible } from './topology';
import {
  IAutoConfigCapabilities,
  IAutoConfigEvent,
  IAutoConfigNativeResult,
  IAutoConfigRequest,
  IAutoConfigRequestLeg,
  IAutoOptimizerAdvice,
  IAutoOptimizerDestination,
  IAutoOptimizerError,
  IAutoOptimizerLegResult,
  IAutoOptimizerProfile,
  IAutoOptimizerResult,
  IAutoOptimizerState,
  IAutoOptimizerTopology,
  TAutoOptimizerPhase,
  TAutoOptimizerPlatform,
  TAutoOptimizerPromptState,
} from './types';

export * from './types';
export { classifyAutoOptimizerTopology } from './topology';

const NATIVE_RUN_TIMEOUT_MS = 120000;
const FEATURE_READINESS_TIMEOUT_MS = 2000;
const MIN_PHASE_VISIBLE_MS = 1000;

// OBS service metadata supplies caps for Twitch, YouTube and Facebook in the
// native estimator. These two custom-RTMP integrations do not have rtmp_common
// metadata, so Desktop supplies their published V1 ceilings. Unknown/custom
// providers intentionally remain uncapped rather than guessing.
const PLATFORM_MAX_BITRATE_KBPS: Partial<Record<TAutoOptimizerPlatform, number>> = {
  kick: 8000,
  tiktok: 6000,
};

interface INodeObsAutoConfig {
  GetAutoConfigCapabilities?: () => string;
  CreateAutoConfigSession?: (requestJson: string, callback: (event: unknown) => void) => string;
  StartAutoConfigSession?: (sessionId: string) => void;
  GetAutoConfigResult?: (sessionId: string) => string;
  CancelAutoConfigSession?: (sessionId: string) => void;
  CloseAutoConfigSession?: (sessionId: string) => void;
}

interface ISettingsSnapshot {
  output: IOutputSettings;
  horizontalVideo: typeof VideoSettingsService.prototype.state.horizontal;
  verticalVideo: typeof VideoSettingsService.prototype.state.vertical;
  liveVideoDisplays: TDisplayType[];
}

function initialFlowState(): Omit<IAutoOptimizerState, 'promptStates'> {
  return {
    stage: 'idle',
    phase: null,
    progress: 0,
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

function parseJson<T>(value: unknown): T | null {
  try {
    if (typeof value === 'string') return JSON.parse(value) as T;
    if (value && typeof value === 'object') return value as T;
  } catch (e: unknown) {}
  return null;
}

function codecForEncoder(encoder: string): string {
  const id = encoder.toLowerCase();
  if (id.includes('av1') || id.includes('aom') || id.includes('svt')) return 'av1';
  if (id.includes('hevc') || id.includes('h265')) return 'hevc';
  return 'h264';
}

function encoderFamilyForSettings(encoderId: string, fallback: EEncoderFamily): EEncoderFamily {
  const id = encoderId.toLowerCase();
  if (id.includes('x264')) return EEncoderFamily.x264;
  if (id.includes('qsv')) return EEncoderFamily.qsv;
  if (id.includes('amf') || id.includes('amd')) return EEncoderFamily.amd;
  if (id.includes('aom')) return EEncoderFamily.ffmpeg_aom_av1;
  if (id.includes('svt')) return EEncoderFamily.ffmpeg_svt_av1;
  if (id.includes('nvenc') || id.includes('nvidia')) {
    if (id.includes('av1')) return EEncoderFamily.obs_nvenc_av1_tex;
    if (id.includes('hevc')) return EEncoderFamily.obs_nvenc_hevc_tex;
    return EEncoderFamily.nvenc;
  }
  return fallback;
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
  @Inject() private settingsService: SettingsService;
  @Inject() private videoSettingsService: VideoSettingsService;
  @Inject() private userService: UserService;
  @Inject() private twitchService: TwitchService;
  @Inject() private dualOutputService: DualOutputService;
  @Inject() private windowsService: WindowsService;
  @Inject() private sourcesService: SourcesService;
  @Inject() private scenesService: ScenesService;
  @Inject() private navigationService: NavigationService;
  @Inject() private incrementalRolloutService: IncrementalRolloutService;

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
  private displayedPhase: TAutoOptimizerPhase | null = null;
  private displayedPhaseSince = 0;
  private pendingPhases: TAutoOptimizerPhase[] = [];
  private pendingPhaseProgress = new Map<TAutoOptimizerPhase, number>();
  private seenPhases = new Set<TAutoOptimizerPhase>();
  private phaseDrainPromise: Promise<void> | null = null;

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
        await this.cleanupNativeSession(true);
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
    await this.waitForFeatureFlags();
    if (!this.featureEnabled(EAvailableFeatures.autoOptimizerV1)) return false;
    if (!this.featureEnabled(EAvailableFeatures.autoOptimizerV1Apply)) return false;
    if (this.getPromptState() !== 'unseen') return false;
    if (!this.hasRequiredNativeCapabilities()) return false;

    this.frozenGoLiveSettings = this.deepFreeze(frozen);
    const topology = classifyAutoOptimizerTopology(
      frozen,
      this.dualOutputService.state.dualOutputMode && this.userService.isLoggedIn,
      this.twitchService.views.hasTwitchDualStreamAccess,
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
      await this.cleanupNativeSession();
    } catch (e: unknown) {
      if (token !== this.runToken) return;
      this.SET_ERROR(this.toError(e, 'cleanup_failed', false));
      return;
    }
    if (token !== this.runToken) return;

    try {
      const request = await this.createNativeRequest(topology);
      if (token !== this.runToken) return;

      // A Twitch credential failure is intentionally non-fatal. The request is
      // converted to estimate-only and the disclosure follows that decision.
      if (!request.activeProbe && topology.activeBandwidthTest) {
        topology = this.convertTopologyToEstimate(topology, 'probe_disabled');
        request.legs.forEach(leg => (leg.estimateReason = 'probe_disabled'));
        this.SET_TOPOLOGY(topology);
      }

      const native = this.nativeApi();
      this.lastEventSequence = -1;
      const sessionId = native.CreateAutoConfigSession!(JSON.stringify(request), event => {
        this.handleNativeEvent(event, token);
      });
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

      native.CloseAutoConfigSession!(sessionId);
      this.nativeSessionId = null;
      const result = this.toPublicResult(nativeResult);
      if (!this.isCompleteResultForTopology(result)) {
        throw new Error(nativeResult.error?.code || 'Optimization failed');
      }
      await this.waitForPhasePacing(token);
      if (token !== this.runToken) return;
      this.SET_RESULT(result);
    } catch (e: unknown) {
      if (token !== this.runToken) return;
      try {
        await this.cleanupNativeSession(true);
        this.SET_ERROR(this.toError(e, 'optimization_failed', true));
      } catch (cleanupError: unknown) {
        this.SET_ERROR(this.toError(cleanupError, 'cleanup_failed', false));
      }
    }
  }

  async retry(): Promise<void> {
    if (!this.frozenGoLiveSettings) return;
    this.SET_INTRO(
      classifyAutoOptimizerTopology(
        this.frozenGoLiveSettings,
        this.dualOutputService.state.dualOutputMode && this.userService.isLoggedIn,
        this.twitchService.views.hasTwitchDualStreamAccess,
      ),
    );
    await this.startOptimization();
  }

  async cancelOptimization(): Promise<void> {
    const topology = this.state.topology;
    ++this.runToken;
    this.SET_CANCELLING();
    try {
      await this.cleanupNativeSession(true);
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
      await this.cleanupNativeSession(true);
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
      await this.cleanupNativeSession(true);
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
    if (!this.featureEnabled(EAvailableFeatures.autoOptimizerV1Apply)) {
      return this.continueWithoutOptimization();
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
      await this.cleanupNativeSession(true);
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
      await this.cleanupNativeSession(true);
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

  private hasRequiredNativeCapabilities(): boolean {
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
      if (!methods.every(method => typeof native[method] === 'function')) return false;

      const capabilities = parseJson<IAutoConfigCapabilities>(native.GetAutoConfigCapabilities!());
      return Boolean(
        capabilities &&
          capabilities.apiVersion === 2 &&
          capabilities.resultSchemaVersion === 1 &&
          capabilities.previewApplySplit === true &&
          capabilities.awaitableCancel === true &&
          capabilities.perUploadLegResults === true &&
          capabilities.desktopOwnedApply === true &&
          capabilities.bandwidthModes?.includes('twitch-standard-active') &&
          capabilities.bandwidthModes?.includes('estimate'),
      );
    } catch (e: unknown) {
      console.warn('[Auto Optimizer] Native capability check failed; continuing normal Go Live');
      return false;
    }
  }

  private async createNativeRequest(topology: IAutoOptimizerTopology): Promise<IAutoConfigRequest> {
    const output = this.outputSettingsService.getSettings();
    const legs: IAutoConfigRequestLeg[] = topology.legs.map(leg => {
      const display: TDisplayType = leg.display === 'vertical' ? 'vertical' : 'horizontal';
      const video = this.videoSettingsService.state[display];
      const knownCaps = leg.destinations
        .map(item => PLATFORM_MAX_BITRATE_KBPS[item.platform])
        .filter((value): value is number => typeof value === 'number' && value > 0);
      return {
        legId: leg.legId,
        display: leg.display,
        destinations: leg.destinations,
        current: {
          width: video.outputWidth,
          height: video.outputHeight,
          fpsNum: video.fpsNum,
          fpsDen: video.fpsDen,
          bitrateKbps: output.streaming.bitrate,
          encoderId: output.streaming.encoder,
          codec: codecForEncoder(output.streaming.encoder),
          preset: output.streaming.preset || undefined,
        },
        limits: knownCaps.length ? { maxBitrateKbps: Math.min(...knownCaps) } : undefined,
        estimateReason: leg.estimateReason as IAutoConfigRequestLeg['estimateReason'],
      };
    });

    const request: IAutoConfigRequest = {
      schemaVersion: 1,
      topology: topology.type,
      legs,
    };

    if (
      topology.activeBandwidthTest &&
      this.featureEnabled(EAvailableFeatures.autoOptimizerV1TwitchProbe)
    ) {
      try {
        const streamKey = await this.twitchService.fetchStreamKey();
        if (streamKey) {
          request.activeProbe = {
            kind: 'twitch-standard-v1',
            legId: topology.legs[0].legId,
            serviceName: 'Twitch',
            server: 'auto',
            streamKey,
          };
        }
      } catch (e: unknown) {
        console.warn('[Auto Optimizer] Twitch bandwidth probe unavailable; using estimate');
      }
    }

    return request;
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

    const phase: TAutoOptimizerPhase | null =
      event.phase === 'preflight' ||
      event.phase === 'hardware' ||
      event.phase === 'bandwidth' ||
      event.phase === 'recommendation'
        ? event.phase
        : null;
    if (phase) this.queuePhaseProgress(phase, clampProgress(event.progress), token);

    if (event.type === 'complete' || event.type === 'cancelled') {
      this.terminalResolver?.();
    }
  }

  private beginPhasePacing() {
    this.displayedPhase = 'preflight';
    this.displayedPhaseSince = Date.now();
    this.pendingPhases = [];
    this.pendingPhaseProgress.clear();
    this.seenPhases = new Set<TAutoOptimizerPhase>(['preflight']);
    this.phaseDrainPromise = null;
  }

  private queuePhaseProgress(phase: TAutoOptimizerPhase, progress: number, token: number) {
    if (token !== this.runToken || this.state.stage !== 'running') return;

    if (phase === this.displayedPhase) {
      this.SET_PROGRESS(phase, progress);
      return;
    }

    if (this.seenPhases.has(phase)) {
      if (this.pendingPhases.includes(phase)) {
        this.pendingPhaseProgress.set(phase, progress);
      }
      return;
    }

    this.seenPhases.add(phase);
    this.pendingPhases.push(phase);
    this.pendingPhaseProgress.set(phase, progress);
    this.startPhaseDrain(token);
  }

  private startPhaseDrain(token: number) {
    if (this.phaseDrainPromise) return;

    const drain = this.drainPhaseQueue(token);
    this.phaseDrainPromise = drain;
    const onSettled = () => {
      if (this.phaseDrainPromise !== drain) return;
      this.phaseDrainPromise = null;
      if (this.isPhasePacingActive(token) && this.pendingPhases.length) {
        this.startPhaseDrain(token);
      }
    };
    void drain.then(onSettled, onSettled);
  }

  private async drainPhaseQueue(token: number): Promise<void> {
    while (this.isPhasePacingActive(token) && this.pendingPhases.length) {
      await this.waitForDisplayedPhaseMinimum(token);
      if (!this.isPhasePacingActive(token)) return;

      const phase = this.pendingPhases.shift()!;
      const progress = this.pendingPhaseProgress.get(phase) || 0;
      this.pendingPhaseProgress.delete(phase);
      this.displayedPhase = phase;
      this.displayedPhaseSince = Date.now();
      this.SET_PROGRESS(phase, progress);
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
    const currentBitrate = this.outputSettingsService.getSettings().streaming.bitrate;
    const legs: IAutoOptimizerLegResult[] = nativeResult.legs
      .filter(leg => {
        const r = leg.recommendation;
        const expected = expectedLegs.find(item => item.legId === leg.legId);
        return (
          expected?.display === leg.display &&
          (expected?.measurement === 'active' || leg.measurement?.mode === 'estimated') &&
          typeof leg.legId === 'string' &&
          Array.isArray(leg.destinations) &&
          leg.measurement &&
          ['active', 'estimated'].includes(leg.measurement.mode) &&
          ['high', 'medium', 'low'].includes(leg.measurement.confidence) &&
          r &&
          Number.isFinite(r.width) &&
          r.width > 0 &&
          r.width <= 16384 &&
          Number.isFinite(r.height) &&
          r.height > 0 &&
          r.height <= 16384 &&
          Number.isFinite(r.fpsNum) &&
          r.fpsNum > 0 &&
          Number.isFinite(r.fpsDen) &&
          r.fpsDen > 0 &&
          r.fpsNum / r.fpsDen <= 240 &&
          Number.isFinite(r.bitrateKbps) &&
          r.bitrateKbps > 0 &&
          r.bitrateKbps <= 100000 &&
          typeof r.encoderId === 'string'
        );
      })
      .map(leg => ({
        legId: leg.legId,
        display: leg.display,
        destinations: leg.destinations.map(
          item => ({ platform: normalizePlatform(item.platform) } as IAutoOptimizerDestination),
        ),
        measurement: leg.measurement.mode,
        confidence: leg.measurement.confidence,
        estimateReason: leg.measurement.reason,
        resolution: {
          width: Math.round(leg.recommendation.width),
          height: Math.round(leg.recommendation.height),
        },
        fps: leg.recommendation.fpsNum / leg.recommendation.fpsDen,
        bitrate: Math.round(
          leg.measurement.mode === 'estimated' && currentBitrate > 0
            ? Math.min(leg.recommendation.bitrateKbps, currentBitrate)
            : leg.recommendation.bitrateKbps,
        ),
        encoder: {
          id: leg.recommendation.encoderId,
          codec: leg.recommendation.codec,
          preset: leg.recommendation.preset,
        },
      }));

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
    const snapshot = this.captureSettingsSnapshot();
    const primary = result.legs.find(leg => leg.display === 'horizontal') || result.legs[0];
    const providerOwnsEncoding =
      this.state.topology.type === 'enhanced-broadcasting' ||
      (primary.display === 'both' &&
        primary.destinations.some(destination => destination.platform === 'twitch'));
    const encoderSignatures = new Set(
      result.legs.map(leg => `${leg.encoder.id}:${leg.encoder.preset || ''}`),
    );
    if (!providerOwnsEncoding && encoderSignatures.size > 1) {
      throw new Error('This stream topology cannot apply different encoders per upload leg');
    }
    const expectedEncoder = providerOwnsEncoding
      ? null
      : encoderFamilyForSettings(primary.encoder.id, snapshot.output.streaming.encoder);
    const displaysToApply = Array.from(
      new Set(
        result.legs.map(
          leg => (leg.display === 'vertical' ? 'vertical' : 'horizontal') as TDisplayType,
        ),
      ),
    );

    try {
      if (
        !providerOwnsEncoding &&
        displaysToApply.some(display => !this.videoSettingsService.contexts[display])
      ) {
        throw new Error('A required video context is unavailable');
      }
      if (!providerOwnsEncoding) {
        this.outputSettingsService.setSettings({
          streaming: {
            bitrate: primary.bitrate,
            encoder: expectedEncoder!,
            // Never carry a preset across encoder families. If native omits a
            // preset, OutputSettingsService keeps the selected encoder's own
            // existing/default preset field.
            preset: primary.encoder.preset,
          },
        });
      }

      if (!providerOwnsEncoding) {
        result.legs.forEach(leg => {
          const display: TDisplayType = leg.display === 'vertical' ? 'vertical' : 'horizontal';
          this.videoSettingsService.setSettings(
            {
              outputWidth: leg.resolution.width,
              outputHeight: leg.resolution.height,
              fpsNum: Math.round(leg.fps * 1000),
              fpsDen: 1000,
            },
            display,
          );
        });
        this.videoSettingsService.flushObsSettings(displaysToApply);
      }

      this.verifyAppliedSettings(result, primary, providerOwnsEncoding, expectedEncoder);
      return {
        schemaVersion: 1,
        topology: this.state.topology.type,
        legs: cloneDeep(result.legs),
      };
    } catch (e: unknown) {
      this.restoreSettingsSnapshot(snapshot);
      if (!this.matchesSettingsSnapshot(snapshot)) {
        throw new Error('Auto Optimizer failed and could not fully restore previous settings');
      }
      throw e;
    }
  }

  private captureSettingsSnapshot(): ISettingsSnapshot {
    return {
      output: cloneDeep(this.outputSettingsService.getSettings()),
      horizontalVideo: cloneDeep(this.videoSettingsService.state.horizontal),
      verticalVideo: cloneDeep(this.videoSettingsService.state.vertical),
      liveVideoDisplays: (['horizontal', 'vertical'] as TDisplayType[]).filter(
        display => !!this.videoSettingsService.contexts[display],
      ),
    };
  }

  private restoreSettingsSnapshot(snapshot: ISettingsSnapshot) {
    this.outputSettingsService.setSettings(snapshot.output);
    this.videoSettingsService.setSettings(
      snapshot.horizontalVideo,
      'horizontal',
      snapshot.liveVideoDisplays.includes('horizontal'),
    );
    this.videoSettingsService.setSettings(
      snapshot.verticalVideo,
      'vertical',
      snapshot.liveVideoDisplays.includes('vertical'),
    );
    this.videoSettingsService.flushObsSettings(snapshot.liveVideoDisplays);
  }

  private matchesSettingsSnapshot(snapshot: ISettingsSnapshot): boolean {
    return (
      isEqual(this.outputSettingsService.getSettings(), snapshot.output) &&
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

  private obsVideoMatches(expected: ISettingsSnapshot['horizontalVideo'], display: TDisplayType) {
    const actual = this.videoSettingsService.contexts[display]?.video;
    if (!actual) return false;
    return (
      actual.outputWidth === expected.outputWidth &&
      actual.outputHeight === expected.outputHeight &&
      actual.fpsNum === expected.fpsNum &&
      actual.fpsDen === expected.fpsDen
    );
  }

  private verifyAppliedSettings(
    result: IAutoOptimizerResult,
    primary: IAutoOptimizerLegResult,
    providerOwnsEncoding: boolean,
    expectedEncoder: EEncoderFamily | null,
  ) {
    const output = this.outputSettingsService.getSettings();
    if (!providerOwnsEncoding && output.streaming.bitrate !== primary.bitrate) {
      throw new Error('Failed to apply the recommended bitrate');
    }
    if (!providerOwnsEncoding && output.streaming.encoder !== expectedEncoder) {
      throw new Error('Failed to apply the recommended encoder');
    }
    if (
      !providerOwnsEncoding &&
      primary.encoder.preset &&
      output.streaming.preset !== primary.encoder.preset
    ) {
      throw new Error('Failed to apply the recommended encoder preset');
    }
    if (!providerOwnsEncoding) {
      result.legs.forEach(leg => {
        const display: TDisplayType = leg.display === 'vertical' ? 'vertical' : 'horizontal';
        const video = this.videoSettingsService.contexts[display]?.video;
        if (!video) throw new Error(`The ${display} video context is unavailable`);
        const appliedFps = video.fpsDen ? video.fpsNum / video.fpsDen : 0;
        if (
          video.outputWidth !== leg.resolution.width ||
          video.outputHeight !== leg.resolution.height ||
          Math.abs(appliedFps - leg.fps) > 0.001
        ) {
          throw new Error(`Failed to apply the recommended ${display} video settings`);
        }
      });
    }
  }

  private async cleanupNativeSession(cancel = false): Promise<void> {
    const sessionId = this.nativeSessionId;
    if (!sessionId) return;
    const native = this.nativeApi();
    if (cancel) native.CancelAutoConfigSession?.(sessionId);
    native.CloseAutoConfigSession?.(sessionId);
    if (this.nativeSessionId === sessionId) this.nativeSessionId = null;
    this.terminalResolver?.();
  }

  private convertTopologyToEstimate(
    topology: IAutoOptimizerTopology,
    reason: string,
  ): IAutoOptimizerTopology {
    return {
      ...topology,
      activeBandwidthTest: false,
      legs: topology.legs.map(leg => ({
        ...leg,
        measurement: 'estimated',
        estimateReason: reason,
      })),
    };
  }

  private getIdentityKey(): string {
    return this.userService.isLoggedIn && this.userService.state.userId != null
      ? `account:${this.userService.state.userId}`
      : `install:${this.userService.getLocalUserId()}`;
  }

  private featureEnabled(feature: EAvailableFeatures): boolean {
    // Account rollout flags are the kill switches. Signed-out sessions have no
    // authenticated rollout source, so V1 fails closed to the normal Go Live.
    if (!this.userService.isLoggedIn) return false;
    return this.incrementalRolloutService.views.featureIsEnabled(feature);
  }

  private async waitForFeatureFlags(): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        this.incrementalRolloutService.featuresReady,
        new Promise<void>(resolve => {
          timeout = setTimeout(resolve, FEATURE_READINESS_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
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
    return { code: fallbackCode, message, retryable };
  }

  @mutation()
  private SET_INTRO(topology: IAutoOptimizerTopology) {
    Object.assign(this.state, {
      stage: 'intro',
      phase: null,
      progress: 0,
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
  private SET_PROGRESS(phase: TAutoOptimizerPhase, progress: number) {
    this.state.phase = phase;
    this.state.progress = progress;
  }

  @mutation()
  private SET_RESULT(result: IAutoOptimizerResult) {
    Object.assign(this.state, {
      stage: 'review',
      phase: null,
      progress: 100,
      result,
      error: null,
    });
  }

  @mutation()
  private SET_CANCELLING() {
    this.state.stage = 'cancelling';
    this.state.phase = null;
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
