import { Subject } from 'rxjs';
import { Service } from '../core/service';
import {
  SimpleStreamingFactory,
  AdvancedStreamingFactory,
  ServiceFactory,
  VideoEncoderFactory,
  AudioEncoderFactory,
  DelayFactory,
  ReconnectFactory,
  NetworkFactory,
  ISimpleStreaming,
  IAdvancedStreaming,
  IService,
  IVideoEncoder,
  IAudioEncoder,
  EOutputSignal,
} from '../../../obs-api';
import * as obs from '../../../obs-api';
import { Inject } from 'services';
import { StreamSettingsService } from 'services/settings/streaming';
import { OutputSettingsService, SettingsService } from 'services/settings';
import { getPlatformService, TPlatform } from 'services/platforms';
import { TwitchService } from 'services/platforms/twitch';
import { YoutubeService } from 'app-services';
import { VideoSettingsService } from 'services/settings-v2/video';
import { UserService } from 'services/user';
import { StreamingService } from 'services/streaming';

export type TConfigEvent =
  | 'starting_step'
  | 'progress'
  | 'stopping_step'
  | 'error'
  | 'done'
  // V2 payload events — same callback, JSON in `payload`.
  | 'bandwidth_result'
  | 'selection_decision'
  | 'video_decision'
  | 'encoder_detection';

export interface IConfigStep {
  startMethod: string;
  identifier: string;
}

export interface IConfigProgress {
  event: TConfigEvent;
  description: string;
  percentage?: number;
  continent?: string;
  payload?: string;
}

// Payload shapes for the V2 autoconfig event surface and GetAutoConfigSummary.
// All bitrates/throughputs are kbps.

export interface IVideoDimensions {
  cx: number;
  cy: number;
  fpsNum: number;
  fpsDen: number;
}

export interface IBandwidthResult {
  targetId: number;
  testBitrate: number;
  platformCapProbed: number;
  measuredKbps: number;
  droppedFrames: number;
  totalFrames: number;
  totalBytes: number;
  elapsedMs: number;
  serverTested: string;
}

export type TBindingCap = 'user' | 'heuristic' | 'measured' | 'platform';

export interface ISelectionDecision {
  targetId: number;
  userBitrate: number;
  heuristic: number;
  choseBeforeCaps: number;
  afterMeasuredCap: number;
  afterPlatformCap: number;
  picked: number;
  bindingCap: TBindingCap;
  appliedServer: string;
  currentEncoderId: string;
  chosenEncoderId: string;
  encoderChanged: boolean;
}

export interface IVideoDecision {
  contextPtr: string;
  before: IVideoDimensions;
  after: IVideoDimensions;
  obsSetVideoInfoRet: number;
  skipped: boolean;
}

export interface IEncoderDetection {
  hardwareEncodingAvailable: boolean;
  nvenc: boolean;
  qsv: boolean;
  vce: boolean;
  apple: boolean;
  softwareTested: boolean;
  chosenStreamingEncoder: string;
  chosenRecordingEncoder: string;
  recordingQuality: 'Stream' | 'High';
}

export interface IAutoConfigSummary {
  complete: boolean;
  encoderDetection: IEncoderDetection;
  videoDecision: {
    chosen: IVideoDimensions;
    perCanvas: IVideoDecision[];
  };
  bandwidthTest: {
    perTarget: IBandwidthResult[];
  };
  selection: {
    perTarget: ISelectionDecision[];
  };
}

interface ITempStream {
  // Advanced streams configure audio via global audio tracks (no audioEncoder
  // on the stream object), so the audioEncoder field is optional.
  mode: 'Simple' | 'Advanced';
  stream: ISimpleStreaming | IAdvancedStreaming;
  service: IService;
  videoEncoder: IVideoEncoder;
  audioEncoder?: IAudioEncoder;
  // Label used in diagnostic logs so multi-target output is intelligible.
  // For platform-derived streams this is the TPlatform name; for the
  // single-target backward-compat path it's 'primary'.
  label: string;
}

// Per-platform connection info. Built inline in start() so we don't have to
// touch the global Stream settings (which can only describe one platform at
// a time and gets stomped by whoever writes last).
interface IPerPlatformStreamSettings {
  key: string;
  server: string;
  service: string;
  streamType: string;
}

export class AutoConfigService extends Service {
  @Inject() streamSettingsService: StreamSettingsService;
  @Inject() settingsService: SettingsService;
  @Inject() outputSettingsService: OutputSettingsService;
  @Inject() videoSettingsService: VideoSettingsService;
  @Inject() userService: UserService;
  @Inject() streamingService: StreamingService;

  configProgress = new Subject<IConfigProgress>();
  // Dev-only: human-readable trace of what AutoConfig is doing. The Optimize
  // dialog subscribes to render an in-app log so devs don't have to dig in
  // DevTools. Safe to remove once the V2 migration stabilises.
  diagnosticLog = new Subject<string>();

  // V2 typed event streams. Live decisions stream in via the OSN event callback
  // during the run; `summary` fires once after `done` from GetAutoConfigSummary.
  bandwidthResult = new Subject<IBandwidthResult>();
  selectionDecision = new Subject<ISelectionDecision>();
  videoDecision = new Subject<IVideoDecision>();
  encoderDetection = new Subject<IEncoderDetection>();
  summary = new Subject<IAutoConfigSummary>();

  private chainMode: 'streaming' | 'recording' | null = null;
  // Multi-target: one entry per stream we passed to InitializeAutoConfig, in
  // the same order. `targetIdToLabel` maps the V2 backend's reported targetId
  // back to a human label so per-target events are intelligible. Assumption:
  // V2's targetId equals the array index of the stream we passed; validated
  // at runtime in handleV2PayloadEvent (warns if out of range).
  private tempStreams: ITempStream[] = [];
  private targetIdToLabel = new Map<number, string>();
  // Each `selection_decision` event contributes one `picked` (kbps). On done,
  // we persist min(...) — the narrowest pipe wins, since the user has a
  // single global encoder bitrate. Empty when the event never fired (e.g.
  // pre-V2 OSN), in which case persist falls back to reading the encoder.
  private pickedBitrates: number[] = [];

  private logDiag(msg: string, data?: unknown) {
    if (data !== undefined) {
      // Pass the JSON-serialized form to console.log instead of the raw object
      // so node's util.inspect doesn't truncate nested fields to `[Object]` —
      // we want full visibility into IVideoDecision.before/after etc.
      let serialized: string;
      try { serialized = JSON.stringify(data, null, 2); } catch { serialized = String(data); }
      console.log(`AutoConfig: ${msg}\n${serialized}`);
      this.diagnosticLog.next(`${msg}\n${serialized}`);
    } else {
      console.log(`AutoConfig: ${msg}`);
      this.diagnosticLog.next(msg);
    }
  }

  private logDiagError(msg: string, err?: unknown) {
    if (err !== undefined) {
      // Same reasoning as logDiag — serialize so nested error context isn't
      // truncated to `[Object]` in node logs.
      const errStr = err instanceof Error
        ? `${err.name}: ${err.message}`
        : (() => { try { return JSON.stringify(err, null, 2); } catch { return String(err); } })();
      console.error(`AutoConfig: ${msg}\n${errStr}`);
      this.diagnosticLog.next(`ERROR: ${msg} — ${errStr}`);
    } else {
      console.error(`AutoConfig: ${msg}`);
      this.diagnosticLog.next(`ERROR: ${msg}`);
    }
  }

  async start() {
    this.logDiag('start() called', {
      mode: this.outputSettingsService.getSettings().mode,
      streamingBefore: this.outputSettingsService.getSettings().streaming,
    });

    // Reset multi-target state from any prior run.
    this.tempStreams = [];
    this.targetIdToLabel.clear();
    this.pickedBitrates = [];

    /**
     * Using the optimizer when two contexts are active is tricky because the optimizer
     * works with the last context created. If the app has opened a dual output scene at any
     * point during the current session, the vertical context exists. The optimizer
     * should only run on the horizontal context. Until output settings and streaming are migrated,
     * some non-optimal trickery is necessary.
     *
     * By design, the only difference in settings between the horizontal and vertical contexts is
     * the base width/height and output width/height. So before running the optimizer,
     * confirm that horizontal base width/height and output width/height are on the Video property.
     */
    if (this.videoSettingsService.contexts?.vertical) {
      this.videoSettingsService.confirmVideoSettingDimensions();
    }

    // Multi-target: enumerate the user's enabled platforms (the same source
    // real go-live uses) and build one temp stream per platform. Filter to
    // platforms with explicit support in this autoconfig flow — others would
    // need their own server/streamType lookup logic, deferred for now.
    const allEnabled = this.streamingService.views.enabledPlatforms;
    const supportedPlatforms = allEnabled.filter(
      (p): p is 'twitch' | 'youtube' => p === 'twitch' || p === 'youtube',
    );
    const skipped = allEnabled.filter(p => p !== 'twitch' && p !== 'youtube');
    if (skipped.length > 0) {
      this.logDiag('skipping enabled platforms not supported by autoconfig v1', { skipped });
    }

    if (supportedPlatforms.length === 0) {
      this.logDiagError(
        'no supported platforms enabled (twitch or youtube); cannot run bandwidth test',
        { allEnabled },
      );
      this.emit({ event: 'error', description: 'no_supported_platform' });
      return;
    }

    // V2 backend pre-req for Advanced streams: it calls setAudioEncoder()
    // before StartOutput(), which indexes into the GLOBAL audioTracks array
    // (osn-advanced-streaming.cpp:264) and silently returns false if the
    // track or its audioEnc is missing. start() then returns without
    // calling StartOutput(), so the rtmp_output is created but never
    // connects — which presents as `no_valid_bandwidth_results` after V2's
    // 5-second wait. Audio tracks don't persist across OSN sessions, so on
    // a fresh start (autoconfig usually runs before any go-live in the
    // session) track 1 doesn't exist yet. Real go-live handles this at
    // streaming.ts:1866 with the same call. Idempotent, so safe to always
    // run; no-op for Simple mode (which uses stream.audioEncoder directly).
    if (this.outputSettingsService.getSettings().mode === 'Advanced') {
      await this.streamingService.validateOrCreateAudioTrack(1);
    }

    for (const platform of supportedPlatforms) {
      try {
        const perPlatform = await this.prepareStreamSettingsForPlatform(platform);
        if (!perPlatform.key) {
          this.logDiagError(`platform ${platform} returned empty key after prepare; skipping`);
          continue;
        }
        const tempStream = this.createTempStream(perPlatform, platform);
        // targetId is assumed to equal the array index of streams we pass to
        // InitializeAutoConfig — verified at runtime in handleV2PayloadEvent.
        this.targetIdToLabel.set(this.tempStreams.length, platform);
        this.tempStreams.push(tempStream);
      } catch (e: unknown) {
        this.logDiagError(`failed to prepare platform ${platform}; skipping`, e);
      }
    }

    if (this.tempStreams.length === 0) {
      this.logDiagError('all enabled platforms failed to prepare; aborting');
      this.disposeTempStreams();
      this.emit({ event: 'error', description: 'all_targets_failed_setup' });
      return;
    }

    this.chainMode = 'streaming';
    const labels = this.tempStreams.map(t => t.label);
    this.logDiag(`passed ${this.tempStreams.length} streams to InitializeAutoConfig`, { labels });
    // Per-target diag log so failures per platform are easy to attribute. Don't
    // log keys themselves (secret) — only their length so we can confirm the
    // key was populated.
    const dbg = (v: unknown) => v ?? '(undefined)';
    for (let i = 0; i < this.tempStreams.length; i++) {
      const t = this.tempStreams[i];
      this.logDiag(`target ${i} [${t.label}] config`, {
        mode: t.mode,
        encoderId: t.videoEncoder.id,
        encoderSettings: t.videoEncoder.settings,
        videoEncoderLastError: dbg(t.videoEncoder.lastError),
        audioEncoderBitrate: dbg(t.audioEncoder?.bitrate),
      });
    }

    obs.NodeObs.InitializeAutoConfig(
      this.tempStreams.map(t => t.stream),
      (progress: IConfigProgress) => this.handleProgress(progress),
    );
    obs.NodeObs.StartBandwidthTest();
  }

  /**
   * Per-platform setup for a bandwidth-test target. Calls the platform's own
   * fetchStreamKey/beforeGoLive to populate its state, then returns the
   * RTMP server + streamType + key shape that ServiceFactory expects.
   *
   * Crucially, this does NOT write to the legacy global `Stream` settings —
   * each platform owns its key in `getPlatformService(p).state.streamKey`,
   * so two platforms can coexist without stomping each other.
   */
  private async prepareStreamSettingsForPlatform(
    platform: 'twitch' | 'youtube',
  ): Promise<IPerPlatformStreamSettings> {
    if (platform === 'twitch') {
      const svc = getPlatformService('twitch') as TwitchService;
      const key = await svc.fetchStreamKey();
      // Twitch uses rtmp_common with the platform-name service; OSN auto-picks
      // the closest ingest server when `server: 'auto'`.
      return { key, server: 'auto', service: 'Twitch', streamType: 'rtmp_common' };
    }
    // youtube
    const svc = getPlatformService('youtube') as YoutubeService;
    await svc.beforeGoLive({
      platforms: {
        youtube: {
          enabled: true,
          useCustomFields: false,
          title: 'bandwidthTest',
          description: 'bandwidthTest',
          privacyStatus: 'private',
          categoryId: '1',
        },
      },
      advancedMode: true,
      customDestinations: [],
      recording: 'horizontal',
    });
    // Mirrors what youtube.ts:561-571 writes when not in multistream mode —
    // we replicate it here per-target instead of letting the platform write
    // to the global Stream settings (which would stomp Twitch's settings
    // when both are enabled).
    return {
      key: svc.state.streamKey,
      server: 'rtmp://a.rtmp.youtube.com/live2',
      service: '',
      streamType: 'rtmp_custom',
    };
  }

  async startRecording() {
    this.chainMode = 'recording';
    // Recording-only autoconfig has no streaming target on hand. Under the new
    // OSN contract this errors out with `no_streaming_targets_provided`; the
    // 'error' branch in handleProgress will surface it and tear down. Revert
    // once a proper recording autoconfig path is reintroduced.
    obs.NodeObs.InitializeAutoConfig(
      [],
      (progress: IConfigProgress) => this.handleProgress(progress),
    );
    obs.NodeObs.StartSetDefaultSettings();
  }

  private createTempStream(streamSettings: IPerPlatformStreamSettings, label: string): ITempStream {
    // Seed the temp stream from the user's real streaming config so V2 autoconfig
    // runs *on top of* what's already set (encoder type + settings, network bind
    // flags, simple/advanced-mode specifics) instead of measuring a hardcoded
    // baseline. Mirrors the canonical go-live wiring in streaming.ts (Simple +
    // Advanced branches around lines 1850-1900).
    //
    // Four settings are *intentionally* overridden away from the user's value
    // because they would corrupt the bandwidth measurement:
    //   - enforceServiceBitrate=false → don't cap at platform nominal
    //   - delay.enabled=false         → stream delay would distort timing
    //   - reconnect.enabled=false     → recovery would hide network blips
    //   - network.enableDynamicBitrate=false → adaptive bitrate would adjust
    //                                          mid-test, producing garbage
    const mode = this.outputSettingsService.getSettings().mode;
    const userStreamSettings = this.outputSettingsService.getStreamingSettings('horizontal');
    const userEncoderSettings = this.outputSettingsService.getStreamingVideoEncoderSettings(mode);
    const obsAdvancedSettings = this.settingsService.views.values.Advanced;

    // Names must be unique per target — OSN factory instances are keyed by
    // name, so two targets sharing 'autoconfig-vencoder' would collide.
    const videoEncoder = VideoEncoderFactory.create(
      userStreamSettings.videoEncoder || 'obs_x264',
      `autoconfig-vencoder-${label}`,
      userEncoderSettings,
    );
    if (videoEncoder.lastError) {
      this.logDiagError(
        `videoEncoder reported lastError after create (${label})`,
        videoEncoder.lastError,
      );
    }

    // The service factory id MUST match the user's actual streamType, otherwise
    // service.update() writes (e.g.) rtmp_custom fields onto an rtmp_common
    // service and OSN silently rejects them — the bandwidth test then sends
    // no real bytes and V2 reports `no_valid_bandwidth_results`. Default to
    // rtmp_common only when streamType is missing.
    const serviceType = streamSettings.streamType || 'rtmp_common';
    const service = ServiceFactory.create(
      serviceType,
      `autoconfig-service-${label}`,
      ServiceFactory.legacySettings.settings,
    );
    service.update(streamSettings);

    const delay = DelayFactory.create();
    delay.enabled = false; // override: see header comment

    const reconnect = ReconnectFactory.create();
    reconnect.enabled = false; // override: see header comment

    const network = NetworkFactory.create();
    network.bindIP = obsAdvancedSettings.BindIP;
    network.enableDynamicBitrate = false; // override: see header comment
    network.enableOptimizations = obsAdvancedSettings.NewSocketLoopEnable;
    network.enableLowLatency = obsAdvancedSettings.LowLatencyEnable;

    // Diagnostic-only signal handler shared between flavours. V2 autoconfig
    // drives the test via InitializeAutoConfig's progress callback; this hook
    // just surfaces any stream-level signals (start/stop/error) into our log
    // so we can see them if something unexpected happens during the test.
    const signalHandler = (signal: EOutputSignal) => {
      this.logDiag(`temp stream signal [${label}]: type=${signal.type} signal=${signal.signal} code=${signal.code}` +
        (signal.error ? ` error=${signal.error}` : ''));
    };

    if (mode === 'Advanced') {
      const stream = AdvancedStreamingFactory.create();
      stream.video = this.videoSettingsService.contexts.horizontal;
      stream.videoEncoder = videoEncoder;
      stream.service = service;
      stream.delay = delay;
      stream.reconnect = reconnect;
      stream.network = network;
      stream.enforceServiceBitrate = false; // override: see header comment
      // Advanced streams use global audio tracks rather than a per-stream
      // audioEncoder. Track 1 is the horizontal default in the real go-live
      // path (streaming.ts:1865). Rescaling is left off so the bandwidth
      // test runs at canvas resolution.
      stream.audioTrack = 1;
      stream.rescaling = false;
      stream.signalHandler = signalHandler;
      return { mode: 'Advanced', stream, service, videoEncoder, label };
    }

    // Simple mode: needs an explicit audio encoder on the stream object plus
    // the simple-only useAdvanced/customEncSettings (raw x264 opts) bridge.
    const userAudioEncoder = this.outputSettingsService.getRecordingAudioEncoderSettings();
    const audioEncoder = AudioEncoderFactory.create(
      userAudioEncoder || 'ffmpeg_aac',
      `autoconfig-aencoder-${label}`,
    );

    const stream = SimpleStreamingFactory.create();
    stream.video = this.videoSettingsService.contexts.horizontal;
    stream.videoEncoder = videoEncoder;
    stream.audioEncoder = audioEncoder;
    stream.service = service;
    stream.delay = delay;
    stream.reconnect = reconnect;
    stream.network = network;
    stream.enforceServiceBitrate = false; // override: see header comment

    // ISimpleStreamingOutputSettings is file-local in output-settings.ts so
    // we narrow with a local shape cast rather than a cross-file export.
    const simpleSettings = userStreamSettings as {
      useAdvanced?: boolean;
      customEncSettings?: string;
    };
    if (simpleSettings.useAdvanced != null) stream.useAdvanced = simpleSettings.useAdvanced;
    if (simpleSettings.customEncSettings != null) {
      stream.customEncSettings = simpleSettings.customEncSettings;
    }

    stream.signalHandler = signalHandler;

    return { mode: 'Simple', stream, service, videoEncoder, audioEncoder, label };
  }

  private disposeTempStreams() {
    for (const t of this.tempStreams) {
      try { t.stream.stop(true); } catch {}
      try {
        if (t.mode === 'Advanced') {
          AdvancedStreamingFactory.destroy(t.stream as IAdvancedStreaming);
        } else {
          SimpleStreamingFactory.destroy(t.stream as ISimpleStreaming);
        }
      } catch {}
      try { ServiceFactory.destroy(t.service); } catch {}
      try { t.videoEncoder.release(); } catch {}
      if (t.audioEncoder) {
        try { t.audioEncoder.release(); } catch {}
      }
    }
    this.tempStreams = [];
    this.targetIdToLabel.clear();
    this.pickedBitrates = [];
  }

  private emit(progress: IConfigProgress) {
    this.configProgress.next(progress);
  }

  /**
   * Persist V2 autoconfig's chosen bitrate back to the user's output settings.
   * Without this, the chosen bitrate vanishes when the temp encoders are
   * released and the UI keeps showing the pre-test value.
   *
   * Multi-target: prefer `min(...selection_decision.picked)` across all
   * targets — the user's encoder has a single global bitrate, and we don't
   * want to overrun the narrowest pipe. Falls back to reading the first
   * target's encoder.settings if no `selection_decision` events arrived
   * (e.g. older OSN), to preserve the single-target behavior.
   */
  private persistAutoConfigEncoderResults() {
    if (!this.chainMode || this.chainMode !== 'streaming') return;
    if (this.tempStreams.length === 0) {
      this.logDiagError('no temp streams to read results from');
      return;
    }

    const beforeStreaming = this.outputSettingsService.getSettings().streaming;
    let chosenBitrate: number | undefined;
    let source: 'selection_decision_min' | 'encoder_fallback' | 'none';

    if (this.pickedBitrates.length > 0) {
      chosenBitrate = Math.min(...this.pickedBitrates);
      source = 'selection_decision_min';
      this.logDiag('per-target picks (kbps)', {
        labels: this.tempStreams.map(t => t.label),
        picks: this.pickedBitrates,
        chosen: chosenBitrate,
      });
    } else {
      // Fallback: read whatever V2 wrote into the first target's encoder.
      const first = this.tempStreams[0];
      const fallbackSettings = first.videoEncoder.settings ?? {};
      chosenBitrate = typeof fallbackSettings.bitrate === 'number' ? fallbackSettings.bitrate : undefined;
      source = chosenBitrate !== undefined ? 'encoder_fallback' : 'none';
      this.logDiag('no selection_decision events; falling back to first target encoder', {
        firstTargetLabel: first.label,
        fallbackBitrate: chosenBitrate,
      });
    }

    this.logDiag('V2 results to persist', {
      source,
      chosenBitrate,
      beforeStreaming,
    });

    if (chosenBitrate != null && chosenBitrate !== beforeStreaming.bitrate) {
      this.outputSettingsService.setSettings({
        streaming: { bitrate: chosenBitrate },
      });
    }

    const afterStreaming = this.outputSettingsService.getSettings().streaming;
    this.logDiag('persisted streaming settings', { afterStreaming });
  }

  handleProgress(progress: IConfigProgress) {
    // V2-only payload events: route to typed Subjects and short-circuit. They
    // must NOT flow through configProgress — Optimize.tsx's subscriber treats
    // any unknown event as an error and bails the run.
    if (
      progress.event === 'bandwidth_result' ||
      progress.event === 'selection_decision' ||
      progress.event === 'video_decision' ||
      progress.event === 'encoder_detection'
    ) {
      this.handleV2PayloadEvent(progress);
      return;
    }

    // Trace step transitions in the in-app log (skip per-tick `progress` spam).
    if (progress.event !== 'progress') {
      this.logDiag(`event: ${progress.event} / ${progress.description}`);
    }

    if (progress.event === 'error') {
      // Surface the V2 backend's raw error description before any remapping so
      // diagnostics like `video_failed_ret_-N` are immediately visible.
      this.logDiagError('V2 backend error', progress);
    }

    // For `done`, do persist/migrate/summary BEFORE emitting through
    // configProgress. Optimize.tsx's done handler unsubscribes everything
    // synchronously, so any Subject we want subscribers to see (`summary`)
    // must fire first. It also means snapshotEncoderSettings('AFTER') in the
    // UI reads the post-persist values, which is what dev expects.
    if (progress.event === 'done') {
      // V2 mutates the temp encoders we own (autoconfig-vencoder-*) — bitrate
      // and anything else applyResults touched live there until we release them.
      // Read those values back (or, in multi-target mode, aggregate from the
      // collected selection_decision events) and persist BEFORE
      // disposeTempStreams() releases them, otherwise the user's stored
      // settings stay at whatever they were before.
      this.persistAutoConfigEncoderResults();

      // Video context: V2 mutates server-side OSN state directly. The OSN
      // client no longer caches canvas getters, so reads of contexts[*].video
      // and .legacySettings inside migrateAutoConfigSettings see fresh values.
      // obs_set_video_info applies width/height live, but FPS requires canvas
      // destroy+recreate (handled inside the migration).
      this.videoSettingsService.migrateAutoConfigSettings();

      this.fetchAndEmitSummary();
    }

    // V2 emits `applying_settings` for the apply phase; the UI's summaryForStep
    // map (Optimize.tsx) does not know that key, so remap to its closest analog.
    const uiDescription =
      progress.description === 'applying_settings' ? 'saving_settings' : progress.description;
    this.emit({ ...progress, description: uiDescription });

    if (progress.event === 'stopping_step') {
      if (this.chainMode === 'streaming' && progress.description === 'bandwidth_test') {
        obs.NodeObs.StartSaveSettings();
      } else if (
        this.chainMode === 'recording' &&
        progress.description === 'setting_default_settings'
      ) {
        obs.NodeObs.StartSaveSettings();
      }
    } else if (progress.event === 'done') {
      this.disposeTempStreams();
      obs.NodeObs.TerminateAutoConfig();
      this.chainMode = null;
    } else if (progress.event === 'error') {
      this.disposeTempStreams();
      obs.NodeObs.TerminateAutoConfig();
      this.chainMode = null;
    }
  }

  private handleV2PayloadEvent(progress: IConfigProgress) {
    if (!progress.payload) {
      this.logDiagError(`V2 event ${progress.event} missing payload`);
      return;
    }

    let data: unknown;
    try {
      data = JSON.parse(progress.payload);
    } catch (e: unknown) {
      this.logDiagError(`V2 event ${progress.event} payload parse failed`, e);
      return;
    }

    // For per-target events, resolve the target label and surface it in the
    // diag log alongside the raw payload. We assume targetId == array index
    // of the streams we passed to InitializeAutoConfig; warn loudly if it's
    // out of range so the assumption is easy to spot when wrong.
    const dataObj = data as { targetId?: number };
    const targetId = typeof dataObj?.targetId === 'number' ? dataObj.targetId : undefined;
    let targetLabel: string | undefined;
    if (
      targetId !== undefined &&
      (progress.event === 'bandwidth_result' || progress.event === 'selection_decision')
    ) {
      targetLabel = this.targetIdToLabel.get(targetId);
      if (targetLabel === undefined) {
        this.logDiagError(
          `V2 ${progress.event} reported targetId=${targetId} outside known range ` +
            `[0, ${this.tempStreams.length}); the array-index assumption may be wrong`,
        );
      }
    }
    this.logDiag(progress.event + (targetLabel ? ` [${targetLabel}]` : ''), data);

    switch (progress.event) {
      case 'bandwidth_result':
        this.bandwidthResult.next(data as IBandwidthResult);
        break;
      case 'selection_decision': {
        const sel = data as ISelectionDecision;
        // Collect each target's chosen bitrate. On `done`, the persist step
        // takes min(...) since the user has a single global encoder bitrate
        // and we don't want to overrun the narrowest target.
        if (typeof sel.picked === 'number' && sel.picked > 0) {
          this.pickedBitrates.push(sel.picked);
        }
        this.selectionDecision.next(sel);
        break;
      }
      case 'video_decision':
        this.videoDecision.next(data as IVideoDecision);
        break;
      case 'encoder_detection':
        this.encoderDetection.next(data as IEncoderDetection);
        break;
    }
  }

  private fetchAndEmitSummary() {
    // Loosely typed on the obs-api boundary — NodeObs is untyped today.
    const nodeObs = (obs.NodeObs as unknown) as { GetAutoConfigSummary?: () => string };
    if (typeof nodeObs.GetAutoConfigSummary !== 'function') {
      this.logDiag('GetAutoConfigSummary not available on NodeObs (older OSN?)');
      return;
    }

    let raw: string;
    try {
      raw = nodeObs.GetAutoConfigSummary();
    } catch (e: unknown) {
      this.logDiagError('GetAutoConfigSummary call threw', e);
      return;
    }

    let parsed: IAutoConfigSummary;
    try {
      parsed = JSON.parse(raw) as IAutoConfigSummary;
    } catch (e: unknown) {
      this.logDiagError('GetAutoConfigSummary parse failed', e);
      return;
    }

    if (!parsed.complete) {
      // Should never happen if called after `done`, but the API doc allows it.
      this.logDiag('summary returned complete=false after done event', parsed);
    } else {
      this.logDiag('summary', parsed);
    }
    this.summary.next(parsed);
  }
}
