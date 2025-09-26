import TsxComponent from 'components/tsx-component';
import { Component } from 'vue-property-decorator';
import ModalLayout from '../ModalLayout.vue';
import { Display } from 'components/shared/ReactComponentList';
import { WindowsService } from 'services/windows';
import { Inject } from 'services';
import Utils from 'services/utils';
import { SourcesService } from 'services/sources';
import { byOS, OS } from 'util/operating-systems';

@Component({})
export default class BrowserSourceInteraction extends TsxComponent<{}> {
  @Inject() windowsService: WindowsService;
  @Inject() sourcesService: SourcesService;

  $refs: {
    eventDiv: HTMLDivElement;
  };

  get sourceId() {
    const windowId = Utils.getCurrentUrlParams().windowId;
    return this.windowsService.getWindowOptions(windowId).sourceId;
  }

  get source() {
    return this.sourcesService.views.getSource(this.sourceId);
  }

  currentRegion: IRectangle = { x: 0, y: 0, width: 1, height: 1 };

  onOutputResize(region: IRectangle) {
    this.currentRegion = region;
    this.source.sendFocus(true);
  }

  eventLocationInSourceSpace(e: MouseEvent): IVec2 {
    const factor = byOS({ [OS.Windows]: this.windowsService.state.child.scaleFactor, [OS.Mac]: 1 });

    return {
      x:
        ((e.offsetX * factor - this.currentRegion.x) / this.currentRegion.width) *
        this.source.width,
      y:
        ((e.offsetY * factor - this.currentRegion.y) / this.currentRegion.height) *
        this.source.height,
    };
  }

  onWheel(e: WheelEvent) {
    this.source.mouseWheel(this.eventLocationInSourceSpace(e), {
      x: e.deltaX,
      y: e.deltaY,
    });
  }

  onMousedown(e: MouseEvent) {
    this.source.mouseClick(e.button, this.eventLocationInSourceSpace(e), false);
  }

  onMouseup(e: MouseEvent) {
    this.source.mouseClick(e.button, this.eventLocationInSourceSpace(e), true);
  }

  onMousemove(e: MouseEvent) {
    const pos = this.eventLocationInSourceSpace(e);

    if (pos.x < 0 || pos.y < 0) return;

    this.source.mouseMove(pos);
  }

  onKeydown(e: KeyboardEvent) {
    if (this.isModifierPress(e)) return;

    this.source.keyInput(e.key, e.keyCode, false, this.getModifiers(e));
  }

  onKeyup(e: KeyboardEvent) {
    if (this.isModifierPress(e)) return;

    this.source.keyInput(e.key, e.keyCode, true, this.getModifiers(e));
  }

  isModifierPress(event: KeyboardEvent) {
    return (
      event.key === 'Control' ||
      event.key === 'Alt' ||
      event.key === 'Meta' ||
      event.key === 'Shift'
    );
  }

  getModifiers(e: KeyboardEvent) {
    return {
      alt: e.altKey,
      ctrl: e.ctrlKey,
      shift: e.shiftKey,
    };
  }

  mounted() {
    // Allows keyboard events to be immediately captured
    this.$refs.eventDiv.focus();
  }

  render() {
    return (
      <ModalLayout showControls={false} contentStyles={{ padding: '0px' }}>
        <div
          slot="content"
          onWheel={this.onWheel}
          onMousedown={this.onMousedown}
          onMouseup={this.onMouseup}
          onMousemove={this.onMousemove}
          onKeydown={this.onKeydown}
          onKeyup={this.onKeyup}
          tabindex="0"
          style={{ outline: 'none', height: '100%' }}
          ref="eventDiv"
        >
          <Display
            componentProps={{
              sourceId: this.sourceId,
              onOutputResize: (rect: IRectangle) => this.onOutputResize(rect),
            }}
          />
        </div>
      </ModalLayout>
    );
  }
}
