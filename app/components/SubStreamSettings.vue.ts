import { Inject } from 'services/core/injector';
import { SubStreamService } from 'services/substream/SubStreamService';
import Vue from 'vue';
import Multiselect from 'vue-multiselect';
import { Component, Watch } from 'vue-property-decorator';

@Component({
  components: {
    Multiselect,
  },
})
export default class SubStreamSettings extends Vue {
  @Inject() subStreamService: SubStreamService;

  url: string = SubStreamService.defaultState.url;
  key: string = SubStreamService.defaultState.key;

  videoBitrate: number = SubStreamService.defaultState.videoBitrate;
  videoCodec: { id: string; name: string } = { id: '', name: '' };
  videoCodecs: { id: string; name: string }[] = [];

  audioBitrate: number = SubStreamService.defaultState.audioBitrate;
  audioCodec: { id: string; name: string } = { id: '', name: '' };
  audioCodecs: { id: string; name: string }[] = [];

  sync: boolean = SubStreamService.defaultState.sync;

  status: string = '';
  showKey: boolean = false;
  showUrlTips: boolean = false;

  checker?: number = undefined;

  defaultYoutubeUrl: string = 'rtmp://a.rtmp.youtube.com/live2';
  defaultTwitchUrl: string = 'rtmp://live-tyo.twitch.tv/app';

  @Watch('url')
  onStreamUrlChange() {
    this.subStreamService.setState({ url: this.url });
  }

  @Watch('key')
  onStreamKeyChange() {
    this.subStreamService.setState({ key: this.key });
  }

  @Watch('videoBitrate')
  onVideoBitrateChange() {
    this.subStreamService.setState({ videoBitrate: Number(this.videoBitrate) });
  }

  @Watch('videoCodec')
  onVideoCodecChange() {
    this.subStreamService.setState({ videoCodec: this.videoCodec.id });
  }

  @Watch('audioBitrate')
  onAudioBitrateChange() {
    this.subStreamService.setState({ audioBitrate: Number(this.audioBitrate) });
  }

  @Watch('audioCodec')
  onAudioCodecChange() {
    this.subStreamService.setState({ audioCodec: this.audioCodec.id });
  }

  @Watch('sync')
  onSyncChange() {
    this.subStreamService.setState({ sync: this.sync });
  }

  async mounted() {
    this.url = this.subStreamService.state.url;
    this.key = this.subStreamService.state.key;
    this.videoBitrate = this.subStreamService.state.videoBitrate;
    this.audioBitrate = this.subStreamService.state.audioBitrate;
    this.sync = this.subStreamService.state.sync;

    const r = await this.subStreamService.enumEncoderTypes();
    if (r.encoders) {
      this.videoCodecs = r.encoders.video.map(v => ({
        id: v.id,
        name: `${v.name} [${v.id}]`,
      }));

      this.videoCodec = this.videoCodecs.find(
        v => v.id === this.subStreamService.state.videoCodec,
      ) ?? { id: 'obs_x264', name: 'obs_x264' };

      this.audioCodecs = r.encoders.audio.map(v => ({
        id: v.id,
        name: `${v.name} [${v.id}]`,
      }));

      this.audioCodec = this.audioCodecs.find(
        v => v.id === this.subStreamService.state.audioCodec,
      ) ?? { id: 'ffmpeg_aac', name: 'ffmpeg_aac' };

      this.startChecker();
    }
  }

  beforeDestroy() {
    this.stopChecker();
  }

  async checkStatus() {
    const r = await this.subStreamService.status();
    // console.log(JSON.stringify(r, null, 2)); // Removed debug log

    if (r.status === undefined) {
      this.status = 'エラー: 接続されていません';
      return;
    }

    const statusMap: { [name: string]: string } = {
      starting: '配信開始処理中..',
      started: '配信中',
      stopping: '停止処理中..',
      stopped: '停止中',
      reconnect: '再接続...',
      reconnected: '再接続',
      deactive: '停止中',
    };

    const statusParts: string[] = [];
    if (r.error) statusParts.push(`エラー: ${r.error}`);
    statusParts.push(`ステータス: ${statusMap[r.status] ?? r.status}`);
    if (r.frames) statusParts.push(`送出フレーム数: ${r.frames}`);
    if (r.dropped) statusParts.push(`ドロップ数: ${r.dropped}`);

    this.status = statusParts.length > 0 ? statusParts.join('\n') : '停止中';
  }

  startChecker() {
    this.checkStatus();
    if (this.checker) return;
    this.checker = window.setInterval(() => this.checkStatus(), 1000);
  }

  stopChecker() {
    if (!this.checker) return;
    window.clearInterval(this.checker);
    this.checker = undefined;
  }

  async start() {
    await this.subStreamService.start();
  }

  async stop() {
    await this.subStreamService.stop();
  }
}
