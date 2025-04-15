import { CombinableCommand } from './combinable-command';
import { ITransform } from 'services/scenes';
import { Selection } from 'services/selection';
import isEqual from 'lodash/isEqual';
import cloneDeep from 'lodash/cloneDeep';
import { TObsFormData } from 'components/obs/inputs/ObsInput';
import { EditSourcePropertiesCommand } from './edit-source-properties';
import { TDisplayType } from 'services/video';

export abstract class ModifyTransformCommand extends CombinableCommand {
  startTransforms: Dictionary<ITransform> = {};
  endTransforms: Dictionary<ITransform>;
  private modifyTransformSubCommands: EditSourcePropertiesCommand[] = [];

  constructor(protected selection: Selection, protected display?: TDisplayType) {
    super();
    this.selection.freeze();
    this.selection.getItems(this.display).forEach(item => {
      this.startTransforms[item.id] = cloneDeep(item.state.transform);
    });
  }

  /**
   * This function should modify the transform of items in the selection. The
   * transform will be saved before/after the operation so it can be undone.
   * Implementing classes should only perform operations that modify the
   * transform within this function, otherwise the operations will not be
   * full undone during rollback.
   */
  abstract modifyTransform(): void;

  execute() {
    // We already have end transforms, so this is a redo operation.
    // We should simply skip straight to the end result.
    if (this.endTransforms) {
      this.selection.getItems(this.display).forEach(item => {
        item.setTransform(this.endTransforms[item.id]);
      });
    } else {
      this.modifyTransform();
      this.endTransforms = {};
      this.selection.getItems(this.display).forEach(item => {
        this.endTransforms[item.id] = cloneDeep(item.state.transform);
      });
    }
  }

  rollback() {
    this.selection.getItems(this.display).forEach(item => {
      item.setTransform(this.startTransforms[item.id]);
    });
    this.modifyTransformSubCommands.forEach(cmd => cmd.rollback());
  }

  shouldCombine(other: ModifyTransformCommand) {
    return (
      other.selection.sceneId === this.selection.sceneId &&
      isEqual(other.selection.getIds(), this.selection.getIds())
    );
  }

  combine(other: ModifyTransformCommand) {
    this.endTransforms = other.endTransforms;
  }
}
