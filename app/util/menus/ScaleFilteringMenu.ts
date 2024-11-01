import { Inject } from 'services/core/injector';
import { $t } from 'services/i18n';
import { EScaleType } from 'services/scenes';
import { SelectionService } from 'services/selection';
import { Menu } from './Menu';

export class ScaleFilteringMenu extends Menu {
  @Inject() private selectionService: SelectionService;

  constructor() {
    super();

    this.appendMenuItems();
  }

  appendMenuItems() {
    this.append({
      label: $t('sources.Disable'),
      click: () => this.selectionService.setScaleFilter(EScaleType.Disable),
      checked: this.selectionService.isScaleFilterSelected(EScaleType.Disable),
      type: 'checkbox',
    });
    this.append({
      label: $t('sources.Point'),
      click: () => this.selectionService.setScaleFilter(EScaleType.Point),
      checked: this.selectionService.isScaleFilterSelected(EScaleType.Point),
      type: 'checkbox',
    });
    this.append({
      label: $t('sources.Bicubic'),
      click: () => this.selectionService.setScaleFilter(EScaleType.Bicubic),
      checked: this.selectionService.isScaleFilterSelected(EScaleType.Bicubic),
      type: 'checkbox',
    });
    this.append({
      label: $t('sources.Bilinear'),
      click: () => this.selectionService.setScaleFilter(EScaleType.Bilinear),
      checked: this.selectionService.isScaleFilterSelected(EScaleType.Bilinear),
      type: 'checkbox',
    });
    this.append({
      label: $t('sources.Lanczos'),
      click: () => this.selectionService.setScaleFilter(EScaleType.Lanczos),
      checked: this.selectionService.isScaleFilterSelected(EScaleType.Lanczos),
      type: 'checkbox',
    });
    this.append({
      label: $t('sources.Area'),
      click: () => this.selectionService.setScaleFilter(EScaleType.Area),
      checked: this.selectionService.isScaleFilterSelected(EScaleType.Area),
      type: 'checkbox',
    });
  }
}
