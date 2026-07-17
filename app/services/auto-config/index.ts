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
import { IYoutubeAutoOptimizerProbeLease, YoutubeService } from 'services/platforms/youtube';
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
  autoConfigPhaseStepKey,
  filterAutoConfigTopologyProbes,
  hasRequiredAutoConfigCapabilities,
  sanitizeAutoConfigProbeEvidence,
  sanitizeAutoConfigProbeTargetBitrateKbps,
  supportedAutoConfigProbeProviders,
} from './probe-policy';
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

const NATIVE_RUN_TIMEOUT_MS = 150000;
const FEATURE_READINESS_TIMEOUT_MS = 2000;
const MIN_PHASE_VISIBLE_MS = 1000;
const YOUTUBE_INGEST_CONFIRMATION_TIMEOUT_MS = 12000;

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
  ConfirmAutoConfigProbeIngest?: (sessionId: string, probeId: string, received: boolean) => void;
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

interface IPreparedAutoConfigRequest {
  request: IAutoConfigRequest;
  topology: IAutoOptimizerTopology;
}

type TConcreteAutoOptimizerPhase = Exclude<TAutoOptimizerPhase, null>;

interface IPhaseStep {
  phase: TConcreteAutoOptimizerPhase;
  provider: TAutoOptimizerProbeProvider | null;
  targetBitrateKbps: number | null;
  key: string;
}

interface IPhaseUpdate {
  progress: number;
  targetBitrateKbps: number | null;
}

function initialFlowState(): Omit<IAutoOptimizerState, 'promptStates'> {
  return {
    stage: 'idle',
    phase: null,
    progress: 0,
    activeProbeProvider: null,
    activeProbeTargetBitrateKbps: null,
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
  @Inject() private youtubeService: YoutubeService;
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
  private displayedPhaseStep: IPhaseStep | null = null;
  private displayedPhaseSince = 0;
  private pendingPhaseSteps: IPhaseStep[] = [];
  private pendingPhaseUpdates = new Map<string, IPhaseUpdate>();
  private seenPhaseSteps = new Set<string>();
  private phaseDrainPromise: Promise<void> | null = null;
  private youtubeProbeLeases = new Map<string, IYoutubeAutoOptimizerProbeLease>();
  private youtubeConfirmationPromises = new Map<string, Promise<void>>();
  private probeAbortController: AbortController | null = null;

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
    await this.waitForFeatureFlags();
    if (!this.featureEnabled(EAvailableFeatures.autoOptimizerV1)) return false;
    if (!this.featureEnabled(EAvailableFeatures.autoOptimizerV1Apply)) return false;
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
      supportedAutoConfigProbeProviders(capabilities!, {
        twitchFeatureEnabled: this.featureEnabled(EAvailableFeatures.autoOptimizerV1TwitchProbe),
        youtubeFeatureEnabled: this.featureEnabled(EAvailableFeatures.autoOptimizerV1YoutubeProbe),
        canConfirmYoutubeIngest:
          typeof this.nativeApi().ConfirmAutoConfigProbeIngest === 'function',
      }),
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
      await this.cleanupOptimizerRun();
      await this.waitForPhasePacing(token);
      if (token !== this.runToken) return;
      this.SET_RESULT(result);
    } catch (e: unknown) {
      if (token !== this.runToken) return;
      try {
        await this.cleanupOptimizerRun(true);
        this.SET_ERROR(this.toError(e, 'optimization_failed', true));
      } catch (cleanupError: unknown) {
        this.SET_ERROR(this.toError(cleanupError, 'cleanup_failed', false));
      }
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
        supportedAutoConfigProbeProviders(capabilities!, {
          twitchFeatureEnabled: this.featureEnabled(EAvailableFeatures.autoOptimizerV1TwitchProbe),
          youtubeFeatureEnabled: this.featureEnabled(
            EAvailableFeatures.autoOptimizerV1YoutubeProbe,
          ),
          canConfirmYoutubeIngest:
            typeof this.nativeApi().ConfirmAutoConfigProbeIngest === 'function',
        }),
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
      throw error;
    }
  }

  private async createNativeRequestWithCredentials(
    sourceTopology: IAutoOptimizerTopology,
    credentialProbes: IAutoConfigActiveProbe[],
  ): Promise<IPreparedAutoConfigRequest> {
    const topology = cloneDeep(sourceTopology);
    const activeProbes: IAutoConfigActiveProbe[] = [];
    this.probeAbortController?.abort();
    const controller = new AbortController();
    this.probeAbortController = controller;

    for (const leg of topology.legs) {
      const acquired: Array<{
        candidate: typeof leg.probeCandidates[number];
        probe: IAutoConfigActiveProbe;
      }> = [];

      for (const candidate of leg.probeCandidates) {
        try {
          if (candidate.kind === 'twitch-standard-v1') {
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

      // Shared cloud-restream legs are all-or-nothing. Measuring only one
      // provider could recommend a bitrate that is unsafe for the other.
      if (acquired.length !== leg.probeCandidates.length) {
        for (const { probe } of acquired) {
          try {
            if (probe.kind !== 'youtube-unbound-v1') continue;
            const lease = this.youtubeProbeLeases.get(probe.probeId);
            if (!lease) continue;
            await this.youtubeService.releaseAutoOptimizerProbe(lease);
            this.youtubeProbeLeases.delete(probe.probeId);
          } finally {
            probe.streamKey = '';
            probe.server = '';
          }
        }
        leg.probeCandidates = [];
        leg.measurement = 'estimated';
        leg.estimateReason = 'probe_disabled';
        continue;
      }

      leg.probeCandidates = acquired.map(({ candidate }) => candidate);
      activeProbes.push(...acquired.map(({ probe }) => probe));
    }
    topology.probeCandidates = topology.legs.flatMap(leg => leg.probeCandidates);

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
      const targetBitrateKbps =
        phase === 'bandwidth' && provider
          ? sanitizeAutoConfigProbeTargetBitrateKbps(event.targetBitrateKbps)
          : null;
      this.queuePhaseProgress(
        phase,
        clampProgress(event.progress),
        token,
        provider,
        targetBitrateKbps,
      );
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
      provider: null,
      targetBitrateKbps: null,
      key: autoConfigPhaseStepKey('preflight'),
    };
    this.displayedPhaseSince = Date.now();
    this.pendingPhaseSteps = [];
    this.pendingPhaseUpdates.clear();
    this.seenPhaseSteps = new Set<string>([autoConfigPhaseStepKey('preflight')]);
    this.phaseDrainPromise = null;
  }

  private queuePhaseProgress(
    phase: TConcreteAutoOptimizerPhase,
    progress: number,
    token: number,
    provider: TAutoOptimizerProbeProvider | null,
    targetBitrateKbps: number | null,
  ) {
    if (token !== this.runToken || this.state.stage !== 'running') return;
    const step: IPhaseStep = {
      phase,
      provider: phase === 'bandwidth' ? provider : null,
      targetBitrateKbps: phase === 'bandwidth' && provider ? targetBitrateKbps : null,
      key: autoConfigPhaseStepKey(phase, provider),
    };

    if (step.key === this.displayedPhaseStep?.key) {
      this.displayedPhaseStep = step;
      this.SET_PROGRESS(step.phase, progress, step.provider, step.targetBitrateKbps);
      return;
    }

    if (this.seenPhaseSteps.has(step.key)) {
      if (this.pendingPhaseSteps.some(pending => pending.key === step.key)) {
        this.pendingPhaseUpdates.set(step.key, { progress, targetBitrateKbps: step.targetBitrateKbps });
      }
      return;
    }

    this.seenPhaseSteps.add(step.key);
    this.pendingPhaseSteps.push(step);
    this.pendingPhaseUpdates.set(step.key, { progress, targetBitrateKbps: step.targetBitrateKbps });
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
      const update = this.pendingPhaseUpdates.get(step.key) || {
        progress: 0,
        targetBitrateKbps: null,
      };
      this.pendingPhaseUpdates.delete(step.key);
      this.displayedPhaseStep = { ...step, targetBitrateKbps: update.targetBitrateKbps };
      this.displayedPhaseSince = Date.now();
      this.SET_PROGRESS(step.phase, update.progress, step.provider, update.targetBitrateKbps);
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
        const evidence = sanitizeAutoConfigProbeEvidence(leg.measurement?.probes);
        const activeEvidenceComplete =
          leg.measurement?.mode !== 'active' ||
          expected?.probeCandidates.every(candidate =>
            evidence.some(item => item.provider === candidate.provider && item.success),
          );
        return (
          expected?.display === leg.display &&
          (expected?.measurement === 'active' || leg.measurement?.mode === 'estimated') &&
          activeEvidenceComplete &&
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
      .map(leg => {
        const expected = expectedLegs.find(item => item.legId === leg.legId)!;
        return {
          legId: leg.legId,
          display: leg.display,
          destinations: expected.destinations.map(
            item => ({ platform: normalizePlatform(item.platform) } as IAutoOptimizerDestination),
          ),
          measurement: leg.measurement.mode,
          confidence: leg.measurement.confidence,
          route: expected.route,
          probes: sanitizeAutoConfigProbeEvidence(leg.measurement.probes),
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
        };
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
      activeProbeProvider: null,
      activeProbeTargetBitrateKbps: null,
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
      activeProbeProvider: null,
      activeProbeTargetBitrateKbps: null,
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
    provider: TAutoOptimizerProbeProvider | null = null,
    targetBitrateKbps: number | null = null,
  ) {
    this.state.phase = phase;
    this.state.progress = progress;
    this.state.activeProbeProvider = phase === 'bandwidth' ? provider : null;
    this.state.activeProbeTargetBitrateKbps =
      phase === 'bandwidth' && provider ? targetBitrateKbps : null;
  }

  @mutation()
  private SET_RESULT(result: IAutoOptimizerResult) {
    Object.assign(this.state, {
      stage: 'review',
      phase: null,
      progress: 100,
      activeProbeProvider: null,
      activeProbeTargetBitrateKbps: null,
      result,
      error: null,
    });
  }

  @mutation()
  private SET_CANCELLING() {
    this.state.stage = 'cancelling';
    this.state.phase = null;
    this.state.activeProbeProvider = null;
    this.state.activeProbeTargetBitrateKbps = null;
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
    this.state.activeProbeProvider = null;
    this.state.activeProbeTargetBitrateKbps = null;
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
