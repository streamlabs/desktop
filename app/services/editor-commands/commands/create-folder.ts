import { Command } from './command';
import { Selection } from 'services/selection';
import { Inject } from 'services/core/injector';
import { ScenesService, TSceneNode } from 'services/scenes';
import { ReorderNodesCommand, EPlaceType } from './reorder-nodes';
import { $t } from 'services/i18n';
import { DualOutputService } from 'services/dual-output';
import { SceneCollectionsService } from 'services/scene-collections';

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
      console.log('horizontal folder id ', this.folderId);
      console.log('horizontal folder index ', folder.getNodeIndex());

      // 1 get node index
      // 2 calculate vertical node index
      //   - get number of horizontal nodes
      //   - vertical index = folder index + number of horizontal nodes
      // 3 create vertical folder at calculated index

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
      const selection = scene.getSelection(this.verticalFolderId);
      selection.freeze();
      selection.placeAfter(scene.getNodesIds()[numHorizontalNodes]);

      // @@@ TODO: remove debug logs
      console.log(
        'scene model after reordering vertical folder ',
        JSON.stringify(
          scene.getModel().nodes.map(node => ({
            display: node.display,
            name: node.hasOwnProperty('name') ? (node as any).name : undefined,
            id: node.id,
            sceneNodeType: node.sceneNodeType,
            parentId: node.parentId,
            sourceId: node.hasOwnProperty('sourceId') ? (node as any).sourceId : undefined,
          })),
          null,
          2,
        ),
      );
    }

    if (this.items) {
      // if the scene has dual output nodes filter the nodes by display
      // and move them into their respective folders
      if (this.verticalFolderId) {
        const verticalSelection = scene.getSelection(
          this.items.getNodes().filter(n => n.display === 'vertical'),
        );
        verticalSelection.freeze();

        this.dualOutputMoveToFolderSubCommand = new ReorderNodesCommand(
          verticalSelection,
          this.verticalFolderId,
          EPlaceType.Inside,
        );
        this.dualOutputMoveToFolderSubCommand.execute();
      }

      this.moveToFolderSubCommand = new ReorderNodesCommand(
        this.items,
        folder.id,
        EPlaceType.Inside,
      );

      this.moveToFolderSubCommand.execute();
    }
  }

  rollback() {
    // rollback command
    if (this.moveToFolderSubCommand) this.moveToFolderSubCommand.rollback();
    console.log('rolled back horizontal move to folder command ', this.moveToFolderSubCommand);

    const scene = this.scenesService.views.getScene(this.sceneId);

    // remove vertical folder node and node map entry
    if (this.dualOutputService.views.hasNodeMap(this.sceneId)) {
      console.log(
        'rolled back vertical move to folder command ',
        this.dualOutputMoveToFolderSubCommand,
      );

      if (this.dualOutputMoveToFolderSubCommand) this.dualOutputMoveToFolderSubCommand.rollback();

      scene.removeFolder(this.verticalFolderId);
      console.log('removed vertical folder ', this.verticalFolderId);
      this.sceneCollectionsService.removeNodeMapEntry(this.folderId, this.sceneId);
    }

    // remove horizontal folder
    scene.removeFolder(this.folderId);
    console.log('removed horizontal folder ', this.folderId);
  }
}
