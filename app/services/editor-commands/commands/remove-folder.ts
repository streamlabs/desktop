import { Command } from './command';
import { Inject } from 'services/core/injector';
import { ScenesService } from 'services/scenes';
import { SceneCollectionsService } from 'services/scene-collections';
import { $t } from 'services/i18n';

export class RemoveFolderCommand extends Command {
  @Inject() private scenesService: ScenesService;
  @Inject() private sceneCollectionsService: SceneCollectionsService;

  private name: string;
  private childrenIds: string[];
  private parentId: string;

  private verticalParentId: string;
  private verticalChildrenIds: string[];
  private verticalNodeIndex: number;

  constructor(
    private sceneId: string,
    private folderId: string,
    private dualOutputVerticalNodeId?: string,
  ) {
    super();
  }

  get description() {
    return $t('Remove %{folderName}', { folderName: this.name });
  }

  execute() {
    const scene = this.scenesService.views.getScene(this.sceneId);
    const folder = scene.getFolder(this.folderId);
    this.name = folder.name;
    this.childrenIds = folder.childrenIds;

    if (this.dualOutputVerticalNodeId) {
      const verticalFolder = scene.getFolder(this.dualOutputVerticalNodeId);

      this.verticalChildrenIds = verticalFolder.childrenIds;
      this.verticalParentId = verticalFolder.parentId;
      this.verticalNodeIndex = verticalFolder.getNodeIndex();

      // remove folders
      verticalFolder.ungroup();
      folder.ungroup();

      this.sceneCollectionsService.removeNodeMapEntry(this.sceneId, this.folderId);
    } else {
      folder.ungroup();
    }
  }

  rollback() {
    const scene = this.scenesService.views.getScene(this.sceneId);

    // Handle recreating the vertical folder for dual output scene collections
    if (this.dualOutputVerticalNodeId) {
      // create vertical folder
      const verticalFolder = scene.createFolder(this.name, {
        id: this.dualOutputVerticalNodeId,
        display: 'vertical',
      });

      // Restore node map entry
      this.sceneCollectionsService.createNodeMapEntry(
        this.sceneId,
        this.folderId,
        this.dualOutputVerticalNodeId,
      );

      // Place vertical folder in correct order
      const verticalFolderSelection = scene.getSelection(this.dualOutputVerticalNodeId);
      verticalFolderSelection.freeze();
      verticalFolderSelection.placeAfter(scene.getNodesIds()[this.verticalNodeIndex]);

      // Add vertical children back to vertical folder and set parent if needed
      scene.getSelection(this.verticalChildrenIds).setParent(this.dualOutputVerticalNodeId);
      if (this.verticalParentId) verticalFolder.setParent(this.verticalParentId);
    }

    // Handle recreating the horizontal folder
    const folder = scene.createFolder(this.name, { id: this.folderId, display: 'horizontal' });
    scene.getSelection(this.childrenIds).setParent(this.folderId);
    if (this.parentId) folder.setParent(this.parentId);
  }
}
