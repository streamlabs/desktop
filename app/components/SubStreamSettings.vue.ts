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
    this.videoCodecs = r['encoders']['video'].map(v => ({ id: v.id, name: `${v.name} (${v.id})` }));

    this.videoCodec = this.videoCodecs.find(
      v => v.id === this.subStreamService.state.videoCodec,
    ) ?? { id: 'obs_x264', name: 'obs_x264' };

    this.audioCodecs = r['encoders']['audio'].map(v => ({ id: v.id, name: `${v.name} (${v.id})` }));
    this.audioCodec = this.audioCodecs.find(
      v => v.id === this.subStreamService.state.videoCodec,
    ) ?? { id: 'ffmpeg_aac', name: 'ffmpeg_aac' };

    this.startChecker();
  }

  beforeDestroy() {
    this.stopChecker();
  }

  checker?: number = undefined;

  async checkStatus() {
    const r = await this.subStreamService.status();
    this.status = JSON.stringify(r, null, 2);
  }

  startChecker() {
    this.checkStatus();
    if (this.checker !== undefined) return;
    this.checker = window.setInterval(() => this.checkStatus(), 1000);
  }

  stopChecker() {
    if (this.checker === undefined) return;
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
