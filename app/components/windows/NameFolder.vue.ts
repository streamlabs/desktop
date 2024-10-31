import { $t } from 'services/i18n';
import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import { Inject } from '../../services/core/injector';
import { ScenesService } from '../../services/scenes';
import { WindowsService } from '../../services/windows';
import ModalLayout from '../ModalLayout.vue';

@Component({
  components: { ModalLayout },
})
export default class NameFolder extends Vue {
  @Inject() scenesService: ScenesService;
  @Inject() windowsService: WindowsService;

  options: {
    renameId?: string;
    itemsToGroup?: string[];
    parentId?: string;
    // @ts-expect-error: ts2729: use before initialization
  } = this.windowsService.getChildWindowQueryParams();

  name = '';
  error = '';

  mounted() {
    if (this.options.renameId) {
      this.name = this.scenesService.activeScene.getFolder(this.options.renameId).name;
    } else {
      this.name = this.scenesService.suggestName($t('sources.newFolderName'));
    }
  }

  submit() {
    if (!this.name) {
      this.error = $t('sources.sourceNameIsRequired');
    } else if (this.options.renameId) {
      const folder = this.scenesService.activeScene.getFolder(this.options.renameId);
      folder.setName(this.name);
      this.windowsService.closeChildWindow();
    } else {
      const scene = this.scenesService.activeScene;
      const newFolder = this.scenesService.activeScene.createFolder(this.name);

      if (this.options.itemsToGroup) {
        this.scenesService.activeScene
          .getSelection(this.options.itemsToGroup)
          .moveTo(scene.id, newFolder.id);
        if (this.options.parentId) {
          newFolder.setParent(this.options.parentId);
        }
      }
      newFolder.select();

      this.windowsService.closeChildWindow();
    }
  }
}
