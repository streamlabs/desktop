import { PersistentStatefulService } from 'services/core/persistent-stateful-service';
import { mutation } from '../core/stateful-service';

interface IInformationsLastOpen {
  /** 最後にインフォ一覧を開いた時刻のミリ秒単位unixtime */
  lastOpen: number;
}

export class InformationsStateService extends PersistentStatefulService<IInformationsLastOpen> {
  static defaultState: IInformationsLastOpen = {
    lastOpen: 0,
  };

  get lastOpen() {
    return this.state.lastOpen;
  }

  updateLastOpen(now: number) {
    this.SET_LAST_OPEN(now);
  }

  @mutation()
  private SET_LAST_OPEN(time: number) {
    this.state.lastOpen = time;
  }
}
