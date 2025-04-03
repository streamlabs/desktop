import { ModifyTransformCommand } from './modify-transform';
import { Selection } from 'services/selection';
import { $t } from 'services/i18n';
import { TDisplayType } from 'services/video';

export class CropItemsCommand extends ModifyTransformCommand {
  /**
   * Crops a set of items
   * @param selection The selection to operation on
   * @param crop The crop to apply
   * @param position Optionally the items can be moved as well
   */
  constructor(
    selection: Selection,
    private crop: Partial<ICrop>,
    private position?: IVec2,
    protected display?: TDisplayType,
  ) {
    super(selection, display);
  }

  get description() {
    return $t('Crop %{sourceName}', { sourceName: this.selection.getNodes()[0].name });
  }

  /**
   * Resize items in the editor
   * @remark In dual output mode, the selection may have both horizontal and vertical nodes
   * but only the nodes in the display where the mouse event originated should be transformed
   */
  modifyTransform() {
    this.selection.getItems(this.display).forEach(item => {
      item.setTransform({
        position: this.position,
        crop: this.crop,
      });
    });
  }
}
