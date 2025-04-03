import { Inject } from '../../services/core/injector';
import { Menu } from './Menu';
import { Source, SourcesService } from '../../services/sources';
import { SceneItem, ScenesService, isItem } from '../../services/scenes';
import { ClipboardService } from 'services/clipboard';
import { SourceTransformMenu } from './SourceTransformMenu';
import { GroupMenu } from './GroupMenu';
import { SourceFiltersService } from '../../services/source-filters';
import { WidgetsService } from 'services/widgets';
import { CustomizationService } from 'services/customization';
import { SelectionService } from 'services/selection';
import { ProjectorService } from 'services/projector';
import { $t } from 'services/i18n';
import { EditorCommandsService } from 'services/editor-commands';
import { StreamingService } from 'services/streaming';
import { TDisplayType } from 'services/video';
import * as remote from '@electron/remote';
import { ProjectorMenu } from './ProjectorMenu';
import { FiltersMenu } from './FiltersMenu';
import { AudioService } from 'services/audio';
import { ScaleFilteringMenu } from './ScaleFilteringMenu';
import { BlendingModeMenu } from './BlendingModeMenu';
import { BlendingMethodMenu } from './BlendingMethodMenu';
import { DeinterlacingModeMenu } from './DeinterlacingModeMenu';
import { DualOutputService } from 'services/dual-output';

interface IEditMenuOptions {
  selectedSourceId?: string;
  showSceneItemMenu?: boolean;
  selectedSceneId?: string;
  showAudioMixerMenu?: boolean;
  display?: TDisplayType;
}

export class EditMenu extends Menu {
  @Inject() private sourcesService: SourcesService;
  @Inject() private scenesService!: ScenesService;
  @Inject() private sourceFiltersService: SourceFiltersService;
  @Inject() private clipboardService: ClipboardService;
  @Inject() private widgetsService: WidgetsService;
  @Inject() private customizationService: CustomizationService;
  @Inject() private selectionService: SelectionService;
  @Inject() private projectorService: ProjectorService;
  @Inject() private editorCommandsService: EditorCommandsService;
  @Inject() private streamingService: StreamingService;
  @Inject() private audioService: AudioService;
  @Inject() private dualOutputService: DualOutputService;

  private scene = this.scenesService.views.getScene(this.options.selectedSceneId);
  private showProjectionMenuItem = true;

  private readonly source: Source;

  constructor(private options: IEditMenuOptions) {
    super();

    if (this.options.selectedSourceId) {
      this.source = this.sourcesService.views.getSource(this.options.selectedSourceId);
    } else if (
      this.options.showSceneItemMenu &&
      this.selectionService.views.globalSelection.isSceneItem()
    ) {
      this.source = this.selectionService.views.globalSelection.getItems()[0].getSource();
    }

    // Selective recording can only be used with horizontal sources
    this.showProjectionMenuItem =
      this.options?.display !== 'vertical' &&
      !this.selectionService.views.globalSelection.getItems('vertical').length;

    this.appendEditMenuItems();
  }

  private appendEditMenuItems() {
    if (this.scene) {
      this.append({
        label: $t('Paste (Reference)'),
        enabled: this.clipboardService.views.hasData(),
        accelerator: 'CommandOrControl+V',
        click: () => this.clipboardService.paste(),
      });

      this.append({
        label: $t('Paste (Duplicate)'),
        enabled: this.clipboardService.views.canDuplicate(),
        click: () => this.clipboardService.paste(true),
      });
    }

    const isSelectionSameNodeAcrossDisplays = (selectionSize: number) => {
      /*
       * Check that selection is only two nodes (same node, one for each display), this only
       * seems to happen when clicking a source from the source selector which selects the
       * source across both displays.
       *
       * When selection size is not 2, we can assume we're either working with a single node or actual
       * multiple nodes (i.e not the same node across two displays).
       *
       * TODO: do we need to be more specific to detect if we're working with the same node?
       * We've found `source_id` to be stable, but that might change across different source types.
       *
       * TODO: It doesn't seem like we need to adjust selection to have Filters, Rename, and Properties
       * work, we can only assume the commands use `lastSelectedId` or similar access method
       * to determine which node to work with. Needs to be confirmed with testing.
       */
      if (selectionSize !== 2) {
        return false;
      }

      const selectedItems = this.selectionService.views.globalSelection
        .getItems()
        .map(item => this.scenesService.views.getSceneItem(item.id));

      const [first, second] = selectedItems;

      const bothNodesHaveSameSourceId = first.sourceId === second.sourceId;

      const bothNodesHaveDifferentDisplay = first.display !== second.display;

      return bothNodesHaveSameSourceId && bothNodesHaveDifferentDisplay;
    };

    const selectionSize = this.selectionService.views.globalSelection.getSize();
    const isMultipleSelection =
      selectionSize > 1 && !isSelectionSameNodeAcrossDisplays(selectionSize);

    if (this.options.showSceneItemMenu) {
      const selectedItem = this.selectionService.views.globalSelection.getLastSelected();

      this.append({
        label: $t('Copy'),
        accelerator: 'CommandOrControl+C',
        click: () => this.clipboardService.copy(),
      });

      this.append({
        label: $t('Select All'),
        accelerator: 'CommandOrControl+A',
        click: () => this.selectionService.views.globalSelection.selectAll(),
      });
      this.append({
        label: $t('Invert Selection'),
        click: () => this.selectionService.views.globalSelection.invert(),
      });

      this.append({ type: 'separator' });

      this.append({
        label: $t('Transform'),
        submenu: this.transformSubmenu(this.options?.display).menu,
      });

      this.append({
        label: 'Group',
        submenu: this.groupSubmenu().menu,
      });

      this.append({ type: 'separator' });

      this.append({
        label: $t('Scale Filtering'),
        submenu: this.scaleFilteringSubmenu().menu,
      });

      this.append({
        label: $t('Blending Mode'),
        submenu: this.blendingModeSubmenu().menu,
      });

      this.append({
        label: $t('Blending Method'),
        submenu: this.blendingMethodSubmenu().menu,
      });

      if (selectedItem && isItem(selectedItem)) {
        if (selectedItem.getSource().async) {
          this.append({
            label: $t('Deinterlacing'),
            submenu: this.deinterlacingSubmenu().menu,
          });

          this.append({ type: 'separator' });
        }

        const visibilityLabel = selectedItem.visible ? $t('Hide') : $t('Show');
        const streamVisLabel = selectedItem.streamVisible
          ? $t('Hide on Stream')
          : $t('Show on Stream');
        const recordingVisLabel = selectedItem.recordingVisible
          ? $t('Hide on Recording')
          : $t('Show on Recording');

        if (!isMultipleSelection) {
          this.append({
            label: visibilityLabel,
            click: () => {
              this.editorCommandsService.executeCommand(
                'HideItemsCommand',
                selectedItem.getSelection(),
                selectedItem.visible,
              );
            },
          });

          if (this.streamingService.state.selectiveRecording) {
            this.append({
              label: streamVisLabel,
              click: () => {
                selectedItem.setStreamVisible(!selectedItem.streamVisible);
              },
            });
            this.append({
              label: recordingVisLabel,
              click: () => {
                selectedItem.setRecordingVisible(!selectedItem.recordingVisible);
              },
            });
          }
        } else {
          this.append({
            label: $t('Show'),
            click: () => {
              this.editorCommandsService.executeCommand(
                'HideItemsCommand',
                this.selectionService.views.globalSelection,
                false,
              );
            },
          });
          this.append({
            label: $t('Hide'),
            click: () => {
              this.editorCommandsService.executeCommand(
                'HideItemsCommand',
                this.selectionService.views.globalSelection,
                true,
              );
            },
          });
        }

        if (this.source && this.source.getPropertiesManagerType() === 'widget') {
          this.append({
            label: $t('Export Widget'),
            click: () => {
              remote.dialog
                .showSaveDialog({
                  filters: [{ name: 'Widget File', extensions: ['widget'] }],
                })
                .then(({ filePath }) => {
                  if (!filePath) return;

                  /**
                   * In dual output mode, the edit menu can be opened on either display
                   * but for the purposes of persisting widget data, only the horizontal
                   * scene item data should be persisted. Determine the correct sceneItemId
                   * here.
                   */

                  const sceneItemId =
                    this.options?.display === 'vertical'
                      ? this.dualOutputService.views.getDualOutputNodeId(selectedItem.sceneItemId)
                      : selectedItem.sceneItemId;

                  console.log('sceneItemId ', sceneItemId);

                  this.widgetsService.saveWidgetFile(filePath, sceneItemId);
                });
            },
          });
        }
      }
    }

    if (this.selectionService.views.globalSelection.isSceneFolder()) {
      this.append({
        label: $t('Rename'),
        click: () =>
          this.scenesService.showNameFolder({
            sceneId: this.scenesService.views.activeSceneId,
            renameId: this.selectionService.views.globalSelection.getFolders()[0].id,
          }),
      });
    }

    if (this.source) {
      this.append({
        label: $t('Remove'),
        accelerator: 'Delete',
        click: () => {
          // if scene items are selected than remove the selection
          if (this.options.showSceneItemMenu) {
            this.selectionService.actions.removeSelected();
          } else {
            // if no items are selected we are in the MixerSources context menu
            // if a simple source is selected than remove all sources from the current scene
            if (!this.source.channel) {
              const scene = this.scenesService.views.activeScene;
              const itemsToRemoveIds = scene
                .getItems()
                .filter(item => item.sourceId === this.source.sourceId)
                .reduce((itemIds: string[], item: SceneItem) => {
                  itemIds.push(item.id);
                  // for dual output scenes, also remove the partner node
                  if (this.dualOutputService.views.hasSceneNodeMaps) {
                    const dualOutputNodeId = this.dualOutputService.views.getDualOutputNodeId(
                      item.id,
                    );
                    if (dualOutputNodeId) itemIds.push(dualOutputNodeId);
                  }
                  return itemIds;
                }, []);

              this.editorCommandsService.executeCommand(
                'RemoveNodesCommand',
                scene.getSelection(itemsToRemoveIds),
              );
            } else {
              // remove a global source
              remote.dialog
                .showMessageBox(remote.getCurrentWindow(), {
                  title: 'Streamlabs Desktop',
                  message: $t('This source will be removed from all of your scenes'),
                  type: 'warning',
                  buttons: [$t('Cancel'), $t('OK')],
                })
                .then(({ response }) => {
                  if (!response) return;
                  this.editorCommandsService.executeCommand(
                    'RemoveSourceCommand',
                    this.source.sourceId,
                  );
                });
            }
          }
        },
      });

      if (this.source.type === 'browser_source') {
        this.append({
          label: $t('Interact'),
          click: () => this.sourcesService.showInteractWindow(this.source.sourceId),
        });
      }
    }

    if (this.source && !isMultipleSelection) {
      this.append({
        label: $t('Rename'),
        click: () => {
          if (this.source.type === 'scene') {
            this.scenesService.actions.showNameScene({ rename: this.source.sourceId });
          } else {
            this.sourcesService.actions.showRenameSource(this.source.sourceId);
          }
        },
      });

      const filtersCount = this.sourceFiltersService.getFilters(this.source.sourceId).length;

      this.append({
        label: $t('Filters') + (filtersCount > 0 ? ` (${filtersCount})` : ''),
        submenu: new FiltersMenu(this.source.sourceId).menu,
      });

      this.append({
        label: $t('Properties'),
        click: () => {
          this.showProperties();
        },
        enabled: this.source.hasProps(),
      });
    }

    if (!this.options.showSceneItemMenu && !this.source) {
      this.append({ type: 'separator' });

      this.append({
        label: $t('Lock Sources'),
        click: () => this.scenesService.setLockOnAllScenes(true),
      });

      this.append({
        label: $t('Unlock Sources'),
        click: () => this.scenesService.setLockOnAllScenes(false),
      });
    }

    this.append({ type: 'separator' });

    if (this.showProjectionMenuItem) {
      this.append({ label: $t('Projector'), submenu: this.projectorSubmenu().menu });
    }

    this.append({
      label: $t('Performance Mode'),
      type: 'checkbox',
      checked: this.customizationService.state.performanceMode,
      click: () =>
        this.customizationService.setSettings({
          performanceMode: !this.customizationService.state.performanceMode,
        }),
    });

    this.append({ type: 'separator' });

    this.append({
      label: $t('Undo %{action}', { action: this.editorCommandsService.nextUndoDescription }),
      accelerator: 'CommandOrControl+Z',
      click: () => this.editorCommandsService.undo(),
      enabled: this.editorCommandsService.nextUndo != null,
    });

    this.append({
      label: $t('Redo %{action}', { action: this.editorCommandsService.nextRedoDescription }),
      accelerator: 'CommandOrControl+Y',
      click: () => this.editorCommandsService.redo(),
      enabled: this.editorCommandsService.nextRedo != null,
    });

    if (this.options.showAudioMixerMenu) {
      this.append({ type: 'separator' });

      this.append({
        label: $t('Hide'),
        click: () => {
          this.editorCommandsService.executeCommand('HideMixerSourceCommand', this.source.sourceId);
        },
      });

      this.append({
        label: $t('Unhide All'),
        click: () => this.editorCommandsService.executeCommand('UnhideMixerSourcesCommand'),
      });
    }
  }

  private showProperties() {
    if (this.options.showAudioMixerMenu || !this.source.video) {
      this.audioService.actions.showAdvancedSettings(this.source.sourceId);
    } else {
      this.sourcesService.actions.showSourceProperties(this.source.sourceId);
    }
  }

  private transformSubmenu(display?: TDisplayType) {
    return new SourceTransformMenu(display);
  }

  private groupSubmenu() {
    return new GroupMenu();
  }

  private projectorSubmenu() {
    return new ProjectorMenu();
  }

  private scaleFilteringSubmenu() {
    return new ScaleFilteringMenu();
  }

  private blendingModeSubmenu() {
    return new BlendingModeMenu();
  }

  private blendingMethodSubmenu() {
    return new BlendingMethodMenu();
  }

  private deinterlacingSubmenu() {
    return new DeinterlacingModeMenu();
  }
}
