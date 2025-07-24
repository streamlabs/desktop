import { mutation, StatefulService } from 'services/core/stateful-service';
import { Command } from './commands/command';
import * as commands from './commands';
import { CombinableCommand } from './commands/combinable-command';
import { shortcut } from 'services/shortcuts';
import { SelectionService } from 'services/selection';
import { Inject } from 'services/core/injector';
import { ENudgeDirection } from './commands/nudge-items';
import { SceneCollectionsService } from 'services/scene-collections';
import Utils from 'services/utils';
import { BehaviorSubject } from 'rxjs';
import { UsageStatisticsService } from 'services/usage-statistics';
import * as remote from '@electron/remote';

const COMMANDS = { ...commands };

const COMBINE_TIMEOUT = 500;

// Tha maximum number of undo actions to store
const MAX_HISTORY_SIZE = 500;

interface ICommandMetadata {
  description: string;
}

interface IEditorCommandsServiceState {
  undoMetadata: ICommandMetadata[];
  redoMetadata: ICommandMetadata[];
  operationInProgress: boolean;
}

export class EditorCommandsService extends StatefulService<IEditorCommandsServiceState> {
  @Inject() private selectionService: SelectionService;
  @Inject() private sceneCollectionsService: SceneCollectionsService;
  @Inject() private usageStatisticsService: UsageStatisticsService;

  static initialState: IEditorCommandsServiceState = {
    undoMetadata: [],
    redoMetadata: [],
    operationInProgress: false,
  };

  // IMPORTANT: Must be kept in sync with metadata stored in
  // this service's vuex state.
  undoHistory: Command[] = [];
  redoHistory: Command[] = [];

  undoHistorySize = new BehaviorSubject<{ undoLength: number; redoLength: number }>({
    undoLength: 0,
    redoLength: 0,
  });

  combineActive = false;

  combineTimeout: number;

  init() {
    this.sceneCollectionsService.collectionWillSwitch.subscribe(() => this.clear());
  }

  private setCombineTimeout() {
    this.combineActive = true;

    if (this.combineTimeout) clearTimeout(this.combineTimeout);

    this.combineTimeout = window.setTimeout(() => {
      this.combineActive = false;
      this.combineTimeout = null;
    }, COMBINE_TIMEOUT);
  }

  executeCommand<TCommand extends keyof typeof COMMANDS>(
    commandType: TCommand,
    // eslint-disable-next-line prettier/prettier
    ...commandArgs: ConstructorParameters<typeof COMMANDS[TCommand]>
  ): // eslint-disable-next-line prettier/prettier
  ReturnType<InstanceType<typeof COMMANDS[TCommand]>['execute']> {
    // Executing any command clears out the redo history, since we are
    // creating a new branch in the timeline.
    this.redoHistory = [];
    this.updateUndoHistoryLength();
    this.CLEAR_REDO_METADATA();

    const instance: Command = new (COMMANDS[commandType] as any)(...commandArgs);
    const ret = instance.execute();

    if (ret instanceof Promise) {
      this.SET_OPERATION_IN_PROGRESS(true);
      ret.then(() => this.SET_OPERATION_IN_PROGRESS(false));
    }

    if (instance instanceof CombinableCommand) {
      if (this.combineActive) {
        const previousCommand = this.undoHistory[this.undoHistory.length - 1];
        if (
          previousCommand.constructor === instance.constructor &&
          previousCommand instanceof CombinableCommand &&
          previousCommand.shouldCombine(instance)
        ) {
          previousCommand.combine(instance);
          this.setCombineTimeout();
          return;
        }
      }

      this.setCombineTimeout();
    }

    this.undoHistory.push(instance);
    this.updateUndoHistoryLength();
    this.PUSH_UNDO_METADATA({ description: instance.description });

    if (this.undoHistory.length > MAX_HISTORY_SIZE) {
      this.undoHistory.shift();
      this.updateUndoHistoryLength();
      this.SHIFT_UNDO_METADATA();
    }

    return ret;
  }

  @shortcut('Ctrl+Z')
  undo() {
    if (this.state.operationInProgress || this.undoHistory.length < 1) return;

    this.usageStatisticsService.recordFeatureUsage('Undo');

    const command = this.undoHistory.pop();
    this.updateUndoHistoryLength();
    this.POP_UNDO_METADATA();

    if (command) {
      let ret: any;

      try {
        ret = command.rollback();
      } catch (e: unknown) {
        this.handleUndoRedoError(true, e);
        return;
      }

      if (ret instanceof Promise) {
        this.SET_OPERATION_IN_PROGRESS(true);
        ret
          .then(() => this.SET_OPERATION_IN_PROGRESS(false))
          .catch(e => {
            this.SET_OPERATION_IN_PROGRESS(false);
            this.handleUndoRedoError(true, e);
          });
      }

      this.redoHistory.push(command);
      this.updateUndoHistoryLength();
      this.PUSH_REDO_METADATA({ description: command.description });
    }
  }

  @shortcut('Ctrl+Y')
  redo() {
    if (this.state.operationInProgress) return;

    const command = this.redoHistory.pop();
    this.updateUndoHistoryLength();
    this.POP_REDO_METADATA();

    if (command) {
      let ret: any;

      try {
        ret = command.execute();
      } catch (e: unknown) {
        this.handleUndoRedoError(false, e);
        return;
      }

      if (ret instanceof Promise) {
        this.SET_OPERATION_IN_PROGRESS(true);
        ret
          .then(() => this.SET_OPERATION_IN_PROGRESS(false))
          .catch(e => {
            this.SET_OPERATION_IN_PROGRESS(false);
            this.handleUndoRedoError(false, e);
          });
      }

      this.undoHistory.push(command);
      this.updateUndoHistoryLength();
      this.PUSH_UNDO_METADATA({ description: command.description });
    }
  }

  private handleUndoRedoError(undo: boolean, e: any) {
    console.error(`Error performing ${undo ? 'undo' : 'redo'} operation`, e);
    remote.dialog.showMessageBox(Utils.getMainWindow(), {
      title: 'Error',
      message: `An error occurred while ${undo ? 'undoing' : 'redoing'} the operation.`,
      type: 'error',
    });
    this.clear();
  }

  /**
   * Clears the undo and redo histories entirely
   */
  private clear() {
    this.undoHistory = [];
    this.redoHistory = [];
    this.updateUndoHistoryLength();
    this.CLEAR_UNDO_METADATA();
    this.CLEAR_REDO_METADATA();
  }

  get nextUndo() {
    return this.state.undoMetadata[this.state.undoMetadata.length - 1];
  }

  get nextUndoDescription() {
    return this.nextUndo ? this.nextUndo.description : '';
  }

  get nextRedo() {
    return this.state.redoMetadata[this.state.redoMetadata.length - 1];
  }

  get nextRedoDescription() {
    return this.nextRedo ? this.nextRedo.description : '';
  }

  // Shortcuts for undo-able editor commands go here:
  @shortcut('ArrowLeft')
  nudgeActiveItemsLeft() {
    this.nudgeActiveItems(ENudgeDirection.Left);
  }

  @shortcut('ArrowRight')
  nudgeActiveItemsRight() {
    this.nudgeActiveItems(ENudgeDirection.Right);
  }

  @shortcut('ArrowUp')
  nudgeActiveItemsUp() {
    this.nudgeActiveItems(ENudgeDirection.Up);
  }

  @shortcut('ArrowDown')
  nudgeActiveItemsDown() {
    this.nudgeActiveItems(ENudgeDirection.Down);
  }

  private nudgeActiveItems(direction: ENudgeDirection) {
    const selection = this.selectionService.views.globalSelection;

    if (!selection.getNodes().length) return;
    if (selection.isAnyLocked()) return;

    this.executeCommand('NudgeItemsCommand', selection, direction);
  }

  private updateUndoHistoryLength() {
    this.undoHistorySize.next({
      undoLength: this.undoHistory.length,
      redoLength: this.redoHistory.length,
    });
  }

  @mutation()
  private PUSH_UNDO_METADATA(undo: ICommandMetadata) {
    this.state.undoMetadata.push(undo);
  }

  @mutation()
  private POP_UNDO_METADATA() {
    this.state.undoMetadata.pop();
  }

  @mutation()
  private CLEAR_UNDO_METADATA() {
    this.state.undoMetadata = [];
  }

  @mutation()
  private SHIFT_UNDO_METADATA() {
    this.state.undoMetadata.shift();
  }

  @mutation()
  private PUSH_REDO_METADATA(redo: ICommandMetadata) {
    this.state.redoMetadata.push(redo);
  }

  @mutation()
  private POP_REDO_METADATA() {
    this.state.redoMetadata.pop();
  }

  @mutation()
  private CLEAR_REDO_METADATA() {
    this.state.redoMetadata = [];
  }

  @mutation()
  private SET_OPERATION_IN_PROGRESS(val: boolean) {
    this.state.operationInProgress = val;
  }
}
