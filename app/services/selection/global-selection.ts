import { Selection } from './selection';
import { Inject, ServiceHelper } from 'services/core';
import { SelectionService, ISelectionState, TNodesList } from 'services/selection';
import { $t } from 'services/i18n';
import Utils from 'services/utils';
import { EditorCommandsService } from 'services/editor-commands';
import cloneDeep from 'lodash/cloneDeep';
import * as remote from '@electron/remote';

/**
 * A specific case of a selection that represents what
 * the user currently has selected in the UI. The primary
 * differences are that the state is backed by the Vuex
 * store in the SelectionService, and selecting items
 * actually selects them in OBS.
 */
@ServiceHelper('SelectionService')
export class GlobalSelection extends Selection {
  @Inject() selectionService: SelectionService;
  @Inject() editorCommandsService: EditorCommandsService;

  /**
   * Used to remember the state when this selection
   * was frozen.
   */
  frozenState: ISelectionState;
  frozenSceneId: string;

  protected get state() {
    return this.isFrozen ? this.frozenState : this.selectionService.state;
  }

  get sceneId() {
    return this.isFrozen ? this.frozenSceneId : this.scenesService.views.activeSceneId;
  }

  // Ensures compatibiltiy with parent class
  set sceneId(val: string) {}
  protected set state(val: ISelectionState) {}

  constructor() {
    super(null);
  }

  freeze() {
    this.frozenState = cloneDeep(this.state);
    this.frozenSceneId = this.sceneId;
    super.freeze();
  }

  remove() {
    const lastSelected = this.getLastSelected();

    if (!lastSelected) return;

    const name = lastSelected.name;
    const selectionLength = this.dualOutputService.views.isDualOutputCollection
      ? this.getIds().length / 2
      : this.getIds().length;
    const message =
      selectionLength > 1
        ? $t('Are you sure you want to remove these %{count} items?', { count: selectionLength })
        : $t('Are you sure you want to remove %{sceneName}?', { sceneName: name });

    remote.dialog
      .showMessageBox(Utils.getMainWindow(), {
        title: 'Streamlabs Desktop',
        message,
        type: 'warning',
        buttons: [$t('Cancel'), $t('OK')],
      })
      .then(({ response }) => {
        if (!response) return;
        this.editorCommandsService.executeCommand('RemoveNodesCommand', this.clone());
      });
  }

  /**
   * Filter dual output nodes from selection
   * @remarks Primarily used when toggling on Selective Recording
   */
  filterDualOutputNodes() {
    const dualOutputItems = this.clone().getItems('vertical');
    if (!dualOutputItems.length) return;

    const dualOutputSelection = new Selection(this._sceneId, dualOutputItems);

    this.editorCommandsService.executeCommand('RemoveNodesCommand', dualOutputSelection);
  }

  /**
   * Selects items in the global selection
   * @param items The list of items to select
   * @param sync Whether to select synchronously (use only to resolve race conditions)
   * @returns the global selection
   */
  select(items: TNodesList, sync = false) {
    if (this.isFrozen) {
      throw new Error('Attempted to modify frozen selection');
    }

    if (sync) {
      this.selectionService.select(items);
    } else {
      this.selectionService.actions.select(items);
    }

    return this;
  }

  /**
   * Should not be called on the GlobalSelection
   */
  protected setState(state: Partial<ISelectionState>) {
    throw new Error('setState cannot be called on the GlobalSelection');
  }
}
