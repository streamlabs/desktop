import * as remote from '@electron/remote';
import { CompactModeService } from 'services/compact-mode';
import { Inject } from 'services/core/injector';
import { CustomizationService } from 'services/customization';
import { $t } from 'services/i18n';
import { StreamingService } from 'services/streaming';
import Utils from 'services/utils';
import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';

@Component({
  components: {},
})
export default class TitleBar extends Vue {
  @Inject() customizationService: CustomizationService;
  @Inject() streamingService: StreamingService;
  @Inject() compactModeService: CompactModeService;

  @Prop() title: string;
  @Prop() resizable: boolean;

  get isMinimizable() {
    return remote.getCurrentWindow().isMinimizable();
  }

  get isUnstable() {
    return Utils.isMainWindow() && Utils.isUnstable();
  }

  get isCompactMode() {
    return this.compactModeService.isCompactMode;
  }

  minimize() {
    remote.getCurrentWindow().minimize();
  }

  maximize() {
    const win = remote.getCurrentWindow();

    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }

  close() {
    if (Utils.isMainWindow() && this.streamingService.isStreaming) {
      if (!confirm($t('streaming.endStreamInStreamingConfirm'))) return;
    }

    remote.getCurrentWindow().close();
  }

  get isStreaming() {
    return this.streamingService.isStreaming;
  }
}
