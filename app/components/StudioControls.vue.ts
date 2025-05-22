import { CompactModeService } from 'services/compact-mode';
import { Inject } from 'services/core/injector';
import { CustomizationService } from 'services/customization';
import { SceneCollectionsService } from 'services/scene-collections';
import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import ControlsArrow from '../../media/images/controls-arrow.svg';
import Mixer from './Mixer.vue';
import SceneSelector from './SceneSelector.vue';
import SourceSelector from './SourceSelector.vue';

@Component({
  components: {
    SceneSelector,
    SourceSelector,
    Mixer,
    ControlsArrow,
  },
})
export default class StudioControls extends Vue {
  @Inject() customizationService: CustomizationService;
  @Inject() compactModeService: CompactModeService;
  @Inject() sceneCollectionsService: SceneCollectionsService;

  get opened() {
    return this.customizationService.studioControlsOpened;
  }

  get isCompactMode() {
    return this.compactModeService.isCompactMode;
  }
  get compactModeStudioController() {
    return this.compactModeService.compactModeStudioController;
  }
  set compactModeStudioController(controller: 'scenes' | 'mixer') {
    this.compactModeService.compactModeStudioController = controller;
  }
  get activeCollection() {
    return this.sceneCollectionsService.activeCollection;
  }

  onToggleControls() {
    this.customizationService.toggleStudioControls();
  }

  //-------------------------------------------------
  // ドラッグ操作によるコントロール高さ変更
  private isDragging = false;
  private startY = 0;
  currentHeight = CustomizationService.defaultState.studioControlsHeight;

  mounted() {
    this.currentHeight = this.clampHeight(this.customizationService.state.studioControlsHeight);
  }

  clampHeight(h: number) {
    if (h <= 0) return CustomizationService.defaultState.studioControlsHeight; // default height
    const minHeight = 40;
    const maxHeight = window.innerHeight - 200;
    return Math.min(maxHeight, Math.max(minHeight, h));
  }

  onDragStart(e: MouseEvent) {
    this.isDragging = true;
    this.startY = e.clientY;
    document.addEventListener('mousemove', this.onDrag);
    document.addEventListener('mouseup', this.onDragEnd);
  }

  onDrag(e: MouseEvent) {
    if (!this.isDragging) return;
    const deltaY = this.startY - e.clientY;
    this.currentHeight = this.clampHeight(this.currentHeight + deltaY);
    this.startY = e.clientY;
  }

  onDragEnd() {
    this.isDragging = false;
    document.removeEventListener('mousemove', this.onDrag);
    document.removeEventListener('mouseup', this.onDragEnd);
    this.customizationService.setStudioControlsHeight(this.currentHeight);
  }
}
