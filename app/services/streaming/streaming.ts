import * as Sentry from '@sentry/vue';
import * as electron from 'electron';
import moment from 'moment';
import { Subject } from 'rxjs';
import { Inject } from 'services/core/injector';
import { mutation, StatefulService } from 'services/core/stateful-service';
import Utils from 'services/utils';
import { CustomizationService } from 'services/customization';
import { $t } from 'services/i18n';
import { NicoliveCommentSynthesizerService } from 'services/nicolive-program/nicolive-comment-synthesizer';
import { NicoliveProgramService } from 'services/nicolive-program/nicolive-program';
import { isOk, NicoliveClient } from 'services/nicolive-program/NicoliveClient';
import { ENotificationType, INotification, NotificationsService } from 'services/notifications';
import { SettingsService } from 'services/settings';
import { EncoderType, OptimizedSettings } from 'services/settings/optimizer';
import { TUsageEvent, UsageStatisticsService } from 'services/usage-statistics';
import { UserService } from 'services/user';
import { WindowsService } from 'services/windows';
import * as obs from '../../../obs-api';
import { IStreamingSetting } from '../platforms';
import { extractPlatform } from './extractPlatform';
import {
  ERecordingState,
  EReplayBufferState,
  EStreamingState,
  IStreamingServiceApi,
  IStreamingServiceState,
} from './streaming-api';
import { CustomcastUsageService } from '../custom-cast-usage';

import { VideoSettingsService, TDisplayType } from 'services/settings-v2/video';
import { RtvcStateService } from '../../services/rtvcStateService';
import * as remote from '@electron/remote';

enum EOBSOutputType {
  Streaming = 'streaming',
  Recording = 'recording',
  ReplayBuffer = 'replay-buffer',
}

enum EOBSOutputSignal {
  Starting = 'starting',
  Start = 'start',
  Stopping = 'stopping',
  Stop = 'stop',
  Reconnect = 'reconnect',
  ReconnectSuccess = 'reconnect_success',
  Wrote = 'wrote',
  WriteError = 'writing_error',
}

interface IOBSOutputSignalInfo {
  type: EOBSOutputType;
  signal: EOBSOutputSignal;
  code: obs.EOutputCode;
  error: string;
}

export class StreamingService
  extends StatefulService<IStreamingServiceState>
  implements IStreamingServiceApi
{
  @Inject() settingsService: SettingsService;
  @Inject() userService: UserService;
  @Inject() windowsService: WindowsService;
  @Inject() usageStatisticsService: UsageStatisticsService;
  @Inject() customizationService: CustomizationService;
  @Inject() notificationsService: NotificationsService;
  @Inject() private nicoliveCommentSynthesizerService: NicoliveCommentSynthesizerService;
  @Inject() private nicoliveProgramService: NicoliveProgramService;
  @Inject() private videoSettingsService: VideoSettingsService;
  @Inject() private customcastUsageService: CustomcastUsageService;
  @Inject() private rtvcStateService: RtvcStateService;

  streamingStatusChange = new Subject<EStreamingState>();
  recordingStatusChange = new Subject<ERecordingState>();
  replayBufferStatusChange = new Subject<EReplayBufferState>();
  replayBufferFileWrite = new Subject<string>();

  client: NicoliveClient = new NicoliveClient();

  // Dummy subscription for stream deck
  streamingStateChange = new Subject<void>();

  powerSaveId: number;

  static initialState: IStreamingServiceState = {
    programFetching: false,
    streamingStatus: EStreamingState.Offline,
    streamingStatusTime: new Date().toISOString(),
    recordingStatus: ERecordingState.Offline,
    recordingStatusTime: new Date().toISOString(),
    replayBufferStatus: EReplayBufferState.Offline,
    replayBufferStatusTime: new Date().toISOString(),
    streamingTrackId: '',
  };

  init() {
    super.init();

    try {
      Sentry.addBreadcrumb({
        category: 'obs',
        message: 'OBS_service_connectOutputSignals',
      });
      obs.NodeObs.OBS_service_connectOutputSignals((info: IOBSOutputSignalInfo) => {
        this.handleOBSOutputSignal(info);
      });
    } catch (e) {
      Sentry.withScope(scope => {
        scope.setLevel('error');
        scope.setTag('service', 'StreamingService');
        scope.setTag('method', 'init');
        scope.setFingerprint(['StreamingService', 'init', 'obs', 'exception']);
        Sentry.captureException(e);
      });
    }
  }

  getModel() {
    return this.state;
  }

  get isStreaming() {
    return this.state.streamingStatus !== EStreamingState.Offline;
  }

  get isRecording() {
    return this.state.recordingStatus !== ERecordingState.Offline;
  }

  /**
   * @deprecated Use toggleStreaming instead
   */
  startStreaming() {
    this.toggleStreaming();
  }

  /**
   * @deprecated Use toggleStreaming instead
   */
  stopStreaming() {
    this.toggleStreaming();
  }

  private async showNotBroadcastingMessageBox() {
    Sentry.addBreadcrumb({
      category: 'streaming',
      message: 'showNotBroadcastingMessageBox',
    });
    return new Promise(resolve => {
      remote.dialog
        .showMessageBox(remote.getCurrentWindow(), {
          title: $t('streaming.notBroadcasting'),
          type: 'warning',
          message: $t('streaming.notBroadcastingMessage'),
          buttons: [$t('common.close')],
          noLink: true,
        })
        .then(({ response: done }) => resolve(done));
    });
  }

  /**
   * 配信開始ボタンまたはショートカットキーによる配信開始(対話可能)
   *
   * 現在ログインされているユーザーで、配信可能なチャンネルが存在する場合には、配信番組選択ウィンドウを開きます。
   *
   * 配信番組選択ウィンドウで「配信開始」ボタンを押した時にもこのメソッドが呼ばれ、
   * options.nicoliveProgramSelectorResult に、ウィンドウで選ばれた配信種別と
   * チャンネル番組の場合は番組IDが与えられます。
   *
   * 配信番組選択ウィンドウからの呼び出しの場合、および現在ログインされているユーザーで
   * 配信可能なチャンネルが存在しない場合には、配信開始を試みます。
   */
  async toggleStreamingAsync(
    options: {
      nicoliveProgramSelectorResult?: {
        providerType: 'channel' | 'user';
        channelProgramId?: string;
      };
      mustShowOptimizationDialog?: boolean;
    } = {},
  ) {
    const opts = Object.assign(
      {
        mustShowOptimizationDialog: false,
      },
      options,
    );

    if (this.isStreaming) {
      this.toggleStreaming();
      return;
    }

    console.log('Start Streaming button: platform=' + JSON.stringify(this.userService.platform));
    if (this.userService.isNiconicoLoggedIn()) {
      try {
        this.SET_PROGRAM_FETCHING(true);
        const broadcastableUserProgram = await this.client.fetchOnairUserProgram();

        // 配信番組選択ウィンドウ以外からの呼び出し時
        if (!opts.nicoliveProgramSelectorResult) {
          const broadcastableChannelsResult = await this.client.fetchOnairChannels();

          // 配信可能チャンネルがある時
          // エラー時は チャンネルがない時と同様の挙動とする
          if (isOk(broadcastableChannelsResult) && broadcastableChannelsResult.value.length > 0) {
            this.windowsService.showWindow({
              title: $t('streaming.nicoliveProgramSelector.title'),
              componentName: 'NicoliveProgramSelector',
              size: {
                width: 800,
                height: 800,
              },
            });
            return;
          }

          // 配信可能チャンネルがなく、配信できるユーザー生放送もない場合
          if (!broadcastableUserProgram.programId && !broadcastableUserProgram.nextProgramId) {
            return this.showNotBroadcastingMessageBox();
          }
        }

        // 配信番組選択ウィンドウでチャンネル番組が選ばれた時はそのチャンネル番組を, それ以外の場合は放送中のユーザー番組のIDを代入
        // ユーザー番組については、即時番組があればそれを優先し、なければ予約番組の番組IDを採用する。
        const programId =
          opts.nicoliveProgramSelectorResult &&
          opts.nicoliveProgramSelectorResult.providerType === 'channel' &&
          opts.nicoliveProgramSelectorResult.channelProgramId
            ? opts.nicoliveProgramSelectorResult.channelProgramId
            : broadcastableUserProgram.programId || broadcastableUserProgram.nextProgramId;

        // 配信番組選択ウィンドウでユーザー番組を選んだが、配信可能なユーザー番組がない場合
        if (!programId) {
          return this.showNotBroadcastingMessageBox();
        }

        const setting = await this.userService.updateStreamSettings(programId);
        const streamKey = setting.key;
        if (streamKey === '') {
          return this.showNotBroadcastingMessageBox();
        }

        // [番組情報を取得]してニコ生パネルを更新する
        try {
          // ここまで来ている段階で配信情報は揃っていて、
          // この fetchProgram はニコ生パネルの情報更新だけを目的に呼んでいる
          await this.nicoliveProgramService.fetchProgram();
        } catch (e) {
          // 例外が発生するのはチャンネル配信をしようとしてユーザー生番組が見つからないケースであり
          // チャンネルのためにそのまま配信開始を続行する
          Sentry.withScope(scope => {
            scope.setLevel('info');
            scope.setTag('service', 'StreamingService');
            scope.setTag('method', 'fetchProgram');
            scope.setFingerprint(['StreamingService', 'fetchProgram', 'niconico', 'exception']);
            Sentry.captureException(e);
          });
        }

        if (this.customizationService.optimizeForNiconico) {
          return this.optimizeForNiconicoAndStartStreaming(
            setting,
            opts.mustShowOptimizationDialog,
          );
        }
      } catch (e) {
        Sentry.withScope(scope => {
          scope.setLevel('error');
          scope.setTag('service', 'StreamingService');
          scope.setTag('method', 'toggleStreamingAsync');
          scope.setFingerprint([
            'StreamingService',
            'toggleStreamingAsync',
            'niconico',
            'exception',
          ]);
          Sentry.captureException(e);
        });
        let message: string;
        if (e instanceof Response) {
          if (e.status === 401) {
            message = $t('streaming.invalidSessionError');
          } else {
            message = $t('streaming.broadcastStatusFetchingError.httpError', {
              requestURL: e.url,
              statusText: e.statusText,
            });
          }
        } else {
          message = $t('streaming.broadcastStatusFetchingError.default');
        }

        return new Promise(resolve => {
          remote.dialog
            .showMessageBox(remote.getCurrentWindow(), {
              type: 'warning',
              message,
              buttons: [$t('common.close')],
              noLink: true,
            })
            .then(({ response: done }) => resolve(done));
        });
      } finally {
        this.SET_PROGRAM_FETCHING(false);
      }
    }
    this.toggleStreaming();
  }

  toggleStreaming() {
    if (this.state.streamingStatus === EStreamingState.Offline) {
      const shouldConfirm = this.settingsService.state.General.WarnBeforeStartingStream;
      const confirmText = $t('streaming.startStreamingConfirm');

      if (shouldConfirm && !confirm(confirmText)) return;

      this.powerSaveId = remote.powerSaveBlocker.start('prevent-display-sleep');
      try {
        Sentry.addBreadcrumb({
          category: 'obs',
          message: 'OBS_service_startStreaming',
        });
        const horizontalContext = this.videoSettingsService.contexts.horizontal;
        obs.NodeObs.OBS_service_setVideoInfo(horizontalContext, 'horizontal');
        obs.NodeObs.OBS_service_startStreaming();
      } catch (e) {
        Sentry.withScope(scope => {
          scope.setLevel('error');
          scope.setTag('service', 'StreamingService');
          scope.setTag('method', 'toggleStreaming');
          scope.setFingerprint(['StreamingService', 'startStreaming', 'obs', 'exception']);
          Sentry.captureException(e);
        });
      }
      return;
    }

    if (
      this.state.streamingStatus === EStreamingState.Starting ||
      this.state.streamingStatus === EStreamingState.Live ||
      this.state.streamingStatus === EStreamingState.Reconnecting
    ) {
      const shouldConfirm = this.settingsService.state.General.WarnBeforeStoppingStream;
      const confirmText = $t('streaming.stopStreamingConfirm');

      if (shouldConfirm && !confirm(confirmText)) return;

      if (this.powerSaveId) {
        remote.powerSaveBlocker.stop(this.powerSaveId);
      }

      try {
        Sentry.addBreadcrumb({
          category: 'obs',
          message: `OBS_service_stopStreaming(false) from ${this.state.streamingStatus}`,
        });
        obs.NodeObs.OBS_service_stopStreaming(false);
      } catch (e) {
        Sentry.withScope(scope => {
          scope.setLevel('error');
          scope.setTag('service', 'StreamingService');
          scope.setTag('method', 'toggleStreaming');
          scope.setFingerprint(['StreamingService', 'stopStreaming', 'obs', 'exception']);
          Sentry.captureException(e);
        });
        return;
      }

      const keepRecording = this.settingsService.state.General.KeepRecordingWhenStreamStops;
      if (!keepRecording && this.state.recordingStatus === ERecordingState.Recording) {
        this.toggleRecording();
      }

      const keepReplaying = this.settingsService.state.General.KeepReplayBufferStreamStops;
      if (!keepReplaying && this.state.replayBufferStatus === EReplayBufferState.Running) {
        this.stopReplayBuffer();
      }
      return;
    }

    if (this.state.streamingStatus === EStreamingState.Ending) {
      try {
        Sentry.addBreadcrumb({
          category: 'obs',
          message: `OBS_service_stopStreaming(true) from ${this.state.streamingStatus}`,
        });
        obs.NodeObs.OBS_service_stopStreaming(true);
      } catch (e) {
        Sentry.withScope(scope => {
          scope.setLevel('error');
          scope.setTag('service', 'StreamingService');
          scope.setTag('method', 'toggleStreaming');
          scope.setFingerprint(['StreamingService', 'stopStreaming', 'obs', 'exception']);
          Sentry.captureException(e);
        });
        return;
      }
      return;
    }
  }

  // 最適化ウィンドウの高さを計算する
  private calculateOptimizeWindowSize(settings: OptimizedSettings): number {
    const windowHeader = 6 + 20 + 1;
    const descriptionLabel = 22.4 + 12;
    const useHardwareCheck = 28 + 12;
    const doNotShowCheck = 28 + 12;
    const contentOverhead = 16;
    const modalControls = 8 + 36 + 8;
    const categoryOverhead = 22.4 + 4 + 8 + 8 + 12;
    const lineHeight = 20.8;

    const overhead =
      windowHeader +
      descriptionLabel +
      useHardwareCheck +
      doNotShowCheck +
      contentOverhead +
      modalControls;

    const numCategories = settings.info.length;
    const numLines = settings.info.reduce((sum, tuple) => sum + tuple[1].length, 0);
    const height = overhead + numCategories * categoryOverhead + numLines * lineHeight;
    return Math.floor(height); // floorしないと死ぬ
  }

  /**
   * ニコニコ生放送用設定最適化を行い、配信を開始する。この際、必要なら最適化ダイアログ表示を行う。
   * @param streamingSetting 番組の情報から得られる最適化の前提となる情報
   * @param mustShowDialog trueなら、設定に変更が必要ない場合や、最適化ダイアログを表示しない接敵のときであっても最適化ダイアログを表示する。
   */
  private async optimizeForNiconicoAndStartStreaming(
    streamingSetting: IStreamingSetting,
    mustShowDialog: boolean,
  ) {
    if (streamingSetting.quality === undefined) {
      Sentry.withScope(scope => {
        scope.setLevel('error');
        scope.setTag('service', 'StreamingService');
        scope.setTag('method', 'optimizeForNiconicoAndStartStreaming');
        scope.setFingerprint([
          'StreamingService',
          'optimizeForNiconicoAndStartStreaming',
          'niconico',
          'exception',
        ]);
        Sentry.captureException(new Error('StreamingSetting.quality is undefined'));
      });
      return new Promise(resolve => {
        remote.dialog
          .showMessageBox(remote.getCurrentWindow(), {
            title: $t('streaming.bitrateFetchingError.title'),
            type: 'warning',
            message: $t('streaming.bitrateFetchingError.message'),
            buttons: [$t('common.close')],
            noLink: true,
          })
          .then(({ response: done }) => resolve(done));
      });
    }
    const settings = this.settingsService.diffOptimizedSettings({
      bitrate: streamingSetting.quality.bitrate,
      height: streamingSetting.quality.height,
      fps: streamingSetting.quality.fps,
      useHardwareEncoder: this.customizationService.optimizeWithHardwareEncoder,
    });
    if (Object.keys(settings.delta).length > 0 || mustShowDialog) {
      if (this.customizationService.showOptimizationDialogForNiconico || mustShowDialog) {
        this.windowsService.showWindow({
          componentName: 'OptimizeForNiconico',
          title: $t('streaming.optimizationForNiconico.title'),
          queryParams: settings,
          size: {
            width: 600,
            height: 594, // なぜ {@link this.calculateOptimizeWindowSize()} を使っていない?
          },
        });
      } else {
        this.settingsService.optimizeForNiconico(settings.best);
        this.toggleStreaming();
      }
    } else {
      this.toggleStreaming();
    }
  }

  /**
   * @deprecated Use toggleRecording instead
   */
  startRecording() {
    this.toggleRecording();
  }

  /**
   * @deprecated Use toggleRecording instead
   */
  stopRecording() {
    this.toggleRecording();
  }

  toggleRecording() {
    if (this.state.recordingStatus === ERecordingState.Recording) {
      try {
        Sentry.addBreadcrumb({
          category: 'obs',
          message: 'OBS_service_stopRecording',
        });
        obs.NodeObs.OBS_service_stopRecording();
      } catch (e) {
        Sentry.withScope(scope => {
          scope.setLevel('error');
          scope.setTag('service', 'StreamingService');
          scope.setTag('method', 'toggleRecording');
          scope.setFingerprint(['StreamingService', 'stopRecording', 'obs', 'exception']);
          Sentry.captureException(e);
        });
      }
      return;
    }

    if (this.state.recordingStatus === ERecordingState.Offline) {
      if (this.userService.isNiconicoLoggedIn()) {
        const recordingSettings = this.settingsService.getRecordingSettings();
        if (recordingSettings) {
          // send Recording type to Sentry (どれぐらいURL出力が使われているかの比率を調査する)
          Sentry.withScope(scope => {
            scope.setLevel('info');
            scope.setTag('recType', recordingSettings.recType);
            scope.setExtra('path', recordingSettings.path);
            scope.setFingerprint(['Recording']);
            Sentry.captureMessage('Recording / recType:' + recordingSettings.recType);
          });
        }
      }

      try {
        Sentry.addBreadcrumb({
          category: 'obs',
          message: 'OBS_service_startRecording',
        });
        obs.NodeObs.OBS_service_startRecording();
      } catch (e) {
        Sentry.withScope(scope => {
          scope.setLevel('error');
          scope.setTag('service', 'StreamingService');
          scope.setTag('method', 'toggleRecording');
          scope.setFingerprint(['StreamingService', 'startRecording', 'obs', 'exception']);
          Sentry.captureException(e);
        });
      }
      return;
    }
  }

  startReplayBuffer() {
    if (this.state.replayBufferStatus !== EReplayBufferState.Offline) return;

    try {
      Sentry.addBreadcrumb({
        category: 'obs',
        message: 'OBS_service_startReplayBuffer',
      });
      obs.NodeObs.OBS_service_startReplayBuffer();
    } catch (e) {
      Sentry.withScope(scope => {
        scope.setLevel('error');
        scope.setTag('service', 'StreamingService');
        scope.setTag('method', 'startReplayBuffer');
        scope.setFingerprint(['StreamingService', 'startReplayBuffer', 'obs', 'exception']);
        Sentry.captureException(e);
      });
    }
  }

  stopReplayBuffer() {
    if (this.state.replayBufferStatus === EReplayBufferState.Running) {
      try {
        Sentry.addBreadcrumb({
          category: 'obs',
          message: 'OBS_service_stopReplayBuffer(false)',
        });
        obs.NodeObs.OBS_service_stopReplayBuffer(false);
      } catch (e) {
        Sentry.withScope(scope => {
          scope.setLevel('error');
          scope.setTag('service', 'StreamingService');
          scope.setTag('method', 'stopReplayBuffer');
          scope.setFingerprint([
            'StreamingService',
            'stopReplayBuffer(running)',
            'obs',
            'exception',
          ]);
          Sentry.captureException(e);
        });
      }
    } else if (this.state.replayBufferStatus === EReplayBufferState.Stopping) {
      try {
        Sentry.addBreadcrumb({
          category: 'obs',
          message: 'OBS_service_stopReplayBuffer(true)',
        });
        obs.NodeObs.OBS_service_stopReplayBuffer(true);
      } catch (e) {
        Sentry.withScope(scope => {
          scope.setLevel('error');
          scope.setTag('service', 'StreamingService');
          scope.setTag('method', 'stopReplayBuffer');
          scope.setFingerprint([
            'StreamingService',
            'stopReplayBuffer(stopping)',
            'obs',
            'exception',
          ]);
          Sentry.captureException(e);
        });
      }
    }
  }

  saveReplay() {
    if (this.state.replayBufferStatus === EReplayBufferState.Running) {
      this.SET_REPLAY_BUFFER_STATUS(EReplayBufferState.Saving);
      this.replayBufferStatusChange.next(EReplayBufferState.Saving);
      try {
        Sentry.addBreadcrumb({
          category: 'obs',
          message: 'OBS_service_processReplayBufferHotkey',
        });
        obs.NodeObs.OBS_service_processReplayBufferHotkey();
      } catch (e) {
        Sentry.withScope(scope => {
          scope.setLevel('error');
          scope.setTag('service', 'StreamingService');
          scope.setTag('method', 'saveReplay');
          scope.setFingerprint(['StreamingService', 'saveReplay', 'obs', 'exception']);
          Sentry.captureException(e);
        });
      }
    }
  }

  get delayEnabled() {
    return this.settingsService.state.Advanced.DelayEnable;
  }

  get delaySeconds() {
    return this.settingsService.state.Advanced.DelaySec;
  }

  get delaySecondsRemaining() {
    if (!this.delayEnabled) return 0;

    if (
      this.state.streamingStatus === EStreamingState.Starting ||
      this.state.streamingStatus === EStreamingState.Ending
    ) {
      const elapsedTime = moment().unix() - this.streamingStateChangeTime.unix();
      return Math.max(this.delaySeconds - elapsedTime, 0);
    }

    return 0;
  }

  /**
   * Gives a formatted time that the streaming output has been in
   * its current state.
   */
  get formattedDurationInCurrentStreamingState() {
    return this.formattedDurationSince(this.streamingStateChangeTime);
  }

  get streamingStateChangeTime() {
    return moment(this.state.streamingStatusTime);
  }

  private sendReconnectingNotification() {
    const msg = $t('streaming.attemptingToReconnect');
    const existingReconnectNotif = this.notificationsService
      .getUnread()
      .filter((notice: INotification) => notice.message === msg);
    if (existingReconnectNotif.length !== 0) return;
    this.notificationsService.push({
      type: ENotificationType.WARNING,
      lifeTime: -1,
      showTime: true,
      message: $t('streaming.attemptingToReconnect'),
    });
  }

  private clearReconnectingNotification() {
    const notice = this.notificationsService
      .getAll()
      .find((notice: INotification) => notice.message === $t('streaming.attemptingToReconnect'));
    if (!notice) return;
    this.notificationsService.markAsRead(notice.id);
  }

  private formattedDurationSince(timestamp: moment.Moment) {
    const duration = moment.duration(moment().diff(timestamp));
    const seconds = duration.seconds().toString().padStart(2, '0');
    const minutes = duration.minutes().toString().padStart(2, '0');
    const dayHours = duration.days() * 24;
    const hours = (dayHours + duration.hours()).toString().padStart(2, '0');

    return `${hours}:${minutes}:${seconds}`;
  }

  private logStreamStart() {
    const streamingTrackId = this.usageStatisticsService.generateStreamingTrackID();
    this.SET_STREAMING_TRACK_ID(streamingTrackId);
    this.actionLog('stream_start', streamingTrackId);
    this.customcastUsageService.startStreaming();
    this.rtvcStateService.startStreaming();
  }

  private logStreamEnd() {
    const streamingTrackId = this.state.streamingTrackId;
    this.SET_STREAMING_TRACK_ID('');
    this.actionLog('stream_end', streamingTrackId);
    this.customcastUsageService.stopStreaming();
    this.rtvcStateService.stopStreaming();
  }

  private actionLog(eventType: 'stream_start' | 'stream_end', streamingTrackId: string) {
    const settings = this.settingsService.getStreamEncoderSettings();

    const event: TUsageEvent = {
      event: eventType,
      platform: extractPlatform(settings.streamingURL),
      stream_track_id: streamingTrackId,
      content_id: this.nicoliveProgramService.state.programID || null,
      output_mode: settings.outputMode,
      video: {
        base_resolution: settings.baseResolution,
        output_resolution: settings.outputResolution,
        bitrate: settings.bitrate,
        fps: settings.fps,
      },
      audio: {
        bitrate: Number(settings.audio.bitrate),
        sample_rate: settings.audio.sampleRate,
      },
      advanced:
        settings.outputMode === 'Advanced'
          ? {
              rate_control: settings.audio.rateControl,
              profile: settings.profile,
            }
          : undefined,
      encoder: {
        encoder_type: settings.encoder as unknown as EncoderType,
        preset: settings.preset,
      },
      auto_optimize: {
        enabled: this.customizationService.optimizeForNiconico,
        use_hardware_encoder: this.customizationService.optimizeWithHardwareEncoder,
      },
      yomiage: {
        enabled: this.nicoliveCommentSynthesizerService.enabled,
        pitch: this.nicoliveCommentSynthesizerService.pitch,
        rate: this.nicoliveCommentSynthesizerService.rate,
        volume: this.nicoliveCommentSynthesizerService.volume,
        max_seconds: this.nicoliveCommentSynthesizerService.maxTime,
        engine: {
          normal: this.nicoliveCommentSynthesizerService.normal,
          operator: this.nicoliveCommentSynthesizerService.operator,
          system: this.nicoliveCommentSynthesizerService.system,
        },
      },
      compact_mode: {
        auto_compact_mode: this.customizationService.state.autoCompactMode,
        current: this.customizationService.state.compactMode,
      },
      rtvc: eventType === 'stream_end' ? this.rtvcStateService.eventLog : {},
    };

    this.usageStatisticsService.recordEvent(event);
  }

  private outputErrorOpen = false;

  private handleOBSOutputSignal(info: IOBSOutputSignalInfo) {
    console.debug('OBS Output signal: ', info);

    const time = new Date().toISOString();

    if (info.type === EOBSOutputType.Streaming) {
      const time = new Date().toISOString();

      if (info.signal === EOBSOutputSignal.Start) {
        this.SET_STREAMING_STATUS(EStreamingState.Live, time);
        this.streamingStatusChange.next(EStreamingState.Live);

        const recordWhenStreaming = this.settingsService.state.General.RecordWhenStreaming;
        if (recordWhenStreaming && this.state.recordingStatus === ERecordingState.Offline) {
          this.toggleRecording();
        }

        const replayWhenStreaming = this.settingsService.state.General.ReplayBufferWhileStreaming;

        if (replayWhenStreaming && this.state.replayBufferStatus === EReplayBufferState.Offline) {
          this.startReplayBuffer();
        }

        this.logStreamStart();
      } else if (info.signal === EOBSOutputSignal.Starting) {
        this.SET_STREAMING_STATUS(EStreamingState.Starting, time);
        this.streamingStatusChange.next(EStreamingState.Starting);
      } else if (info.signal === EOBSOutputSignal.Stop) {
        this.SET_STREAMING_STATUS(EStreamingState.Offline, time);
        this.streamingStatusChange.next(EStreamingState.Offline);
      } else if (info.signal === EOBSOutputSignal.Stopping) {
        this.SET_STREAMING_STATUS(EStreamingState.Ending, time);
        this.streamingStatusChange.next(EStreamingState.Ending);
        this.logStreamEnd();
      } else if (info.signal === EOBSOutputSignal.Reconnect) {
        this.SET_STREAMING_STATUS(EStreamingState.Reconnecting);
        this.streamingStatusChange.next(EStreamingState.Reconnecting);
        this.sendReconnectingNotification();
      } else if (info.signal === EOBSOutputSignal.ReconnectSuccess) {
        this.SET_STREAMING_STATUS(EStreamingState.Live);
        this.streamingStatusChange.next(EStreamingState.Live);
        this.clearReconnectingNotification();
      }
    } else if (info.type === EOBSOutputType.Recording) {
      const nextState: ERecordingState = {
        [EOBSOutputSignal.Start]: ERecordingState.Recording,
        [EOBSOutputSignal.Starting]: ERecordingState.Starting,
        [EOBSOutputSignal.Stop]: ERecordingState.Offline,
        [EOBSOutputSignal.Stopping]: ERecordingState.Stopping,
      }[info.signal as any];

      if (nextState) {
        this.SET_RECORDING_STATUS(nextState, time);
        this.recordingStatusChange.next(nextState);
      }
    } else if (info.type === EOBSOutputType.ReplayBuffer) {
      const nextState: EReplayBufferState = {
        [EOBSOutputSignal.Start]: EReplayBufferState.Running,
        [EOBSOutputSignal.Stopping]: EReplayBufferState.Stopping,
        [EOBSOutputSignal.Stop]: EReplayBufferState.Offline,
        [EOBSOutputSignal.Wrote]: EReplayBufferState.Running,
        [EOBSOutputSignal.WriteError]: EReplayBufferState.Running,
      }[info.signal as any];

      if (nextState) {
        this.SET_REPLAY_BUFFER_STATUS(nextState, time);
        this.replayBufferStatusChange.next(nextState);
      }

      if (info.signal === EOBSOutputSignal.Wrote) {
        this.replayBufferFileWrite.next(obs.NodeObs.OBS_service_getLastReplay());
      }
    }

    if (info.code) {
      if (this.outputErrorOpen) {
        console.warn('Not showing error message because existing window is open.', info);
        return;
      }

      let errorText = '';

      if (info.code === obs.EOutputCode.BadPath) {
        errorText = $t('streaming.badPathError');
      } else if (info.code === obs.EOutputCode.ConnectFailed) {
        errorText = $t('streaming.connectFailedError');
      } else if (info.code === obs.EOutputCode.Disconnected) {
        errorText = $t('streaming.disconnectedError');
      } else if (info.code === obs.EOutputCode.InvalidStream) {
        errorText = $t('streaming.invalidStreamError');
      } else if (info.code === obs.EOutputCode.NoSpace) {
        errorText = $t('streaming.noSpaceError');
      } else if (info.code === obs.EOutputCode.Unsupported) {
        errorText = $t('streaming.unsupportedError');
      } else if (info.code === obs.EOutputCode.OutdatedDriver) {
        errorText = $t('streaming.outdatedDriverError');
      } else {
        // obs.EOutputCode.Error
        // -4 is used for generic unknown messages in OBS. Both -4 and any other code
        // we don't recognize should fall into this branch and show a generic error.
        errorText = $t('streaming.error') + info.error;
      }

      const title = {
        [EOBSOutputType.Streaming]: $t('streaming.streamingError'),
        [EOBSOutputType.Recording]: $t('streaming.recordingError'),
        [EOBSOutputType.ReplayBuffer]: $t('streaming.replayBufferError'),
      }[info.type];

      this.outputErrorOpen = true;
      (async () => {
        try {
          await remote.dialog.showMessageBox(Utils.getMainWindow(), {
            buttons: ['OK'],
            title,
            type: 'error',
            message: errorText,
          });
        } finally {
          this.outputErrorOpen = false;
        }
      })();
    }
  }

  @mutation()
  private SET_PROGRAM_FETCHING(status: boolean) {
    this.state.programFetching = status;
  }

  @mutation()
  private SET_STREAMING_STATUS(status: EStreamingState, time?: string) {
    this.state.streamingStatus = status;
    if (time) this.state.streamingStatusTime = time;
  }

  @mutation()
  private SET_RECORDING_STATUS(status: ERecordingState, time: string) {
    this.state.recordingStatus = status;
    this.state.recordingStatusTime = time;
  }

  @mutation()
  private SET_REPLAY_BUFFER_STATUS(status: EReplayBufferState, time?: string) {
    this.state.replayBufferStatus = status;
    if (time) this.state.replayBufferStatusTime = time;
  }

  @mutation()
  private SET_STREAMING_TRACK_ID(id: string) {
    this.state.streamingTrackId = id;
  }
}
