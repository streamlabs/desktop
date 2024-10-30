import { Inject } from '../../services/core/injector';
import { Menu } from './Menu';
import { Source, SourcesService } from '../../services/sources';
import { ScenesService } from '../../services/scenes';
import { ClipboardService } from '../../services/clipboard';
import { SourceTransformMenu } from './SourceTransformMenu';
import { GroupMenu } from './GroupMenu';
import { DeinterlaceMenu } from './DeinterlaceMenu';
import { SourceFiltersService } from '../../services/source-filters';
import { CustomizationService } from 'services/customization';
import { SelectionService } from 'services/selection/selection';
import { ProjectorService } from 'services/projector';
import { AudioService } from 'services/audio';
import { $t } from 'services/i18n';
import { MonitorCaptureCroppingService } from 'services/sources/monitor-capture-cropping';

import { ScaleFilteringMenu } from './ScaleFilteringMenu';
import { BlendingModeMenu } from './BlendingModeMenu';
import { BlendingMethodMenu } from './BlendingMethodMenu';

interface IEditMenuOptions {
  selectedSourceId?: string;
  sceneNodeId?: string;
  showSceneItemMenu?: boolean;
  selectedSceneId?: string;
  showAudioMixerMenu?: boolean;
}

export class EditMenu extends Menu {
  @Inject() private sourcesService: SourcesService;
  @Inject() private scenesService: ScenesService;
  @Inject() private sourceFiltersService: SourceFiltersService;
  @Inject() private clipboardService: ClipboardService;
  @Inject() private customizationService: CustomizationService;
  @Inject() private selectionService: SelectionService;
  @Inject() private projectorService: ProjectorService;
  @Inject() private audioService: AudioService;
  @Inject() private monitorCaptureCroppingService: MonitorCaptureCroppingService;

  // @ts-expect-error: ts2729: use before initialization
  private scene = this.scenesService.getScene(this.options.selectedSceneId);
  private source: Source;

  constructor(private options: IEditMenuOptions) {
    super();

    if (this.options.selectedSourceId) {
      this.source = this.sourcesService.getSource(this.options.selectedSourceId);
    } else if (this.options.showSceneItemMenu && this.selectionService.isSceneItem()) {
      this.source = this.selectionService.getItems()[0].getSource();
    }

    this.appendEditMenuItems();
  }

  private appendEditMenuItems() {
    const isMultipleSelection = this.selectionService.getSize() > 1;

    if (
      this.scene &&
      !isMultipleSelection &&
      this.source &&
      this.source.type === 'monitor_capture'
    ) {
      this.append({
        id: 'Interactive Crop',
        label: $t('sources.interactiveCrop'),
        enabled: true,
        click: () => {
          const sceneId = this.scene.id;
          const sceneItemId = this.options.sceneNodeId;
          const sourceId = this.source.sourceId;
          this.monitorCaptureCroppingService.startCropping(sceneId, sceneItemId, sourceId);
        },
      });

      this.append({ type: 'separator' });
    }

    if (this.scene) {
      this.append({
        id: 'Paste (Reference)',
        label: $t('sources.pasteReference'),
        enabled: this.clipboardService.hasData(),
        accelerator: 'CommandOrControl+V',
        click: () => this.clipboardService.paste(),
      });

      this.append({
        id: 'Paste (Duplicate)',
        label: $t('sources.pasteDuplicate'),
        enabled: this.clipboardService.hasItems(),
        click: () => this.clipboardService.paste(true),
      });
    }

    if (this.options.showSceneItemMenu) {
      const selectedItem = this.selectionService.getLastSelected();

      this.append({
        id: 'Copy',
        label: $t('common.copy'),
        accelerator: 'CommandOrControl+C',
        click: () => this.clipboardService.copy(),
      });

      this.append({
        id: 'Select All',
        label: $t('common.selectAll'),
        accelerator: 'CommandOrControl+A',
        click: () => this.selectionService.selectAll(),
      });
      this.append({
        id: 'Invert Selection',
        label: $t('sources.invertSelection'),
        click: () => this.selectionService.invert(),
      });

      this.append({ type: 'separator' });

      this.append({
        id: 'Remove',
        label: $t('common.remove'),
        accelerator: 'Delete',
        click: () => {
          this.selectionService.remove();
        },
      });

      this.append({
        id: 'Transform',
        label: $t('sources.transform'),
        submenu: this.transformSubmenu().menu,
      });

      this.append({
        id: 'Group',
        label: $t('sources.group'),
        submenu: this.groupSubmenu().menu,
      });

      this.append({
        label: $t('sources.ScaleFiltering'),
        submenu: this.scaleFilteringSubmenu().menu,
      });

      this.append({
        label: $t('sources.BlendingMode'),
        submenu: this.blendingModeSubmenu().menu,
      });

      this.append({
        label: $t('sources.BlendingMethod'),
        submenu: this.blendingMethodSubmenu().menu,
      });

      if (selectedItem) {
        const visibilityLabel = selectedItem.visible ? $t('common.hide') : $t('common.show');

        if (!isMultipleSelection) {
          this.append({
            id: selectedItem.visible ? 'Hide' : 'Show',
            label: visibilityLabel,
            click: () => {
              selectedItem.setVisibility(!selectedItem.visible);
            },
          });
          this.append({
            id: 'Create Source Projector',
            label: $t('sources.createSourceProjector'),
            click: () => {
              this.projectorService.createProjector(selectedItem.sourceId);
            },
          });
        } else {
          this.append({
            id: 'Show',
            label: $t('common.show'),
            click: () => {
              this.selectionService.setVisibility(true);
            },
          });
          this.append({
            id: 'Hide',
            label: $t('common.hide'),
            click: () => {
              this.selectionService.setVisibility(false);
            },
          });
        }
      }
    }

    if (this.selectionService.isSceneFolder()) {
      this.append({
        id: 'Rename',
        label: $t('common.rename'),
        click: () =>
          this.scenesService.showNameFolder({
            renameId: this.selectionService.getFolders()[0].id,
          }),
      });
    }

    if (this.source) {
      if (
        this.source.type === 'browser_source' &&
        this.source.propertiesManagerType === 'default'
      ) {
        this.append({
          label: $t('common.Interact'),
          click: () => this.sourcesService.showInteractWindow(this.source.sourceId),
        });
      }
    }

    if (this.source && !isMultipleSelection) {
      this.append({
        id: 'Rename',
        label: $t('common.rename'),
        click: () => this.sourcesService.showRenameSource(this.source.sourceId),
      });

      this.append({ type: 'separator' });

      if (this.source.async && this.source.video) {
        this.append({
          id: 'Deinterlacing',
          label: $t('common.deinterlacing'),
          submenu: this.deinterlaceSubmenu().menu,
        });
      }

      const filtersCount = this.sourceFiltersService.getFilters(this.source.sourceId).length;

      this.append({
        id: 'Filters',
        label: $t('common.filters') + (filtersCount > 0 ? ` (${filtersCount})` : ''),
        click: () => {
          this.showFilters();
        },
      });

      this.append({
        id: 'Copy Filters',
        label: $t('sources.copyFilters'),
        click: () => this.clipboardService.copyFilters(),
      });

      this.append({
        id: 'Paste Filters',
        label: $t('sources.pasteFilters'),
        click: () => this.clipboardService.pasteFilters(),
        enabled: this.clipboardService.hasFilters(),
      });

      this.append({ type: 'separator' });

      this.append({
        id: 'Properties',
        label: $t('sources.properties'),
        click: () => {
          this.showProperties();
        },
        enabled: this.source.hasProps(),
      });
    }

    if (!this.options.showSceneItemMenu && !this.source) {
      this.append({ type: 'separator' });

      this.append({
        id: 'Lock Sources',
        label: $t('sources.lock'),
        click: () => this.scenesService.setLockOnAllScenes(true),
      });

      this.append({
        id: 'Unlock Sources',
        label: $t('sources.unlock'),
        click: () => this.scenesService.setLockOnAllScenes(false),
      });

      this.append({
        id: 'Performance Mode',
        label: $t('scenes.performanceMode'),
        type: 'checkbox',
        checked: this.customizationService.state.performanceMode,
        click: () =>
          this.customizationService.setSettings({
            performanceMode: !this.customizationService.state.performanceMode,
          }),
      });
    }

    this.append({ type: 'separator' });

    this.append({
      id: 'Create Output Projector',
      label: $t('scenes.createOutputProjector'),
      click: () => this.projectorService.createProjector(),
    });

    if (this.options.showAudioMixerMenu) {
      this.append({ type: 'separator' });

      this.append({
        id: 'Hide',
        label: $t('common.hide'),
        click: () => {
          this.audioService.getSource(this.source.sourceId).setHidden(true);
        },
      });

      this.append({
        id: 'Unhide All',
        label: $t('sources.unhideAll'),
        click: () => this.audioService.unhideAllSourcesForCurrentScene(),
      });
    }
  }

  private showFilters() {
    this.sourceFiltersService.showSourceFilters(this.source.sourceId);
  }

  private showProperties() {
    this.sourcesService.showSourceProperties(this.source.sourceId);
  }

  private transformSubmenu() {
    return new SourceTransformMenu();
  }

  private groupSubmenu() {
    return new GroupMenu();
  }

  private deinterlaceSubmenu() {
    return new DeinterlaceMenu(this.source);
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
}
