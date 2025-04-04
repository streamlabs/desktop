import { PersistentStatefulService } from 'services/core/persistent-stateful-service';
import { getKeys } from 'util/getKeys';
import Vue from 'vue';
import { mutation } from './core/stateful-service';

export enum EDismissable {
  SceneCollectionsHelpTip = 'scene_collections_help_tip',
  LoginHelpTip = 'login_help_tip',
  InitialHelpTip = 'initial_help_tip',
}

const InitiallyDismissed = new Set<EDismissable>([]);

interface IDismissablesServiceState {
  [key: string]: boolean;
}

/**
 * A dismissable is anything that is shown by default, can be dismissed and
 * show up again if needed, like a help tip.
 */
export class DismissablesService extends PersistentStatefulService<IDismissablesServiceState> {
  shouldShow(key: EDismissable): boolean {
    if (!(key in this.state)) {
      return !InitiallyDismissed.has(key);
    }
    return !this.state[key];
  }

  dismiss(key: EDismissable) {
    this.DISMISS(key);
  }

  reset(key: EDismissable) {
    this.RESET(key);
  }

  dismissAll() {
    getKeys(EDismissable).forEach(key => this.dismiss(EDismissable[key]));
  }

  resetAll() {
    getKeys(EDismissable).forEach(key => this.reset(EDismissable[key]));
  }

  @mutation()
  DISMISS(key: EDismissable) {
    Vue.set(this.state, key, true);
  }

  @mutation()
  RESET(key: EDismissable) {
    Vue.set(this.state, key, false);
  }
}
