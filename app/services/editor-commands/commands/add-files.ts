import { Command } from './command';
import { $t } from 'services/i18n';
import { CreateNewItemCommand } from './create-new-item';
import { Inject } from '../../core';
import { ScenesService, TSceneNode } from '../../scenes';
import { CreateFolderCommand } from './create-folder';
import { RemoveNodesCommand } from './remove-nodes';
import { DualOutputService } from 'services/dual-output';
import { EditorCommandsService } from 'services/editor-commands';

export class AddFilesCommand extends Command {
  @Inject() private scenesService: ScenesService;
  @Inject() private dualOutputService: DualOutputService;

  @Inject() private editorCommandsService: EditorCommandsService;

  private addNodesSubCommands: (CreateNewItemCommand | CreateFolderCommand)[];
  private removeNodesSubCommand: RemoveNodesCommand | null;

  constructor(private sceneId: string, private files: string[]) {
    super();
  }

  get description() {
    return $t('Add files');
  }

  execute() {
    if (
      this.dualOutputService.views.dualOutputMode &&
      this.editorCommandsService.state.operationInProgress
    ) {
      return;
    }

    const scene = this.scenesService.views.getScene(this.sceneId);

    // initial executing
    if (!this.addNodesSubCommands) {
      const currentItemsSelection = scene.getSelection().selectAll();
      this.files.map(file => scene.addFile(file));
      const addedNodes = currentItemsSelection.getInverted();
      // skip creating editor commands for the vertical nodes
      // because the editor command handles them when undoing/redoing
      this.addNodesSubCommands = addedNodes
        .filter(node => node?.display === 'horizontal')
        .map((node: TSceneNode) => {
          if (node.isItem()) {
            const source = node.getSource();
            const verticalNodeId = this.dualOutputService.views.getVerticalNodeId(node.id);
            return new CreateNewItemCommand(
              this.sceneId,
              source.name,
              source.type,
              source.getSettings(),
              {
                id: node.id,
                sourceAddOptions: { sourceId: source.sourceId },
              },
              verticalNodeId,
            );
          }
          return new CreateFolderCommand(this.sceneId, node.name);
        });
      // nothing was added if none of the files are a supported type
      this.removeNodesSubCommand = addedNodes.length
        ? new RemoveNodesCommand(scene.getSelection(addedNodes))
        : null;
    } else {
      // redo logic
      this.addNodesSubCommands.forEach(cmd => cmd.execute());
    }
  }

  async rollback() {
    await this.removeNodesSubCommand?.execute();
  }
}
