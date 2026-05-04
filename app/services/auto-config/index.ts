import { Subject } from 'rxjs';
import { Service } from '../core/service';
import {
  SimpleStreamingFactory,
  ServiceFactory,
  VideoEncoderFactory,
  AudioEncoderFactory,
  DelayFactory,
  ReconnectFactory,
  NetworkFactory,
  ISimpleStreaming,
  IService,
  IVideoEncoder,
  IAudioEncoder,
  EOutputSignal,
} from '../../../obs-api';
import * as obs from '../../../obs-api';
import { Inject } from 'services';
import { StreamSettingsService } from 'services/settings/streaming';
import { OutputSettingsService, SettingsService } from 'services/settings';
import { getPlatformService } from 'services/platforms';
import { TwitchService } from 'services/platforms/twitch';
import { YoutubeService } from 'app-services';
import { VideoSettingsService } from 'services/settings-v2/video';
import { UserService } from 'services/user';

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
  stream: ISimpleStreaming;
  service: IService;
  videoEncoder: IVideoEncoder;
  audioEncoder: IAudioEncoder;
}

export class AutoConfigService extends Service {
  @Inject() streamSettingsService: StreamSettingsService;
  @Inject() settingsService: SettingsService;
  @Inject() outputSettingsService: OutputSettingsService;
  @Inject() videoSettingsService: VideoSettingsService;
  @Inject() userService: UserService;

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
  private tempStream: ITempStream | null = null;

  private logDiag(msg: string, data?: unknown) {
    if (data !== undefined) {
      console.log(`AutoConfig: ${msg}`, data);
      let serialized: string;
      try { serialized = JSON.stringify(data, null, 2); } catch { serialized = String(data); }
      this.diagnosticLog.next(`${msg}\n${serialized}`);
    } else {
      console.log(`AutoConfig: ${msg}`);
      this.diagnosticLog.next(msg);
    }
  }

  private logDiagError(msg: string, err?: unknown) {
    if (err !== undefined) {
      console.error(`AutoConfig: ${msg}`, err);
      const errStr = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
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
    try {
      if (this.userService.views.isTwitchAuthed) {
        const service = getPlatformService('twitch') as TwitchService;
        const key = await service.fetchStreamKey();
        this.streamSettingsService.setSettings({ key, platform: 'twitch' });
      } else if (this.userService.views.isYoutubeAuthed) {
        const service = getPlatformService('youtube') as YoutubeService;
        await service.beforeGoLive({
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
      }
    } catch (e: unknown) {
      this.logDiagError('failed to fetch stream key', e);
      this.emit({ event: 'error', description: 'error_fetching_stream_key' });
      return;
    }

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

    const streamSettings = this.settingsService.views.values.Stream;
    if (!streamSettings.key) {
      this.logDiagError('Stream settings have no key after fetch', { streamSettings });
      this.emit({ event: 'error', description: 'error_fetching_stream_key' });
      return;
    }

    try {
      this.tempStream = this.createTempStream(streamSettings);
    } catch (e: unknown) {
      this.logDiagError('failed to construct temp stream', e);
      this.disposeTempStream();
      this.emit({ event: 'error', description: 'temp_stream_setup_failed' });
      return;
    }

    this.chainMode = 'streaming';
    this.logDiag('starting bandwidth test', {
      encoderId: this.tempStream.videoEncoder.id,
      encoderSettings: this.tempStream.videoEncoder.settings,
      audioEncoderBitrate: this.tempStream.audioEncoder.bitrate,
    });
    obs.NodeObs.InitializeAutoConfig((progress: IConfigProgress) => this.handleProgress(progress));
    obs.NodeObs.StartBandwidthTest();
  }

  async startRecording() {
    this.chainMode = 'recording';
    obs.NodeObs.InitializeAutoConfig((progress: IConfigProgress) => this.handleProgress(progress));
    obs.NodeObs.StartSetDefaultSettings();
  }

  private createTempStream(streamSettings: { key: string; streamType: string; service: string; server: string }): ITempStream {
    // Seed the temp stream from the user's real streaming config so V2 autoconfig
    // runs *on top of* what's already set (encoder type + settings, audio encoder,
    // network bind/perf flags, simple-mode custom opts) instead of measuring a
    // hardcoded baseline. Mirrors the canonical go-live wiring in
    // streaming.ts:1920-1992 (SimpleStreaming branch).
    //
    // Three settings are *intentionally* overridden away from the user's value
    // because they would corrupt the bandwidth measurement:
    //   - enforceServiceBitrate=false → don't cap at platform nominal
    //   - delay.enabled=false         → stream delay would distort timing
    //   - reconnect.enabled=false     → recovery would hide network blips
    //   - network.enableDynamicBitrate=false → adaptive bitrate would adjust
    //                                          mid-test, producing garbage
    const mode = this.outputSettingsService.getSettings().mode;
    const userStreamSettings = this.outputSettingsService.getStreamingSettings('horizontal');
    const userEncoderSettings = this.outputSettingsService.getStreamingVideoEncoderSettings(mode);
    const userAudioEncoder = this.outputSettingsService.getRecordingAudioEncoderSettings();
    const obsAdvancedSettings = this.settingsService.views.values.Advanced;

    const videoEncoder = VideoEncoderFactory.create(
      userStreamSettings.videoEncoder || 'obs_x264',
      'autoconfig-vencoder',
      userEncoderSettings,
    );
    const audioEncoder = AudioEncoderFactory.create(
      userAudioEncoder || 'ffmpeg_aac',
      'autoconfig-aencoder',
    );
    const service = ServiceFactory.create(
      'rtmp_common',
      'autoconfig-service',
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

    const stream = SimpleStreamingFactory.create();
    stream.video = this.videoSettingsService.contexts.horizontal;
    stream.videoEncoder = videoEncoder;
    stream.audioEncoder = audioEncoder;
    stream.service = service;
    stream.delay = delay;
    stream.reconnect = reconnect;
    stream.network = network;
    stream.enforceServiceBitrate = false; // override: see header comment

    // Simple-mode-only fields — `useAdvanced=true` lets `customEncSettings`
    // (the raw x264 opts string) flow into the simple x264 path. Mirroring
    // these makes the test encoder match the user's go-live behavior.
    if (mode === 'Simple') {
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
    }

    // Diagnostic-only signal handler. V2 autoconfig drives the test via
    // InitializeAutoConfig's progress callback; this hook just surfaces any
    // stream-level signals (e.g. start/stop/error) into our log so we can see
    // them if something unexpected happens during the test.
    stream.signalHandler = (signal: EOutputSignal) => {
      this.logDiag(`temp stream signal: type=${signal.type} signal=${signal.signal} code=${signal.code}` +
        (signal.error ? ` error=${signal.error}` : ''));
    };

    return { stream, service, videoEncoder, audioEncoder };
  }

  private disposeTempStream() {
    if (!this.tempStream) return;
    try { this.tempStream.stream.stop(true); } catch {}
    try { SimpleStreamingFactory.destroy(this.tempStream.stream); } catch {}
    try { ServiceFactory.destroy(this.tempStream.service); } catch {}
    try { this.tempStream.videoEncoder.release(); } catch {}
    try { this.tempStream.audioEncoder.release(); } catch {}
    this.tempStream = null;
  }

  private emit(progress: IConfigProgress) {
    this.configProgress.next(progress);
  }

  /**
   * Read what V2 autoconfig wrote into our temp encoder and persist it back to
   * the user's output settings. Without this, the chosen bitrate vanishes when
   * the temp encoder is released and the UI keeps showing the pre-test value.
   * Only `bitrate` is applied today — extend if logs show V2 mutating other
   * fields we care about.
   */
  private persistAutoConfigEncoderResults() {
    if (!this.chainMode || this.chainMode !== 'streaming') return;
    if (!this.tempStream) {
      this.logDiagError('no temp stream to read results from');
      return;
    }

    const beforeStreaming = this.outputSettingsService.getSettings().streaming;
    const newEncoderSettings = this.tempStream.videoEncoder.settings ?? {};
    const newAudioBitrate = this.tempStream.audioEncoder.bitrate;
    this.logDiag('V2 results to persist', {
      videoEncoderSettings: newEncoderSettings,
      audioEncoderBitrate: newAudioBitrate,
      beforeStreaming,
    });

    if (newEncoderSettings.bitrate != null && newEncoderSettings.bitrate !== beforeStreaming.bitrate) {
      this.outputSettingsService.setSettings({
        streaming: { bitrate: newEncoderSettings.bitrate },
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
      // V2 mutates the temp encoder we own (autoconfig-vencoder) — bitrate and
      // anything else applyResults touched live there until we release it. Read
      // those values back and persist BEFORE disposeTempStream() releases it,
      // otherwise the user's stored settings stay at whatever they were before.
      this.persistAutoConfigEncoderResults();

      // Video context: V2 mutates server-side OSN state directly; reads of
      // contexts[*].video are live IPC getters, so migrateAutoConfigSettings
      // reads fresh values. obs_set_video_info applies width/height live, but
      // FPS requires canvas destroy+recreate (handled inside the migration).
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
      this.disposeTempStream();
      obs.NodeObs.TerminateAutoConfig();
      this.chainMode = null;
    } else if (progress.event === 'error') {
      this.disposeTempStream();
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

    this.logDiag(progress.event, data);

    switch (progress.event) {
      case 'bandwidth_result':
        this.bandwidthResult.next(data as IBandwidthResult);
        break;
      case 'selection_decision':
        this.selectionDecision.next(data as ISelectionDecision);
        break;
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
