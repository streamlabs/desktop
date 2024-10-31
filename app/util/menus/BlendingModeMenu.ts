import { Inject } from 'services/core/injector';
import { $t } from 'services/i18n';
import { EBlendingMode } from 'services/scenes';
import { SelectionService } from 'services/selection';
import { Menu } from './Menu';

export class BlendingModeMenu extends Menu {
  @Inject() private selectionService: SelectionService;

  constructor() {
    super();

    this.appendMenuItems();
  }

  appendMenuItems() {
    this.append({
      label: $t('sources.Normal'),
      click: () => this.selectionService.setBlendingMode(EBlendingMode.Normal),
      checked: this.selectionService.isBlendingModeSelected(EBlendingMode.Normal),
      type: 'checkbox',
    });
    this.append({
      label: $t('sources.Additive'),
      click: () => this.selectionService.setBlendingMode(EBlendingMode.Additive),
      checked: this.selectionService.isBlendingModeSelected(EBlendingMode.Additive),
      type: 'checkbox',
    });
    this.append({
      label: $t('sources.Substract'),
      click: () => this.selectionService.setBlendingMode(EBlendingMode.Substract),
      checked: this.selectionService.isBlendingModeSelected(EBlendingMode.Substract),
      type: 'checkbox',
    });
    this.append({
      label: $t('sources.Screen'),
      click: () => this.selectionService.setBlendingMode(EBlendingMode.Screen),
      checked: this.selectionService.isBlendingModeSelected(EBlendingMode.Screen),
      type: 'checkbox',
    });
    this.append({
      label: $t('sources.Multiply'),
      click: () => this.selectionService.setBlendingMode(EBlendingMode.Multiply),
      checked: this.selectionService.isBlendingModeSelected(EBlendingMode.Multiply),
      type: 'checkbox',
    });
    this.append({
      label: $t('sources.Lighten'),
      click: () => this.selectionService.setBlendingMode(EBlendingMode.Lighten),
      checked: this.selectionService.isBlendingModeSelected(EBlendingMode.Lighten),
      type: 'checkbox',
    });
    this.append({
      label: $t('sources.Darken'),
      click: () => this.selectionService.setBlendingMode(EBlendingMode.Darken),
      checked: this.selectionService.isBlendingModeSelected(EBlendingMode.Darken),
      type: 'checkbox',
    });
  }
}
