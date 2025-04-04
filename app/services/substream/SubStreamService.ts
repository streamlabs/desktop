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

  async start() {
    if (!this.state) this.setState(SubStreamService.defaultState);

    const bitRange = (a: any, min: number, max: number): number =>
      Math.max(min, Math.min(Math.floor(Number(a)), max));

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

    await this.client.call('start', param);
  }

  async stop() {
    await this.client.call('stop');
  }

  async enumEncoderTypes(): Promise<EnumEncoderTypesResult> {
    const result = (await this.client.call('enumEncoderTypes')) as EnumEncoderTypesResult;
    return result;
  }

  async status(): Promise<{ [name: string]: any }> {
    const result = await this.client.call('status');
    return result;
  }
}
