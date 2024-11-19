import { CompactModeService } from 'services/compact-mode';
import { Inject } from 'services/core/injector';
import { $t } from 'services/i18n';
import { NavigationService } from 'services/navigation';
import { SettingsService } from 'services/settings';
import { EStreamingState, StreamingService } from 'services/streaming';
import Vue from 'vue';
import { Component, Prop, Watch } from 'vue-property-decorator';
import StartStreamingIcon from '../../media/images/start-streaming-icon.svg';
import { WindowsService } from '../services/windows';
import { EDismissable } from 'services/dismissables';
import { NicoliveProgramService } from 'services/nicolive-program/nicolive-program';
import HelpTip from './shared/HelpTip.vue';

@Component({
  components: {
    StartStreamingIcon,
    HelpTip,
  },
})
export default class StartStreamingButton extends Vue {
  @Inject() streamingService: StreamingService;
  @Inject() navigationService: NavigationService;
  @Inject() settingsService: SettingsService;
  @Inject() windowsService: WindowsService;
  @Inject() compactModeService: CompactModeService;
  @Inject() nicoliveProgramService: NicoliveProgramService;

  @Prop() disabled: boolean;

  toggleStreaming() {
    if (this.streamingService.isStreaming) {
      this.streamingService.toggleStreaming();
      return;
    }

    this.streamingService.toggleStreamingAsync();
  }

  get isCompactMode() {
    return this.compactModeService.isCompactMode;
  }

  get streamingStatus() {
    return this.streamingService.state.streamingStatus;
  }

  get programFetching() {
    return this.streamingService.state.programFetching;
  }

  getStreamButtonLabel() {
    if (this.programFetching) {
      return $t('streaming.programFetching');
    }

    if (this.streamingStatus === EStreamingState.Live) {
      return $t('streaming.endStream');
    }

    if (this.streamingStatus === EStreamingState.Starting) {
      if (this.streamingService.delayEnabled) {
        return $t('streaming.startingWithDelay', {
          delaySeconds: this.streamingService.delaySecondsRemaining,
        });
      }

      return $t('streaming.starting');
    }

    if (this.streamingStatus === EStreamingState.Ending) {
      if (this.streamingService.delayEnabled) {
        return $t('streaming.endingWithDelay', {
          delaySeconds: this.streamingService.delaySecondsRemaining,
        });
      }

      return $t('streaming.ending');
    }

    if (this.streamingStatus === EStreamingState.Reconnecting) {
      return $t('streaming.reconnecting');
    }

    return $t('streaming.goLive');
  }

  get isStreaming() {
    return this.streamingService.isStreaming;
  }

  get isDisabled() {
    return (
      this.disabled ||
      this.programFetching ||
      (this.streamingStatus === EStreamingState.Starting &&
        this.streamingService.delaySecondsRemaining === 0) ||
      (this.streamingStatus === EStreamingState.Ending &&
        this.streamingService.delaySecondsRemaining === 0)
    );
  }

  @Watch('streamingStatus')
  setDelayUpdate() {
    this.$forceUpdate();

    if (this.streamingService.delaySecondsRemaining) {
      setTimeout(() => this.setDelayUpdate(), 100);
    }
  }

  goLiveTooltip = $t('streaming.goLiveTooltip');
  endStreamTooltip = $t('streaming.endStreamTooltip');

  get endStreamHelpTipDismissable() {
    return EDismissable.EndStreamHelpTip;
  }
  get showEndStreamHelpTip(): boolean {
    if (this.streamingStatus === EStreamingState.Offline) {
      // ニコ生番組が放送中で、配信は停止している
      if (
        this.nicoliveProgramService.state.status === 'onAir' ||
        this.nicoliveProgramService.state.status === 'test'
      ) {
        return true;
      }
    }
    return false;
  }
}
