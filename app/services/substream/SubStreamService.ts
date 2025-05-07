import { PersistentStatefulService } from '../core/persistent-stateful-service';
import { mutation } from '../core/stateful-service';
import { NamedPipeClient } from './NamedPipeClient';

type Primitive = string | number | boolean;

interface ISubStreamState {
  url: string;
  key: string;
  videoBitrate: number;
  audioBitrate: number;
  videoCodec: string;
  audioCodec: string;
  sync: boolean;
}

interface EnumEncoderTypesResult {
  encoders: {
    video: { id: string; name: string }[];
    audio: { id: string; name: string }[];
  };
}

export interface StartParam {
  videoId: string;
  audioId: string;
  output: { [name: string]: Primitive };
  service: { key: string; server: string; [name: string]: Primitive };
  video: { bitrate: number; [name: string]: Primitive };
  audio: { bitrate: number; [name: string]: Primitive };
}

export declare type SubStreamStatusValue =
  | 'stopped'
  | 'stopping'
  | 'started'
  | 'starting'
  | 'reconnect'
  | 'reconnected'
  | 'deactive';

export interface SubStreamStatus {
  active: boolean;
  status: SubStreamStatusValue;
  error: string;
  duration?: number;
  connectTime?: number;
  bytes?: number;
  frames?: number;
  congestion?: number;
  dropped?: number;
}

export class SubStreamService extends PersistentStatefulService<ISubStreamState> {
  client = new NamedPipeClient('\\\\.\\pipe\\NAirSubstream');

  static defaultState: ISubStreamState = {
    url: '',
    key: '',
    videoBitrate: 2500,
    audioBitrate: 128,
    videoCodec: 'h264',
    audioCodec: 'aac',
    sync: false,
  };

  @mutation()
  private SET_STATE(nextState: ISubStreamState) {
    this.state = nextState;
  }

  setState(param: Partial<ISubStreamState>) {
    const nextState = { ...this.state, ...param };
    this.SET_STATE(nextState);
  }

  async start(): Promise<void> {
    if (!this.state) this.setState(SubStreamService.defaultState);
    if (!this.state.url.startsWith('rtmp') || !this.state.key) return;

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

    if (!(await this.waitForReady(['started', 'starting']))) return;
    await this.client.call('start', param);
  }

  async stop(): Promise<void> {
    if (!(await this.waitForReady(['stopped', 'stopping']))) return;
    await this.client.call('stop');
  }

  async enumEncoderTypes(): Promise<EnumEncoderTypesResult> {
    const encoderTypes = (await this.client.call('enumEncoderTypes')) as EnumEncoderTypesResult;
    return encoderTypes;
  }

  async status(): Promise<SubStreamStatus> {
    const streamStatus = await this.client.call('status');
    //console.log('status:', streamStatus);
    return streamStatus as SubStreamStatus;
  }

  async waitForReady(skipStates: SubStreamStatusValue[] = []): Promise<boolean> {
    const initialStatus = await this.status();
    if (skipStates.includes(initialStatus.status)) return false;

    const maxWaitTime = 30000; // 30秒
    const pollingInterval = 500;
    const timeoutAt = Date.now() + maxWaitTime;

    while (Date.now() < timeoutAt) {
      const currentStatus = await this.status();
      if (!['starting', 'stopping', 'reconnect'].includes(currentStatus.status)) return true;
      await new Promise(resolve => {
        setTimeout(resolve, pollingInterval);
      });
    }

    return false;
  }

  // ------
  async syncStart() {
    if (!this.state.sync) return;
    await this.start();
  }

  async syncStop() {
    if (!this.state.sync) return;
    await this.stop();
  }
}
