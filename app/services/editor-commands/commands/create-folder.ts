import { Command } from './command';
import { Selection } from 'services/selection';
import { Inject } from 'services/core/injector';
import { ScenesService } from 'services/scenes';
import { ReorderNodesCommand, EPlaceType } from './reorder-nodes';
import { $t } from 'services/i18n';
import { DualOutputService } from 'services/dual-output';
import { SceneCollectionsService } from 'services/scene-collections';
import partition from 'lodash/partition';

/**
 * Creates a folder
 *
 * @remarks
 * For vanilla scenes, create a folder and, if required, move items into folder.
 * For dual output scenes, it's more complicated because the vertical nodes
 * also need to be moved into a matching folder.
 *  1. create a folder for the horizontal display
 *  2. map over the selection (of horizontal nodes) to locate all the matching vertical nodes
 *  3. create a folder for the dual output nodes
 *  4. move the horizontal node selection into the horizontal folder
 *  5. move the vertical node selection into the vertical folder
 *  6. create a node map entry
 *
 * @param sceneId - The id of the scene
 * @param name - The name of the folder
 * @param items - Optional, a selection of items
 */
export class CreateFolderCommand extends Command {
  @Inject() private scenesService: ScenesService;
  @Inject() private dualOutputService: DualOutputService;
  @Inject() private sceneCollectionsService: SceneCollectionsService;

  private folderId: string;
  private moveToFolderSubCommand: ReorderNodesCommand;

  private verticalFolderId: string;
  private dualOutputMoveToFolderSubCommand: ReorderNodesCommand;

  constructor(private sceneId: string, private name: string, private items?: Selection) {
    super();
    if (this.items) this.items.freeze();
  }

  get description() {
    return $t('Create %{folderName}', { folderName: this.name });
  }

  execute() {
    const scene = this.scenesService.views.getScene(this.sceneId);
    const folder = scene.createFolder(this.name, { id: this.folderId, display: 'horizontal' });
    this.folderId = folder.id;

    // Handle vertical folder for dual output scene collections
    // Note: Check the existence of all scene node maps because the scene may not have a
    // node map created for it
    if (this.dualOutputService.views.hasSceneNodeMaps) {
      // create vertical folder
      const verticalFolder = scene.createFolder(this.name, {
        id: this.verticalFolderId,
        display: 'vertical',
      });
      this.verticalFolderId = verticalFolder.id;

      // add node map entry
      this.sceneCollectionsService.createNodeMapEntry(
        this.sceneId,
        this.folderId,
        this.verticalFolderId,
      );

      // place vertical folder correctly in node list
      const numHorizontalNodes = scene
        .getModel()
        .nodes.filter(node => node.display === 'horizontal').length;
      const verticalFolderSelection = scene.getSelection(this.verticalFolderId);
      verticalFolderSelection.freeze();
      verticalFolderSelection.placeAfter(scene.getNodesIds()[numHorizontalNodes]);
    }

    if (this.items) {
      // if the scene has dual output nodes filter the nodes by display
      // and move them into their respective folders
      if (this.verticalFolderId) {
        const selection = partition(this.items.getNodes(), n => n.display === 'vertical');
        const verticalSelection = scene.getSelection(selection[0]);
        const horizontalSelection = scene.getSelection(selection[1]);
        verticalSelection.freeze();
        horizontalSelection.freeze();

        // move vertical nodes
        this.dualOutputMoveToFolderSubCommand = new ReorderNodesCommand(
          verticalSelection,
          this.verticalFolderId,
          EPlaceType.Inside,
        );
        this.dualOutputMoveToFolderSubCommand.execute();

        // move horizontal nodes
        this.moveToFolderSubCommand = new ReorderNodesCommand(
          horizontalSelection,
          this.folderId,
          EPlaceType.Inside,
        );
        this.moveToFolderSubCommand.execute();
      } else {
        this.moveToFolderSubCommand = new ReorderNodesCommand(
          this.items,
          folder.id,
          EPlaceType.Inside,
        );

        this.moveToFolderSubCommand.execute();
      }
    }
  }

  rollback() {
    // rollback command
    if (this.moveToFolderSubCommand) this.moveToFolderSubCommand.rollback();
    const scene = this.scenesService.views.getScene(this.sceneId);

    // remove vertical folder node and node map entry
    if (this.dualOutputService.views.hasNodeMap(this.sceneId)) {
      if (this.dualOutputMoveToFolderSubCommand) this.dualOutputMoveToFolderSubCommand.rollback();

      scene.removeFolder(this.verticalFolderId);
      this.sceneCollectionsService.removeNodeMapEntry(this.sceneId, this.folderId);
    }

    // remove horizontal folder
    scene.removeFolder(this.folderId);
  }
}
