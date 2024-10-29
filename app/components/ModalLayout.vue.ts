import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';
import { WindowsService } from 'services/windows';
import { CustomizationService } from 'services/customization';
import { Inject } from 'services/core/injector';
import { AppService } from 'services/app';

@Component({})
export default class ModalLayout extends Vue {
  contentStyle: Object = {};
  fixedStyle: Object = {};

  @Inject() customizationService: CustomizationService;
  @Inject() windowsService: WindowsService;
  @Inject() appService: AppService;

  // Whether the "cancel" and "done" controls should be
  // shown at the bottom of the modal.
  @Prop({ default: true, type: Boolean }) showControls: boolean;

  // If controls are shown, whether or not to show the
  // cancel button.
  @Prop({ default: true, type: Boolean }) showCancel: boolean;

  // Will be called when "done" is clicked if controls
  // are enabled
  @Prop() doneHandler: Function;

  // Will be called when "cancel" is clicked.  By default
  // this will just close the window.
  @Prop() cancelHandler: Function;

  // The height of the fixed section
  @Prop() fixedSectionHeight: number;

  /**
   * Set to true when using custom controls.
   * Custom controls go in the "controls" slot.
   */
  @Prop({ default: false, type: Boolean })
  customControls: boolean;

  /** Contentにpaddingを持たせない場合 */
  @Prop({ default: false, type: Boolean })
  bareContent: boolean;

  /* Contentをスクロールさせない場合 */
  @Prop({ default: false, type: Boolean })
  noScroll: boolean;

  created() {
    const fixedStyle = {
      height: (this.fixedSectionHeight || 0).toString() + 'px',
    };

    this.fixedStyle = fixedStyle;
  }

  cancel() {
    if (this.cancelHandler) {
      this.cancelHandler();
    } else {
      this.windowsService.closeChildWindow();
    }
  }

  done() {
    if (this.doneHandler) {
      this.doneHandler();
    } else {
      this.windowsService.closeChildWindow();
    }
  }

  get loading() {
    return this.appService.state.loading;
  }
}
