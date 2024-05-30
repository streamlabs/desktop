import { BehaviorSubject } from 'rxjs';
import { Inject, StatefulService, mutation } from 'services/core';
import { IPlatformAuth } from 'services/platforms';
import { UserService } from 'services/user';
import { KonomiTag } from './NicoliveClient';
import { NicoliveProgramService } from './nicolive-program';

interface IKonomiTagsState {
  loggedIn: {
    userId: string;
    konomiTags: KonomiTag[];
  } | null;
}

export class KonomiTagsService extends StatefulService<IKonomiTagsState> {
  @Inject() private userService: UserService;
  @Inject() private nicoliveProgramService: NicoliveProgramService;

  private stateChangeSubject = new BehaviorSubject(this.state);
  stateChange = this.stateChangeSubject.asObservable();

  static initialState: IKonomiTagsState = {
    loggedIn: null,
  };

  init(): void {
    super.init();

    const updateUserLoginState = (user: IPlatformAuth | void) => {
      if (user) {
        this.setState({
          loggedIn: {
            userId: user.platform.id,
            konomiTags: [],
          },
        });
        this.fetch();
      } else {
        this.setState(KonomiTagsService.initialState);
      }
    };

    this.userService.userLoginState.subscribe({
      next: updateUserLoginState,
    });
    updateUserLoginState(this.userService.state.auth);
  }

  fetch() {
    if (this.state.loggedIn) {
      this.nicoliveProgramService.client.fetchKonomiTags(this.state.loggedIn.userId).then(tags => {
        this.setState({
          loggedIn: {
            userId: this.state.loggedIn!.userId,
            konomiTags: tags,
          },
        });
      });
    }
  }

  private setState(partialState: Partial<IKonomiTagsState>) {
    const nextState = {
      ...this.state,
      ...partialState,
    };
    this.SET_STATE(nextState);
    this.stateChangeSubject.next(nextState);
  }

  @mutation()
  private SET_STATE(nextState: IKonomiTagsState): void {
    this.state = nextState;
  }
}
