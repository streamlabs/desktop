import { Inject } from 'services/core/injector';
import { authorizedHeaders, jfetch } from 'util/requests';
import { mutation, StatefulService, ViewHandler } from 'services/core/stateful-service';
import { UserService } from 'services/user';
import { HostsService } from './hosts';
import Utils from 'services/utils';
import { InitAfter } from './core';
import { AppService } from './app';
import { getOS, OS } from 'util/operating-systems';

export enum EAvailableFeatures {
  platform = 'slobs--platform',
  creatorSites = 'slobs--creator-sites',
  facebookOnboarding = 'slobs--facebook-onboarding',
  twitter = 'slobs--twitter',
  restream = 'slobs--restream',
  tiktok = 'slobs--tiktok',
  highlighter = 'slobs--highlighter',
  aiHighlighter = 'slobs--ai-highlighter',
  growTab = 'slobs--grow-tab',
  themeAudit = 'slobs--theme-audit',
  reactWidgets = 'slobs--react-widgets',
  sharedStorage = 'slobs--shared-storage',

  /**
   * There are two flags because one is used for beta access and
   * grandfathering access, whereas the other is for production
   * availability at launch.
   */
  guestCamBeta = 'slobs--guest-join',
  guestCamProduction = 'slobs--guest-join-prod',
  newChatBox = 'core--widgets-v2--chat-box',
}

interface IIncrementalRolloutServiceState {
  availableFeatures: string[];
}

@InitAfter('UserService')
export class IncrementalRolloutService extends StatefulService<IIncrementalRolloutServiceState> {
  @Inject() private userService: UserService;
  @Inject() private hostsService: HostsService;
  @Inject() private appService: AppService;

  static initialState: IIncrementalRolloutServiceState = {
    availableFeatures: [],
  };

  /**
   * Available features are fetched async.  This is normally not a problem,
   * as they are reactive.  However, any service logic that happens during
   * initialization probably needs to wait on this promise before accessing
   * the list of available features.
   */
  featuresReady: Promise<void>;

  private featuresReadyResolve: () => void;

  init() {
    this.featuresReady = new Promise(resolve => {
      this.featuresReadyResolve = resolve;
    });

    this.setCommandLineFeatures();

    this.userService.userLogin.subscribe(() => this.fetchAvailableFeatures());
    this.userService.userLogout.subscribe(() => this.resetAvailableFeatures());
  }

  get views() {
    return new IncrementalRolloutView(this.state);
  }

  @mutation()
  private SET_AVAILABLE_FEATURES(features: string[]) {
    this.state.availableFeatures = features;
  }

  fetchAvailableFeatures() {
    if (this.userService.isLoggedIn) {
      const host = this.hostsService.streamlabs;
      const url = `https://${host}/api/v5/slobs/available-features`;
      const headers = authorizedHeaders(this.userService.apiToken);
      const request = new Request(url, { headers });

      return jfetch<{ features: string[] }>(request).then(response => {
        this.SET_AVAILABLE_FEATURES([...this.state.availableFeatures, ...response.features]);
        this.featuresReadyResolve();
      });
    }
  }

  setCommandLineFeatures() {
    this.appService.state.argv.forEach(arg => {
      const match = arg.match(/^\-\-feature-enable\-([a-zA-Z\-]*)$/);

      if (match) {
        this.SET_AVAILABLE_FEATURES([...this.state.availableFeatures, match[1]]);
      }
    });
  }

  resetAvailableFeatures() {
    this.SET_AVAILABLE_FEATURES([]);

    // Command line features are always available
    this.setCommandLineFeatures();
  }
}

class IncrementalRolloutView extends ViewHandler<IIncrementalRolloutServiceState> {
  get availableFeatures() {
    return this.state.availableFeatures || [];
  }

  featureIsEnabled(feature: EAvailableFeatures): boolean {
    if (Utils.isDevMode()) return true; // always show for dev mode

    if (feature === EAvailableFeatures.aiHighlighter && getOS() !== OS.Windows) {
      return false;
    }

    return this.availableFeatures.indexOf(feature) > -1;
  }
}
