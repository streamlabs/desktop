import { Subject } from 'rxjs';
import { StatefulService, mutation } from './core/stateful-service';
import * as Sentry from '@sentry/vue';
import Utils from './utils';

type TAppPage = 'Studio' | 'Onboarding' | 'PatchNotes';

interface INavigationState {
  currentPage: TAppPage;
  params: Dictionary<string>;
}

export class NavigationService extends StatefulService<INavigationState> {
  static initialState: INavigationState = {
    currentPage: 'Studio',
    params: {},
  };

  navigated = new Subject<INavigationState>();

  init(): void {
    super.init();
    this.logNavigation();
  }

  navigate(page: TAppPage, params: Dictionary<string> = {}) {
    this.NAVIGATE(page, params);
    this.logNavigation();
    this.navigated.next(this.state);
  }

  logNavigation() {
    const { currentPage, params } = this.state;
    Sentry.addBreadcrumb({
      category: 'navigate',
      message: currentPage,
      data: {
        params,
      },
    });
    const scope = Sentry.getCurrentScope();
    scope.setTag('navigation', currentPage);
    if (Utils.isDevMode()) {
      console.log('navigate', currentPage, params);
    }
  }

  @mutation()
  private NAVIGATE(page: TAppPage, params: Dictionary<string>) {
    this.state.currentPage = page;
    this.state.params = params;
  }
}
