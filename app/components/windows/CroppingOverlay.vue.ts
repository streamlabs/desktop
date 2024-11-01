import { Inject } from 'services/core/injector';
import { ISourcesServiceApi } from 'services/sources';
import { MonitorCaptureCroppingService } from 'services/sources/monitor-capture-cropping';
import { WindowsService } from 'services/windows';
import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';

@Component({})
export default class CroppingOverlay extends Vue {
  @Prop() sourceId: string;
  @Inject() windowsService: WindowsService;
  @Inject() sourcesService: ISourcesServiceApi;
  @Inject() monitorCaptureCroppingService: MonitorCaptureCroppingService;

  isCropping: boolean = false;
  anchorPositionX: number = 0;
  anchorPositionY: number = 0;
  movingPositionX: number = 0;
  movingPositionY: number = 0;

  mounted() {
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        window.close();
      }
    });

    window.addEventListener('blur', e => {
      window.close();
    });
    window.focus();
  }

  get croppingArea() {
    return {
      top: Math.min(this.movingPositionY, this.anchorPositionY),
      left: Math.min(this.movingPositionX, this.anchorPositionX),
      width: Math.abs(this.movingPositionX - this.anchorPositionX),
      height: Math.abs(this.movingPositionY - this.anchorPositionY),
    };
  }

  get croppingAreaStyle() {
    const croppingArea = this.croppingArea;

    return {
      top: croppingArea.top + 'px',
      left: croppingArea.left + 'px',
      width: croppingArea.width + 'px',
      height: croppingArea.height + 'px',
    };
  }

  handleMouseDown(event: MouseEvent) {
    if (event.button !== 0) return;
    this.isCropping = true;

    const x = event.pageX;
    const y = event.pageY;

    this.anchorPositionX = x;
    this.anchorPositionY = y;
    this.movingPositionX = x;
    this.movingPositionY = y;
  }

  handleMouseMove(event: MouseEvent) {
    if (event.button !== 0) return;
    if (!this.isCropping) return;

    const x = event.pageX;
    const y = event.pageY;

    this.movingPositionX = x;
    this.movingPositionY = y;
  }

  handleMouseUp(event: MouseEvent) {
    if (event.button !== 0) return;
    if (!this.isCropping) return;

    this.monitorCaptureCroppingService.crop(this.croppingArea);

    this.isCropping = false;
    window.close();
  }
}
