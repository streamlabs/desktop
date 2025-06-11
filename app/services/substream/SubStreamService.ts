import { sleep } from '../../util/sleep';
import { PersistentStatefulService } from '../core/persistent-stateful-service';
import { mutation } from '../core/stateful-service';
import { $t } from '../i18n';
import { NamedPipeClient } from './NamedPipeClient';

type Primitive = string | number | boolean;

/** サブストリームの設定状態を表すインターフェース */
interface ISubStreamState {
  use: boolean;
  url: string;
  key: string;
  videoBitrate: number;
  audioBitrate: number;
  videoCodec: string;
  audioCodec: string;
  sync: boolean;
}

/** エンコーダータイプの列挙結果を表すインターフェース */
interface EnumEncoderTypesResult {
  encoders: {
    video: { id: string; name: string }[];
    audio: { id: string; name: string }[];
  };
}

/** ストリーム開始パラメータを表すインターフェース */
export interface StartParam {
  videoId: string;
  audioId: string;
  output: { [name: string]: Primitive };
  service: { key: string; server: string; [name: string]: Primitive };
  video: { bitrate: number; [name: string]: Primitive };
  audio: { bitrate: number; [name: string]: Primitive };
}

/** サブストリームの状態値を表す型 */
export declare type SubStreamStatusValue =
  | 'stopped'
  | 'stopping'
  | 'started'
  | 'starting'
  | 'reconnect'
  | 'reconnected'
  | 'deactive'
  | 'unknown';

/** サブストリームのステータスを表すインターフェース */
export interface SubStreamStatus {
  active: boolean;
  status: SubStreamStatusValue;
  error: string;
  busy: boolean;
  streaming: boolean;
  duration?: number;
  connectTime?: number;
  bytes?: number;
  frames?: number;
  congestion?: number;
  dropped?: number;
  displayStatus: string;
}

/**
 * サブストリーム配信機能を管理するサービスクラス
 * 名前付きパイプを使用して外部プロセスと通信し、サブストリームの制御を行う
 */
export class SubStreamService extends PersistentStatefulService<ISubStreamState> {
  client = new NamedPipeClient('\\\\.\\pipe\\NAirSubstream');

  static defaultState: ISubStreamState = {
    use: false,
    url: '',
    key: '',
    videoBitrate: 2500,
    audioBitrate: 128,
    videoCodec: 'h264',
    audioCodec: 'aac',
    sync: false,
  };

  isExecutingCommand = false; // コマンド実行中フラグ

  @mutation()
  private SET_STATE(nextState: ISubStreamState) {
    this.state = nextState;
  }

  setState(param: Partial<ISubStreamState>) {
    const nextState = { ...this.state, ...param };
    this.SET_STATE(nextState);
  }

  /**
   * サブストリームの配信を開始する
   * 設定されたURLとキーを使用して配信を開始する
   */
  async start(): Promise<string | undefined> {
    if (!this.state) this.setState(SubStreamService.defaultState);
    if (!this.state.use) return;
    if (!this.state.url.startsWith('rtmp') || !this.state.key)
      return $t('settings.substream.error.url_key');

    const bitRange = (value: any, min: number, max: number): number =>
      Math.max(min, Math.min(Math.floor(Number(value)), max));

    const param: StartParam = {
      videoId: this.state.videoCodec, //'obs_x264',
      audioId: this.state.audioCodec, //'ffmpeg_aac',
      output: {
        low_latency_mode_enabled: true,
        // "bind_ip": "default",
        // "drop_threshold_ms": 700,
        // "max_shutdown_time_sec": 30,
        // "new_socket_loop_enabled": false,
        // "pframe_drop_threshold_ms": 900
      },
      service: {
        key: this.state.key,
        server: this.state.url,
        //  "use_auth": false
      },
      video: {
        bitrate: bitRange(this.state.videoBitrate, 200, 100000), // 2500
        keyint_sec: 0,
        // "bitrate": 2500,
        // "buffer_size": 2500,
        // "crf": 23,
        // "preset": "veryfast",
        // "profile": "",
        // "rate_control": "CBR",
        // "repeat_headers": false,
        // "tune": "",
        // "use_bufsize": false,
        // "x264opts": ""
      },
      audio: {
        bitrate: bitRange(this.state.audioBitrate, 64, 320), //128,
      },
    };

    // コマンドの連続実行防止
    if (this.isExecutingCommand) return;
    this.isExecutingCommand = true;
    if (await this.waitForStreamState(false)) await this.client.call('start', param);
    this.isExecutingCommand = false;
  }

  /**
   * サブストリームの配信を停止する
   */
  async stop(): Promise<void> {
    // 連投防止
    if (this.isExecutingCommand) return;
    this.isExecutingCommand = true;
    if (await this.waitForStreamState(true)) await this.client.call('stop');
    this.isExecutingCommand = false;
  }

  /**
   * 利用可能なエンコーダータイプの一覧を取得する
   */
  async enumEncoderTypes(): Promise<EnumEncoderTypesResult> {
    const encoderTypes = (await this.client.call('enumEncoderTypes')) as EnumEncoderTypesResult;
    return encoderTypes;
  }

  /**
   * 現在のストリームステータスを取得する
   */
  async getStatus(): Promise<SubStreamStatus> {
    const streamStatus = (await this.client.call('status')) as SubStreamStatus;
    if (!streamStatus)
      return {
        status: 'unknown',
        displayStatus: 'internal error',
        active: false,
        busy: false,
        streaming: false,
        error: 'not connected',
      };

    const statusMap: { [name: string]: string } = {
      starting: $t('settings.substream.status.starting'),
      started: $t('settings.substream.status.started'),
      stopping: $t('settings.substream.status.stopping'),
      stopped: $t('settings.substream.status.stopped'),
      reconnect: $t('settings.substream.status.reconnect'),
      reconnected: $t('settings.substream.status.reconnected'),
      deactive: $t('settings.substream.status.deactive'),
    };

    const errorMap: { [name: string]: string } = {
      'bad path': $t('settings.substream.error.bad_path'),
      'connect failed': $t('settings.substream.error.connect_failed'),
      'invalid stream': $t('settings.substream.error.invalid_stream'),
    };

    streamStatus.displayStatus =
      (statusMap[streamStatus.status] || '') +
      (streamStatus.error ? `: ${errorMap[streamStatus.error] || streamStatus.error}` : '');
    //console.log('status:', JSON.stringify(streamStatus));
    return streamStatus;
  }

  /**
   * サブストリームが準備完了状態になるまで待機する
   * @param streaming 待機する状態（true: ストリーミング中、false: 停止中）
   * @returns 指定された状態になったかどうか
   */
  private async waitForStreamState(streaming: boolean): Promise<boolean> {
    const timeoutAt = Date.now() + 30000; // 30秒タイムアウト
    let status = await this.getStatus();

    while (Date.now() < timeoutAt) {
      if (status && !status.busy) return status.streaming === streaming;
      await sleep(500); // 500ms待機
      status = await this.getStatus();
    }
    return false;
  }

  /**
   * 同期設定が有効な場合にサブストリーム配信を開始する
   * メインストリームと同期して使用される
   */
  async syncStart() {
    if (!this.state.sync) return;
    await this.start();
  }

  /**
   * 同期設定が有効な場合にサブストリーム配信を停止する
   * メインストリームと同期して使用される
   */
  async syncStop() {
    if (!this.state.sync) return;
    await this.stop();
  }
}
