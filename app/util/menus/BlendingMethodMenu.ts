import { Inject } from 'services/core/injector';
import { $t } from 'services/i18n';
import { EBlendingMethod } from 'services/scenes';
import { SelectionService } from 'services/selection';
import { Menu } from './Menu';

export class BlendingMethodMenu extends Menu {
  @Inject() private selectionService: SelectionService;

  constructor() {
    super();

    this.appendMenuItems();
  }

  appendMenuItems() {
    this.append({
      label: $t('sources.Default'),
      click: () => this.selectionService.setBlendingMethod(EBlendingMethod.Default),
      checked: this.selectionService.isBlendingMethodSelected(EBlendingMethod.Default),
      type: 'checkbox',
    });
    this.append({
      label: $t('sources.SRGBOff'),
      click: () => this.selectionService.setBlendingMethod(EBlendingMethod.SrgbOff),
      checked: this.selectionService.isBlendingMethodSelected(EBlendingMethod.SrgbOff),
      type: 'checkbox',
    });
  }
}
