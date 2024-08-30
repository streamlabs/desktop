import { PersistentStatefulService } from 'services/core/persistent-stateful-service';
import { mutation } from 'services/core/stateful-service';
import { isAnonymous, getScore } from './ChatMessage/util';
import { WrappedMessage } from './WrappedChat';

export type NGSharingLevel = 'none' | 'low' | 'mid' | 'high';

interface INicoliveCommentLocalFilterState {
  level: NGSharingLevel;
  showAnonymous: boolean;
}

const LEVEL_TABLE = {
  none: Number.NEGATIVE_INFINITY,
  low: -10000,
  mid: -4800,
  high: -1000,
};

export class NicoliveCommentLocalFilterService extends PersistentStatefulService<INicoliveCommentLocalFilterState> {
  static defaultState = {
    level: 'mid',
    showAnonymous: true,
  };

  static get NG_SHARING_LEVELS(): NGSharingLevel[] {
    return ['none', 'low', 'mid', 'high'];
  }

  get level() {
    return this.state.level;
  }

  set level(level: NGSharingLevel) {
    this.SET_LEVEL(level);
  }

  get showAnonymous() {
    return this.state.showAnonymous;
  }

  set showAnonymous(showAnonymous: boolean) {
    this.SET_SHOW_ANONYMOUS(showAnonymous);
  }

  get filterFn() {
    const threshold = LEVEL_TABLE[this.state.level];
    return (message: WrappedMessage): boolean => {
      if (message.type !== 'normal') return true;

      const ngSharingOk = threshold < getScore(message.value);
      if (!ngSharingOk) return false;

      const anonymityOk = this.showAnonymous || !isAnonymous(message.value);
      if (!anonymityOk) return false;

      return true;
    };
  }

  @mutation() private SET_LEVEL(level: NGSharingLevel) {
    this.state = { ...this.state, level };
  }

  @mutation() private SET_SHOW_ANONYMOUS(showAnonymous: boolean) {
    this.state = { ...this.state, showAnonymous };
  }
}
