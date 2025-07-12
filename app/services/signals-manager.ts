import { StatefulService } from 'services/core';
import { IOBSOutputSignalInfo } from './core/signals';
import * as obs from '../../obs-api';

type SignalCallback = (info: IOBSOutputSignalInfo) => void;
export interface ISignalCallbacks {
  signalCallbacks: SignalCallback[];
}

export class SignalsService extends StatefulService<ISignalCallbacks> {
  static initialState: ISignalCallbacks = {
    signalCallbacks: [],
  };

  init() {
    obs.NodeObs.OBS_service_connectOutputSignals((info: IOBSOutputSignalInfo) => {
      for (const callback of this.state.signalCallbacks) {
        callback(info);
      }
    });
  }

  public addCallback(callback: SignalCallback) {
    this.state.signalCallbacks.push(callback);
  }
}
