import { ModifyTransformCommand } from './modify-transform';
import { Selection } from 'services/selection';
import { $t } from 'services/i18n';
import { TDisplayType } from 'services/video';

export class ResizeItemsCommand extends ModifyTransformCommand {
  constructor(
    selection: Selection,
    private deltaScale: IVec2,
    private origin: IVec2,
    protected display?: TDisplayType,
  ) {
    super(selection, display);
  }

  get description() {
    return $t('Resize %{sourceName}', { sourceName: this.selection.getNodes()[0].name });
  }

  /**
   * Resize items in the editor
   * @remark In dual output mode, the selection may have both horizontal and vertical nodes
   * but only the nodes in the display where the mouse event originated should be transformed
   */
  modifyTransform() {
    if (this.display) {
      const filteredItems = this.selection.getItems(this.display);
      const filteredSelection = new Selection(this.selection.sceneId, filteredItems);
      filteredSelection.scale(this.deltaScale, this.origin);
    } else {
      this.selection.scale(this.deltaScale, this.origin);
    }
  }
}
