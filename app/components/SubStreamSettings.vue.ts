import * as remote from '@electron/remote';
import { Inject } from 'services/core/injector';
import { $t } from 'services/i18n';
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

  collapsed: boolean = true;

  use: boolean = SubStreamService.defaultState.use;
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

  defautServers: { [key: string]: { url: string; stream_key_link: string } } = {
    youtube: {
      url: 'rtmp://a.rtmp.youtube.com/live2',
      stream_key_link: 'https://www.youtube.com/live_dashboard',
    },
    twitch: {
      url: 'rtmp://live-tyo.twitch.tv/app',
      stream_key_link: 'https://dashboard.twitch.tv/settings/stream',
    },
  };

  @Watch('use')
  onUseChange() {
    this.subStreamService.setState({ use: this.use });
    if (!this.use) {
      this.subStreamService.stop();
    }
  }

  @Watch('url')
  onUrlChange() {
    this.subStreamService.setState({ url: this.url });
  }

  @Watch('key')
  onKeyChange() {
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
    this.use = this.subStreamService.state.use;
    this.url = this.subStreamService.state.url;
    this.key = this.subStreamService.state.key;
    this.videoBitrate = this.subStreamService.state.videoBitrate;
    this.audioBitrate = this.subStreamService.state.audioBitrate;
    this.sync = this.subStreamService.state.sync;

    const r = await this.subStreamService.enumEncoderTypes();
    if (r.encoders) {
      this.videoCodecs = r.encoders.video
        .filter(v => !/h265|hevc|fallback_amf|qsv11_soft/.test(v.id))
        .map(v => ({
          id: v.id,
          name: `${v.name}`,
        }));

      this.videoCodec = this.videoCodecs.find(
        v => v.id === this.subStreamService.state.videoCodec,
      ) ?? { id: 'obs_x264', name: 'obs_x264' };

      this.audioCodecs = r.encoders.audio.map(v => ({
        id: v.id,
        name: `${v.name}`,
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

  openExternalLink(url: string) {
    remote.shell.openExternal(url);
  }

  async checkStatus() {
    const r = await this.subStreamService.getStatus();

    const statusParts: string[] = [];
    statusParts.push(`${$t('settings.substream.info.status')}: ${r.displayStatus}`);
    if (r.frames) statusParts.push(`${$t('settings.substream.info.frames')}: ${r.frames}`);
    if (r.dropped) statusParts.push(`${$t('settings.substream.info.dropped')}: ${r.dropped}`);

    this.status =
      statusParts.length > 0 ? statusParts.join('\n') : $t('settings.substream.info.stopped');
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
    const message = await this.subStreamService.start();
    if (message) {
      remote.dialog.showErrorBox('Error', message);
    }
  }

  async stop() {
    await this.subStreamService.stop();
  }
}
