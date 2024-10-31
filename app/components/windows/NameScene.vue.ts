import { $t } from 'services/i18n';
import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import { Inject } from '../../services/core/injector';
import { ScenesService } from '../../services/scenes';
import { SelectionService } from '../../services/selection';
import { ISourcesServiceApi } from '../../services/sources';
import { WindowsService } from '../../services/windows';
import ModalLayout from '../ModalLayout.vue';

@Component({
  components: { ModalLayout },
})
export default class NameScene extends Vue {
  name = '';
  error = '';

  @Inject()
  scenesService: ScenesService;

  @Inject()
  sourcesService: ISourcesServiceApi;

  @Inject()
  windowsService: WindowsService;

  @Inject()
  selectionService: SelectionService;

  options: {
    sceneToDuplicate?: string; // id of scene
    rename?: string; // id of scene
    itemsToGroup?: string[];
    // @ts-expect-error: ts2729: use before initialization
  } = this.windowsService.getChildWindowQueryParams();

  mounted() {
    let name = '';

    if (this.options.rename) {
      name = this.scenesService.getScene(this.options.rename).name;
      this.name = name;
    } else if (this.options.sceneToDuplicate) {
      name = this.scenesService.getScene(this.options.sceneToDuplicate).name;
    } else if (this.options.itemsToGroup) {
      name = $t('scenes.newSceneGroupName', {
        activeSceneName: this.scenesService.activeScene.name,
      });
    } else {
      name = $t('scenes.newSceneName');
    }
    if (!this.options.rename) this.name = this.sourcesService.suggestName(name);
  }

  submit() {
    const activeScene = this.scenesService.activeScene;

    if (!this.name) {
      this.error = $t('scenes.nameIsRequired');
    } else if (this.options.rename) {
      this.scenesService.getScene(this.options.rename).setName(this.name);
      this.windowsService.closeChildWindow();
    } else {
      const newScene = this.scenesService.createScene(this.name, {
        duplicateSourcesFromScene: this.options.sceneToDuplicate,
      });
      if (this.options.itemsToGroup) {
        activeScene.getSelection(this.options.itemsToGroup).moveTo(newScene.id);
        const sceneItem = activeScene.addSource(newScene.id);
        this.selectionService.select(sceneItem.sceneItemId);
        sceneItem.setContentCrop();
      } else {
        newScene.makeActive();
      }
      this.windowsService.closeChildWindow();
    }
  }
}
