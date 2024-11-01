import { Inject } from 'services/core/injector';
import { mutation, StatefulService } from 'services/core/stateful-service';
import { UserService } from 'services/user';
import Utils from 'services/utils';
import { HostsService } from './hosts';

export enum EAvailableFeatures {
  chatbot = 'slobs--chatbot',
}

interface IIncrementalRolloutServiceState {
  availableFeatures: string[];
}

export class IncrementalRolloutService extends StatefulService<IIncrementalRolloutServiceState> {
  @Inject() private userService: UserService;
  @Inject() private hostsService: HostsService;

  static defaultState: IIncrementalRolloutServiceState = {
    availableFeatures: [],
  };

  @mutation()
  private SET_AVAILABLE_FEATURES(features: string[]) {
    this.state.availableFeatures = features;
  }

  get availableFeatures() {
    return this.state.availableFeatures || [];
  }

  featureIsEnabled(feature: EAvailableFeatures): boolean {
    if (Utils.isDevMode() || Utils.isPreview()) return true; //always show for dev mode and preview

    return this.availableFeatures.indexOf(feature) > -1;
  }

  async fetchAvailableFeatures() {
    // TODO: replace
  }
}
