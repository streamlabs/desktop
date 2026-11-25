import { Command } from './command';
import { ETransitionType, TransitionsService } from 'services/transitions';
import { TObsFormData } from 'services/sources/obs-properties';
import { Inject } from 'services/core';
import cloneDeep from 'lodash/cloneDeep';
import { $t } from 'services/i18n';

/**
 * Any or all of these can be modified
 */
export interface ITransitionChanges {
  name?: string;
  duration?: number;
  type?: ETransitionType;
  formData?: TObsFormData;
}

export class EditTransitionCommand extends Command {
  @Inject() private transitionsService: TransitionsService;

  description: string;

  private beforeName: string;
  private beforeDuration: number;
  private beforeType: ETransitionType;
  private beforeFormData: TObsFormData;

  constructor(private transitionId: string, private changes: ITransitionChanges) {
    super();

    // Make sure our copy won't mutate for safe rollacks
    if (changes.formData != null) changes.formData = cloneDeep(changes.formData);

    this.description = $t('Edit %{transitionName}', {
      transitionName: this.transitionsService.getTransition(this.transitionId).name,
    });
  }

  execute() {
    const transition = this.transitionsService.getTransition(this.transitionId);

    if (this.changes.name != null) {
      this.beforeName = transition.name;
      this.transitionsService.renameTransition(this.transitionId, this.changes.name);
    }

    if (this.changes.duration != null) {
      this.beforeDuration = transition.duration;
      this.transitionsService.setDuration(this.transitionId, this.changes.duration);
    }

    if (this.changes.type != null) {
      this.beforeType = transition.type;
      this.transitionsService.changeTransitionType(this.transitionId, this.changes.type);
    }

    if (this.changes.formData != null) {
      this.beforeFormData = this.transitionsService.getPropertiesFormData(this.transitionId);
      this.transitionsService.setPropertiesFormData(this.transitionId, this.changes.formData);
    }
  }

  rollback() {
    if (this.changes.name != null) {
      this.transitionsService.renameTransition(this.transitionId, this.beforeName);
    }

    if (this.changes.duration != null) {
      this.transitionsService.setDuration(this.transitionId, this.beforeDuration);
    }

    if (this.changes.type != null) {
      this.transitionsService.changeTransitionType(this.transitionId, this.beforeType);
    }

    if (this.changes.formData != null) {
      this.transitionsService.setPropertiesFormData(this.transitionId, this.beforeFormData);
    }
  }
}
