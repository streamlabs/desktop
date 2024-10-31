import EditableSceneCollection from 'components/EditableSceneCollection.vue';
import ModalLayout from 'components/ModalLayout.vue';
import Fuse from 'fuse.js';
import { Inject } from 'services/core/injector';
import { SceneCollectionsService } from 'services/scene-collections';
import { WindowsService } from 'services/windows';
import Vue from 'vue';
import { Component } from 'vue-property-decorator';

@Component({
  components: {
    ModalLayout,
    EditableSceneCollection,
  },
})
export default class ManageSceneCollections extends Vue {
  @Inject() windowsService: WindowsService;
  @Inject() sceneCollectionsService: SceneCollectionsService;

  searchQuery = '';

  close() {
    this.sceneCollectionsService.stateService.flushManifestFile();
    this.windowsService.closeChildWindow();
  }

  create() {
    this.sceneCollectionsService.create({ needsRename: true });
  }

  get collections() {
    const list = this.sceneCollectionsService.collections;

    if (this.searchQuery) {
      const fuse = new Fuse(list, {
        shouldSort: true,
        keys: ['name'],
      });

      return fuse.search(this.searchQuery);
    }

    return list;
  }
}
