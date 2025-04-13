import { ModifyTransformCommand } from './modify-transform';
import { Selection } from 'services/selection';
import { $t } from 'services/i18n';

export class RotateItemsCommand extends ModifyTransformCommand {
  constructor(selection: Selection, private degrees: number, private isDelta = true) {
    super(selection);
  }

  get description() {
    return $t('Rotate %{sourceName}', { sourceName: this.selection.getNodes()[0].name });
  }

  modifyTransform() {
    this.selection.rotate(this.degrees, this.isDelta);
  }
}
