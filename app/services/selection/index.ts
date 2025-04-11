import electron from 'electron';
import { mutation, StatefulService, Inject } from 'services';
import { ISceneItemNode, ScenesService } from 'services/scenes';
import { $t } from 'services/i18n';
import { shortcut } from 'services/shortcuts';
import { BehaviorSubject } from 'rxjs';
import Utils from 'services/utils';
import { WindowsService } from 'services/windows';
import { EditorCommandsService } from 'services/editor-commands';
import { Selection } from './selection';
import { ViewHandler } from 'services/core';
import { GlobalSelection } from './global-selection';
import { DualOutputService } from 'app-services';
import { TDisplayType } from 'services/video';

export { Selection, GlobalSelection };

export interface ISelectionState {
  selectedIds: string[];
  lastSelectedId: string;
}

/**
 * list of ISceneNode.id or ISceneNode
 */
export type TNodesList = string | string[] | ISceneItemNode | ISceneItemNode[];

class SelectionViews extends ViewHandler<ISelectionState> {
  get globalSelection() {
    return new GlobalSelection();
  }

  get lastSelectedId() {
    return this.state.lastSelectedId;
  }
}

/**
 * represents selection of active scene and provide shortcuts
 */
export class SelectionService extends StatefulService<ISelectionState> {
  static initialState: ISelectionState = {
    selectedIds: [],
    lastSelectedId: '',
  };

  updated = new BehaviorSubject<ISelectionState>({
    selectedIds: [],
    lastSelectedId: '',
  });

  @Inject() private scenesService: ScenesService;
  @Inject() private windowsService: WindowsService;
  @Inject() private editorCommandsService: EditorCommandsService;
  @Inject() private dualOutputService: DualOutputService;

  init() {
    this.scenesService.sceneSwitched.subscribe(() => {
      this.views.globalSelection.reset();
    });
  }

  get views() {
    return new SelectionViews(this.state);
  }

  @shortcut('Delete')
  removeSelected() {
    // for dual output scenes, also remove the partner node
    // so update the selection before removing
    if (this.dualOutputService.views.hasSceneNodeMaps) {
      let ids = this.views.globalSelection.getIds();
      const updatedIds = new Set(ids);
      ids.forEach(id => {
        const dualOutputNodeId = this.dualOutputService.views.getDualOutputNodeId(id);
        if (dualOutputNodeId && !updatedIds.has(dualOutputNodeId)) {
          updatedIds.add(dualOutputNodeId);
        }
      });

      ids = Array.from(updatedIds);
      this.select(ids);
    }

    this.views.globalSelection.remove();
  }

  openEditTransform(display: TDisplayType = 'horizontal') {
    this.associateSelectionWithDisplay(display);

    this.windowsService.showWindow({
      componentName: 'EditTransform',
      title: $t('Edit Transform'),
      size: { width: 580, height: 500 },
      queryParams: { display },
    });
  }

  associateSelectionWithDisplay(display: TDisplayType) {
    if (this.dualOutputService.views.dualOutputMode) {
      // check if there are nodes selected in the other display
      const selectedItems = this.state.selectedIds.map(id =>
        this.scenesService.views.getSceneItem(id),
      );
      const requireFilter = selectedItems.some(item => item?.display !== display);

      // If nodes in both displays are selected, alter selection to only include
      // items in the last display selected
      if (requireFilter) {
        const filteredIds = selectedItems
          .filter(item => item?.display === display)
          .map(item => item.id);
        this.select(filteredIds);
      }
    }
  }

  select(items: TNodesList): void {
    const selection = new Selection(this.scenesService.views.activeSceneId, items);
    const scene = selection.getScene();
    const activeObsIds = selection.getItems().map(sceneItem => sceneItem.obsSceneItemId);
    const model = selection.getModel();

    this.SET_STATE({
      lastSelectedId: model.lastSelectedId,
      selectedIds: model.selectedIds,
    });
    this.updated.next(this.state);

    // tell OBS which sceneItems are selected
    scene
      .getObsScene()
      .getItems()
      .forEach(obsSceneItem => {
        obsSceneItem.selected = activeObsIds.includes(obsSceneItem.id);
      });
  }

  @mutation()
  private SET_STATE(state: Partial<ISelectionState>) {
    Object.assign(this.state, state);
  }
}

// Apply a mixin to selection service to have a reactive state
Utils.applyMixins(SelectionService, [Selection]);
