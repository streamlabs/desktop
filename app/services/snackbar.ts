import { mutation, StatefulService } from './core';

export interface SnackbarState {
  latest: {
    position: 'main' | 'niconico';
    message: string;
    action: {
      label: string;
      onClick: () => void;
    };
  } | null;
}

export class SnackbarService extends StatefulService<SnackbarState> {
  static initialState: SnackbarState = {
    latest: null,
  };

  show(
    position: 'main' | 'niconico',
    message: string,
    action?: { label: string; onClick: () => void },
  ) {
    this.setState({
      latest: {
        position,
        message,
        action,
      },
    });
  }

  hide() {
    this.setState({ latest: null });
  }

  setState(state: SnackbarState) {
    this.SET_STATE(state);
  }

  @mutation()
  SET_STATE(nextState: SnackbarState): void {
    this.state = nextState;
  }
}
