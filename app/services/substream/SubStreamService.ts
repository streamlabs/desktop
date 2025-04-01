import { PersistentStatefulService } from '../core/persistent-stateful-service';
import { mutation } from '../core/stateful-service';
import { NamedPipeClient } from './NamedPipeClient';

export interface StateParam {
  aaa: string;
}

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
  //  output: {};
  service: { key: string; server: string };
  video: { bitrate: number };
  audio: { bitrate: number };
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
    this.state = { ...this.state, ...param };
    this.SET_STATE(this.state);
  }

  async start() {
    if (!this.state) this.setState(SubStreamService.defaultState);

    const param: StartParam = {
      videoId: this.state.videoCodec, //'obs_x264',
      audioId: this.state.audioCodec, //'ffmpeg_aac',
      service: {
        key: this.state.key,
        server: this.state.url,
      },
      video: {
        bitrate: Number(this.state.videoBitrate), // 2500
        // "bitrate": 2500,
        // "buffer_size": 2500,
        // "crf": 23,
        // "keyint_sec": 0,
        // "preset": "veryfast",
        // "profile": "",
        // "rate_control": "CBR",
        // "repeat_headers": false,
        // "tune": "",
        // "use_bufsize": false,
        // "x264opts": ""
      },
      audio: {
        bitrate: Number(this.state.audioBitrate), //128,
      },
      //   output:{
      //     "bind_ip": "default",
      //     "drop_threshold_ms": 700,
      //     "low_latency_mode_enabled": false,
      //     "max_shutdown_time_sec": 30,
      //     "new_socket_loop_enabled": false,
      //     "pframe_drop_threshold_ms": 900
      //   }
    };

    await this.client.call('start', param);
  }

  async stop() {
    await this.client.call('stop', {});
  }

  async enumEncoderTypes(): Promise<EnumEncoderTypesResult> {
    const result = await this.client.call('enumEncoderTypes', {});
    return result;
  }

  async status() {
    const result = await this.client.call('status', {});
    return result;
  }
}
