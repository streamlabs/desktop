import { Inject } from 'services/core/injector';
import { Display as OBSDisplay, VideoService } from 'services/video';
import { WindowsService } from 'services/windows';
import uuid from 'uuid/v4';
import Vue from 'vue';
import { Component, Prop, Watch } from 'vue-property-decorator';

@Component({})
export default class Display extends Vue {
  @Inject() videoService: VideoService;
  @Inject() windowsService: WindowsService;

  @Prop() sourceId: string;
  @Prop({ default: 0 }) paddingSize: number;
  @Prop({ default: false, type: Boolean }) drawUI: boolean;
  @Prop() renderingMode: number;
  @Prop() clickHandler: boolean;

  $refs: {
    display: HTMLElement;
  };

  display: OBSDisplay;

  mounted() {
    this.createDisplay();
  }

  onClickHandler(event: MouseEvent) {
    this.$emit('click', event);
  }

  createDisplay() {
    const displayId = uuid();
    this.display = new OBSDisplay(displayId, {
      sourceId: this.sourceId,
      paddingSize: this.paddingSize,
      renderingMode: this.renderingMode,
    });
    this.display.setShoulddrawUI(this.drawUI);

    this.display.onOutputResize(region => {
      this.$emit('outputResize', region);
    });

    this.display.trackElement(this.$refs.display);
  }

  destroyDisplay() {
    this.display.destroy();
  }

  @Watch('sourceId')
  changeSource() {
    this.updateDisplay();
  }

  updateDisplay() {
    this.destroyDisplay();
    this.createDisplay();
  }

  beforeDestroy() {
    this.destroyDisplay();
  }
}
