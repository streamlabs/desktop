import cloneDeep from 'lodash/cloneDeep';
import isEqual from 'lodash/isEqual';
import Vue from 'vue';
import * as obs from '../../../obs-api';
import { Inject, mutation, PersistentStatefulService, ViewHandler } from 'services/core';
import { IGoLiveSettings } from 'services/streaming';
import { SettingsService } from 'services/settings';
import { OutputSettingsService } from 'services/settings/output';
import { EncoderQueryService } from 'services/settings/output/encoder-query';
import { VideoSettingsService } from 'services/settings-v2/video';
import { UserService } from 'services/user';
import { TwitchService } from 'services/platforms/twitch';
import { YoutubeService } from 'services/platforms/youtube';
import { DualOutputService } from 'services/dual-output';
import { WindowsService } from 'services/windows';
import { SourcesService } from 'services/sources';
import { ScenesService } from 'services/scenes';
import { NavigationService } from 'services/navigation';
import { byOS, OS } from 'util/operating-systems';
import { $t } from 'services/i18n';
import { describeAutoOptimizerStreamSetup, isAutoOptimizerProfileCompatible } from './stream-setup';
import {
  autoConfigProviderForProbeKind,
  autoConfigPhaseStepDisposition,
  autoConfigPhaseStepKey,
  filterAutoConfigStreamSetupProbes,
  sanitizeAutoConfigProgressDetail,
  supportedAutoConfigProbeKinds,
} from './probe-policy';
import { awaitAutoConfigRun, closeAutoConfigRun, IAutoConfigRun } from './native-run';
import { AutoConfigProbeResources, AutoOptimizerProbeSetupError } from './probe-resources';
import {
  buildAutoConfigRequest,
  IAutoConfigAttemptContext,
  IAutoConfigVideoSnapshot,
  validateAutoConfigCanvasIdentities,
} from './request-builder';
import { acceptAutoOptimizerResult } from './result-acceptance';
import { applyAutoOptimizerRecommendations } from './recommendation-applier';
import {
  IAutoConfigEvent,
  IAutoOptimizerAdvice,
  IAutoOptimizerError,
  IAutoOptimizerProfile,
  IAutoOptimizerProgressDetail,
  IAutoOptimizerResult,
  IAutoOptimizerState,
  IAutoOptimizerStreamSetup,
  TAutoOptimizerPhase,
  TAutoOptimizerPromptState,
} from './types';

export * from './types';
export { describeAutoOptimizerStreamSetup } from './stream-setup';

const MIN_PHASE_VISIBLE_MS = 1000;
const CLEANUP_PROGRESS_START = 95;
const CLEANUP_PROGRESS_MAX = 99;
const CLEANUP_PROGRESS_STEP = 0.2;
const CLEANUP_PROGRESS_INTERVAL_MS = 1000;

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
    streamSetup: null,
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
    // This service can be created lazily while resolving its first RPC, before
    // that request starts buffering mutations. Initialize transient flow state
    // here so service initialization never emits an out-of-order reset.
    return {
      ...initialFlowState(),
      promptStates: state.promptStates || {},
    };
  }

  private frozenGoLiveSettings: IGoLiveSettings | null = null;
  private pendingGoLiveProfile: IAutoOptimizerProfile | null = null;
  private nativeRun: IAutoConfigRun | null = null;
  private runToken = 0;
  private displayedPhaseStep: IPhaseStep | null = null;
  private displayedPhaseSince = 0;
  private pendingPhaseSteps: IPhaseStep[] = [];
  private phaseDrainPromise: Promise<void> | null = null;
  private probeResources: AutoConfigProbeResources | null = null;
  /** Exact credential-free inputs retained only for native-result acceptance. */
  private attemptContext: IAutoConfigAttemptContext | null = null;

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
        await this.cleanupOptimizerRun();
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

    this.frozenGoLiveSettings = this.deepFreeze(frozen);
    const streamSetup = filterAutoConfigStreamSetupProbes(
      describeAutoOptimizerStreamSetup(
        frozen,
        this.dualOutputService.state.dualOutputMode && this.userService.isLoggedIn,
        this.twitchService.views.hasTwitchDualStreamAccess,
      ),
      supportedAutoConfigProbeKinds(),
    );
    if (!streamSetup.outputs.some(output => output.destinations.length > 0)) {
      this.frozenGoLiveSettings = null;
      return false;
    }

    this.SET_INTRO(streamSetup);
    return true;
  }

  async startOptimization(): Promise<void> {
    if (!this.frozenGoLiveSettings || !this.state.streamSetup) {
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
    let streamSetup = cloneDeep(this.state.streamSetup);
    this.SET_RUNNING(streamSetup);
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
      const prepared = await this.createNativeRequest(streamSetup);
      if (token !== this.runToken) {
        this.getProbeResources().redactCredentials();
        await this.getProbeResources().cleanupAfterNativeClose(async () => undefined);
        return;
      }
      streamSetup = prepared.streamSetup;
      const request = prepared.request;
      this.attemptContext = prepared.attemptContext;
      this.SET_STREAM_SETUP(streamSetup);

      let run: IAutoConfigRun;
      try {
        run = obs.NodeObs.AutoConfig.run(request, event => {
          this.handleNativeEvent(event, token);
        });
      } finally {
        // OSN has copied the request before run() returns. Never retain a
        // second in-memory copy of provider credentials in Desktop.
        this.getProbeResources().redactCredentials();
      }
      this.nativeRun = run!;
      const nativeResult = await awaitAutoConfigRun(run!);

      if (token !== this.runToken || this.nativeRun !== run!) return;

      const accepted = this.attemptContext
        ? acceptAutoOptimizerResult(nativeResult, this.attemptContext)
        : null;
      if (!accepted) {
        throw new Error(nativeResult.error?.code || 'Optimization failed');
      }
      const result: IAutoOptimizerResult = { ...accepted, advice: this.getAdvice() };
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
        await this.cleanupOptimizerRun();
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
    this.SET_INTRO(
      filterAutoConfigStreamSetupProbes(
        describeAutoOptimizerStreamSetup(
          this.frozenGoLiveSettings,
          this.dualOutputService.state.dualOutputMode && this.userService.isLoggedIn,
          this.twitchService.views.hasTwitchDualStreamAccess,
        ),
        supportedAutoConfigProbeKinds(),
      ),
    );
    await this.startOptimization();
  }

  async cancelOptimization(): Promise<void> {
    const streamSetup = this.state.streamSetup;
    ++this.runToken;
    this.SET_CANCELLING();
    try {
      await this.cleanupOptimizerRun();
      if (streamSetup) this.SET_INTRO(streamSetup);
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
      await this.cleanupOptimizerRun();
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
      await this.cleanupOptimizerRun();
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
    if (
      !this.frozenGoLiveSettings ||
      !this.state.result ||
      !this.state.streamSetup ||
      this.state.stage !== 'review'
    ) {
      return false;
    }

    this.SET_APPLYING();
    let profile: IAutoOptimizerProfile;
    try {
      profile = await applyAutoOptimizerRecommendations(
        this.state.result,
        this.state.streamSetup.type,
        {
          outputSettings: this.outputSettingsService,
          encoderQuery: this.encoderQueryService,
          settings: this.settingsService,
          videoSettings: this.videoSettingsService,
        },
      );
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

  /** Re-arm the one-time Go Live prompt for the currently signed-in account. */
  resetPromptState(): boolean {
    if (!this.userService.isLoggedIn || this.state.stage !== 'idle') return false;
    this.RESET_PROMPT_STATE(this.getIdentityKey());
    return true;
  }

  /**
   * Consume the profile saved for this confirmed attempt. The compatibility
   * check prevents a stale profile from crossing an unexpected stream-setup change.
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
      await this.cleanupOptimizerRun();
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
      await this.cleanupOptimizerRun();
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

  private getProbeResources(): AutoConfigProbeResources {
    if (!this.probeResources) {
      this.probeResources = new AutoConfigProbeResources(this.twitchService, this.youtubeService);
    }
    return this.probeResources;
  }

  private getAutoConfigVideoSnapshots(): Record<
    'horizontal' | 'vertical',
    IAutoConfigVideoSnapshot
  > {
    const snapshot = (display: 'horizontal' | 'vertical'): IAutoConfigVideoSnapshot => {
      const video = this.videoSettingsService.state[display];
      return {
        canvasId: this.videoSettingsService.contexts[display]?.canvasId,
        baseWidth: video.baseWidth,
        baseHeight: video.baseHeight,
        outputWidth: video.outputWidth,
        outputHeight: video.outputHeight,
        fpsNum: video.fpsNum,
        fpsDen: video.fpsDen,
      };
    };
    return {
      horizontal: snapshot('horizontal'),
      vertical: snapshot('vertical'),
    };
  }

  private async createNativeRequest(
    sourceStreamSetup: IAutoOptimizerStreamSetup,
  ): Promise<
    ReturnType<typeof buildAutoConfigRequest> & { streamSetup: IAutoOptimizerStreamSetup }
  > {
    const resources = this.getProbeResources();
    const videos = this.getAutoConfigVideoSnapshots();
    try {
      // Reject an unusable OBS environment before acquiring provider resources.
      validateAutoConfigCanvasIdentities(sourceStreamSetup, videos);
    } catch (error: unknown) {
      throw new AutoOptimizerProbeSetupError();
    }

    const prepared = await resources.prepare(sourceStreamSetup);
    try {
      return {
        ...buildAutoConfigRequest({
          streamSetup: prepared.streamSetup,
          outputProbes: [...prepared.probesByOutput].map(([outputId, probes]) => ({
            outputId,
            probes,
          })),
          outputSettings: this.outputSettingsService.getSettings(),
          videos,
        }),
        streamSetup: prepared.streamSetup,
      };
    } catch (error: unknown) {
      await resources.cleanupAfterNativeClose(async () => undefined);
      throw new AutoOptimizerProbeSetupError();
    }
  }

  private handleNativeEvent(event: IAutoConfigEvent, token: number) {
    if (token !== this.runToken) return;

    const provider = autoConfigProviderForProbeKind(event.probe?.kind);
    if (
      event.code === 'youtube_probe_waiting_for_ingest' &&
      provider === 'youtube' &&
      typeof event.probe?.id === 'string' &&
      event.probe.id
    ) {
      this.getProbeResources().confirmYoutubeIngest(
        event.probe.id,
        () => this.nativeRun,
        () => token === this.runToken && this.state.stage === 'running',
      );
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

  private async cleanupOptimizerRun(): Promise<void> {
    this.attemptContext = null;
    const closeNative = async () => {
      const run = this.nativeRun;
      if (!run) return;
      await closeAutoConfigRun(run, () => {
        if (this.nativeRun === run) this.nativeRun = null;
      });
    };

    if (this.probeResources) {
      await this.probeResources.cleanupAfterNativeClose(closeNative);
    } else {
      await closeNative();
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
  private SET_INTRO(streamSetup: IAutoOptimizerStreamSetup) {
    Object.assign(this.state, {
      stage: 'intro',
      phase: null,
      progress: 0,
      progressDetail: null,
      streamSetup,
      result: null,
      error: null,
    });
  }

  @mutation()
  private SET_RUNNING(streamSetup: IAutoOptimizerStreamSetup) {
    Object.assign(this.state, {
      stage: 'running',
      phase: 'preflight',
      progress: 0,
      progressDetail: emptyProgressDetail(),
      streamSetup,
      result: null,
      error: null,
    });
  }

  @mutation()
  private SET_STREAM_SETUP(streamSetup: IAutoOptimizerStreamSetup) {
    this.state.streamSetup = streamSetup;
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
  private RESET_PROMPT_STATE(identity: string) {
    Vue.delete(this.state.promptStates, identity);
  }

  @mutation()
  private RESET_FLOW() {
    Object.assign(this.state, initialFlowState());
  }
}
