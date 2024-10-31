import * as inputComponents from 'components/obs/inputs';
import GenericForm from 'components/obs/inputs/GenericForm.vue';
import { IObsInput, IObsListInput, TObsFormData } from 'components/obs/inputs/ObsInput';
import { Inject } from 'services/core/injector';
import { $t } from 'services/i18n';
import { ETransitionType, TransitionsService } from 'services/transitions';
import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';

@Component({
  components: {
    GenericForm,
    ...inputComponents,
  },
})
export default class SceneTransitions extends Vue {
  @Inject() transitionsService: TransitionsService;

  @Prop() transitionId: string;

  get typeModel(): IObsListInput<ETransitionType> {
    return {
      description: $t('transitions.transitionType'),
      name: 'type',
      value: this.transition.type,
      options: this.transitionsService.getTypes(),
    };
  }

  set typeModel(model: IObsListInput<ETransitionType>) {
    this.transitionsService.changeTransitionType(this.transitionId, model.value);
    this.properties = this.transitionsService.getPropertiesFormData(this.transitionId);
  }

  get durationModel(): IObsInput<number> {
    return {
      description: $t('transitions.duration'),
      name: 'duration',
      value: this.transition.duration,
    };
  }

  set durationModel(model: IObsInput<number>) {
    this.transitionsService.setDuration(this.transitionId, model.value);
  }

  get nameModel(): IObsInput<string> {
    return {
      description: $t('transitions.transitionName'),
      name: 'name',
      value: this.transition.name,
    };
  }

  set nameModel(name: IObsInput<string>) {
    this.transitionsService.renameTransition(this.transitionId, name.value);
  }

  get transition() {
    return this.transitionsService.getTransition(this.transitionId);
  }

  // @ts-expect-error: ts2729: use before initialization
  properties = this.transitionsService.getPropertiesFormData(this.transitionId);

  saveProperties(props: TObsFormData) {
    this.transitionsService.setPropertiesFormData(this.transitionId, props);
  }
}
