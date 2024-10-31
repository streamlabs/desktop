import { Subject } from 'rxjs';
import { StatefulService, mutation } from './core/stateful-service';

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

  navigate(page: TAppPage, params: Dictionary<string> = {}) {
    this.NAVIGATE(page, params);
    this.navigated.next(this.state);
  }

  @mutation()
  private NAVIGATE(page: TAppPage, params: Dictionary<string>) {
    this.state.currentPage = page;
    this.state.params = params;
  }
}
