import { mutation, StatefulService } from './core';

export interface SnackbarState {
  latest: {
    position: 'main' | 'niconico';
    message: string;
    action: {
      label: string;
      onClick: () => void;
    };
    hideDelay: number;
  } | null;
}

const DEFAULT_HIDE_DELAY = 5000; // 5 seconds

export class SnackbarService extends StatefulService<SnackbarState> {
  static initialState: SnackbarState = {
    latest: null,
  };

  show({
    position,
    message,
    action,
    hideDelay = DEFAULT_HIDE_DELAY,
  }: {
    position: 'main' | 'niconico';
    message: string;
    action?: { label: string; onClick: () => void };
    hideDelay?: number;
  }) {
    this.setState({
      latest: {
        position,
        message,
        action: action
          ? {
              label: action.label,
              onClick: () => {
                action.onClick();
                this.hide(); // Hide snackbar after action is clicked
              },
            }
          : null,
        hideDelay: hideDelay || DEFAULT_HIDE_DELAY,
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
