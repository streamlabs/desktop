// This class provides the "glue" between the node-obs module
// and the Vue app. This class is intended to be a singleton.

import { Service } from './core/service';
import electron from 'electron';
const { ipcRenderer } = electron;
import * as remote from '@electron/remote';
export * from '../../obs-api';

let idCounter = 0;
const callbacks = {};

// Behaves just like the node-obs library, but proxies
// all methods via the main process
export const nodeObs: Dictionary<Function> = new Proxy(
  {},
  {
    get(target, key) {
      return (...args: any[]) => {
        const mappedArgs = args.map(arg => {
          if (typeof arg === 'function') {
            idCounter += 1;

            callbacks[idCounter] = arg;

            return {
              __obsCallback: true,
              id: idCounter,
            };
          }

          return arg;
        });

        return ipcRenderer.sendSync('obs-apiCall', {
          method: key,
          args: mappedArgs,
        });
      };
    },
  },
);

ipcRenderer.on('obs-apiCallback', (event: Electron.Event, cbInfo: any) => {
  callbacks[cbInfo.id](...cbInfo.args);
});

export class ObsApiService extends Service {
  nodeObs = nodeObs;

  isObsInstalled() {
    return nodeObs.OBS_API_isOBS_installed();
  }

  selectSource(x: number, y: number) {
    nodeObs.OBS_content_selectSource(x, y);
  }

  getObsProfiles(): string[] {
    return nodeObs.OBS_API_getOBS_existingProfiles();
  }

  getObsSceneCollections(): string[] {
    return nodeObs.OBS_API_getOBS_existingSceneCollections();
  }
}
