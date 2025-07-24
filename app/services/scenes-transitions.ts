import { mutation, StatefulService } from './core/stateful-service';
import * as obs from '../../obs-api';
import {
  getPropertiesFormData,
  IObsListOption,
  setPropertiesFormData,
  TObsFormData,
  TObsValue,
} from 'components/obs/inputs/ObsInput';
import { Inject } from './core/injector';
import { WindowsService } from './windows';
import { $t } from 'services/i18n';

interface ISceneTransitionsState {
  availableTransitions: IObsListOption<string>[];
  duration: number;
  properties: TObsFormData;
  type: string;
}

export class ScenesTransitionsService extends StatefulService<ISceneTransitionsState> {
  static initialState = {
    duration: 300,
    type: '',
  } as ISceneTransitionsState;

  @Inject()
  windowsService: WindowsService;

  init() {
    // Set the default transition type
    this.setType('cut_transition');
  }

  @mutation()
  private SET_TYPE(type: string) {
    this.state.type = type;
  }

  @mutation()
  private SET_DURATION(duration: number) {
    this.state.duration = duration;
  }

  getTypes(): IObsListOption<string>[] {
    return [
      { description: $t('Cut'), value: 'cut_transition' },
      { description: $t('Fade'), value: 'fade_transition' },
      { description: $t('Swipe'), value: 'swipe_transition' },
      { description: $t('Slide'), value: 'slide_transition' },
      { description: $t('Fade to Color'), value: 'fade_to_color_transition' },
      { description: $t('Luma Wipe'), value: 'wipe_transition' },
      { description: $t('Stinger'), value: 'obs_stinger_transition' },
      { description: $t('Motion'), value: 'motion_transition' },
      { description: $t('Shuffle'), value: 'shuffle_transition' },
    ];
  }

  transitionTo(scene: obs.IScene) {
    const transition = this.getCurrentTransition();
    transition.start(this.state.duration, scene);
  }

  release() {
    this.getCurrentTransition().release();
  }

  reset() {
    this.release();
    obs.Global.setOutputSource(0, null);
  }

  getSettings(): Dictionary<TObsValue> {
    return this.getCurrentTransition().settings;
  }

  setSettings(settings: Dictionary<TObsValue>) {
    this.getCurrentTransition().update(settings);
  }

  getPropertiesFormData(): TObsFormData {
    return getPropertiesFormData(this.getCurrentTransition()) || [];
  }

  setPropertiesFormData(formData: TObsFormData) {
    return setPropertiesFormData(this.getCurrentTransition(), formData);
  }

  private getCurrentTransition() {
    return obs.Global.getOutputSource(0) as obs.ITransition;
  }

  setType(type: string) {
    const oldTransition = this.getCurrentTransition() as obs.ITransition;

    const transition = this.getTypes().find(transition => {
      return transition.value === type;
    });

    if (transition) {
      const newTransition = obs.TransitionFactory.create(type, 'Global Transition');
      obs.Global.setOutputSource(0, newTransition);

      if (oldTransition && oldTransition.getActiveSource) {
        newTransition.set(oldTransition.getActiveSource());
        oldTransition.release();
      }

      this.SET_TYPE(type);
    }
  }

  setDuration(duration: number) {
    this.SET_DURATION(duration);
  }

  getFormData() {
    return {
      type: {
        description: $t('Transition'),
        name: 'type',
        value: this.state.type,
        options: this.getTypes(),
      },
      duration: {
        description: $t('Duration'),
        name: 'duration',
        value: this.state.duration,
      },
    };
  }

  showSceneTransitions() {
    this.windowsService.showWindow({
      componentName: 'SceneTransitions',
      title: $t('Scene Transitions'),
      size: {
        width: 500,
        height: 600,
      },
    });
  }
}
