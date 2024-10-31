import Display from 'components/shared/Display.vue';
import StudioControls from 'components/StudioControls.vue';
import StudioEditor from 'components/StudioEditor.vue';
import StudioModeControls from 'components/StudioModeControls.vue';
import { CompactModeService } from 'services/compact-mode';
import { Inject } from 'services/core/injector';
import { CustomizationService } from 'services/customization';
import { ScenesService } from 'services/scenes';
import { TransitionsService } from 'services/transitions';
import Vue from 'vue';
import { Component } from 'vue-property-decorator';

@Component({
  components: {
    StudioEditor,
    StudioControls,
    Display,
    StudioModeControls,
  },
})
export default class Studio extends Vue {
  @Inject() private customizationService: CustomizationService;
  @Inject() private compactModeService: CompactModeService;
  @Inject() private transitionsService: TransitionsService;
  @Inject() private scenesService: ScenesService;

  $refs: {
    studioModeContainer: HTMLDivElement;
  };

  stacked = false;

  sizeCheckInterval: number;

  mounted() {
    this.sizeCheckInterval = window.setInterval(() => {
      if (this.studioMode && this.$refs.studioModeContainer) {
        const rect = this.$refs.studioModeContainer.getBoundingClientRect();

        if (rect.width / rect.height > 16 / 9) {
          this.stacked = false;
        } else {
          this.stacked = true;
        }
      }
    }, 1000);
  }

  destroyed() {
    clearInterval(this.sizeCheckInterval);
  }

  get previewEnabled() {
    return !this.customizationService.state.performanceMode;
  }

  get studioMode() {
    return this.transitionsService.state.studioMode;
  }

  studioModeTransition() {
    this.transitionsService.executeStudioModeTransition();
  }

  enablePreview() {
    this.customizationService.setSettings({ performanceMode: false });
  }

  get isCompactMode() {
    return this.compactModeService.isCompactMode;
  }
  get compactModeTab() {
    return this.compactModeService.compactModeTab;
  }
}
