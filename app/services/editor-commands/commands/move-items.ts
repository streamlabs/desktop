import { ModifyTransformCommand } from './modify-transform';
import { Selection } from 'services/selection';
import { $t } from 'services/i18n';
import { TDisplayType } from 'services/video';

export class MoveItemsCommand extends ModifyTransformCommand {
  constructor(
    selection: Selection,
    private deltaPosition: Partial<IVec2>,
    protected display?: TDisplayType,
  ) {
    super(selection, display);
  }

  get description() {
    return $t('Move %{sourceName}', { sourceName: this.selection.getNodes()[0].name });
  }

  modifyTransform() {
    this.selection.getItems(this.display).forEach(item => {
      item.setTransform({
        position: {
          x: item.transform.position.x + (this.deltaPosition.x || 0),
          y: item.transform.position.y + (this.deltaPosition.y || 0),
        },
      });
    });
  }
}
