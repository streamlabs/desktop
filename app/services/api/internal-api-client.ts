import electron from 'electron';
import { Observable, Subject } from 'rxjs';
import { IJsonRpcEvent, IJsonRpcResponse, IMutation, JsonrpcService } from 'services/api/jsonrpc';
import * as traverse from 'traverse';
import { Service } from '../core/service';
import { ServicesManager } from '../../services-manager';
import { commitMutation } from '../../store';
const { ipcRenderer } = electron;

/**
 * A client for communication with internalApi
 * Only the child window and one-off windows instantiate this class
 */
export class InternalApiClient {
  private servicesManager: ServicesManager = ServicesManager.instance;

  /**
   * If the result of calling a service method in the main window is promise -
   * we create a linked promise in the child window and keep its callbacks here until
   * the promise in the main window will be resolved or rejected
   */
  private promises: Dictionary<Function[]> = {};
  /**
   * almost the same as `promises` but for keeping subscriptions
   */
  private subscriptions: Dictionary<Subject<any>> = {};

  private skippedMutationsCount = 0;

  constructor() {
    this.listenMainWindowMessages();
  }

  /**
   * All services methods calls will be sent to the main window
   * TODO: add more comments and try to refactor
   */
  applyIpcProxy(service: Service): Service {
    const availableServices = Object.keys(this.servicesManager.services);
    if (!availableServices.includes(service.constructor.name)) return service;

    return new Proxy(service, {
      get: (target: { [key: string | symbol]: any }, property, receiver) => {
        if (!target[property]) return target[property];

        if (target[property]._isHelper) {
          return this.applyIpcProxy(target[property]);
        }

        if (Reflect.getMetadata('executeInCurrentWindow', target, property as string)) {
          return target[property];
        }

        if (typeof target[property] !== 'function' && !(target[property] instanceof Observable)) {
          return target[property];
        }

        const serviceName = target.constructor.name;
        const methodName = property;
        const isHelper = target['_isHelper'];

        const handler = (...args: any[]) => {
          // args may contain ServiceHelper objects
          // serialize them
          traverse(args).forEach((item: any) => {
            if (item && item._isHelper) {
              return {
                _type: 'HELPER',
                resourceId: item._resourceId,
              };
            }
          });

          const response: IJsonRpcResponse<any> = electron.ipcRenderer.sendSync(
            'services-request',
            this.jsonrpc.createRequestWithOptions(
              isHelper ? target['_resourceId'] : serviceName,
              methodName as string,
              { compactMode: true, fetchMutations: true },
              ...args,
            ),
          );

          if (response.error) {
            throw Error('IPC request failed: check the errors in the main window');
          }

          const result = response.result;
          const mutations = response.mutations;

          // commit all mutations caused by the api-request now
          mutations.forEach(mutation => commitMutation(mutation));
          // we'll still receive already committed mutations from async IPC event
          // mark them as ignored
          this.skippedMutationsCount += mutations.length;

          if (result && result._type === 'SUBSCRIPTION') {
            if (result.emitter === 'PROMISE') {
              return new Promise((resolve, reject) => {
                const promiseId = result.resourceId;
                this.promises[promiseId] = [resolve, reject];
              });
            }

            if (result.emitter === 'STREAM') {
              return (this.subscriptions[result.resourceId] =
                this.subscriptions[result.resourceId] || new Subject());
            }
          }

          if (result && (result._type === 'HELPER' || result._type === 'SERVICE')) {
            const helper = this.getResource(result.resourceId);
            return this.applyIpcProxy(helper);
          }

          // payload can contain helpers-objects
          // we have to wrap them in IpcProxy too
          traverse(result).forEach((item: any) => {
            if (item && item._type === 'HELPER') {
              const helper = this.getResource(item.resourceId);
              return this.applyIpcProxy(helper);
            }
          });
          return result;
        };

        if (typeof target[property] === 'function') return handler;
        if (target[property] instanceof Observable) return handler();
      },
    }) as Service;
  }

  getResource(resourceId: string) {
    // ServiceManager already applied the proxy-function to all services in the ChildWindow
    return this.servicesManager.getResource(resourceId);
  }

  handleMutation(mutation: IMutation) {
    if (this.skippedMutationsCount) {
      // this mutation is already committed
      this.skippedMutationsCount--;
      return;
    }
    commitMutation(mutation);
  }

  /**
   * just a shortcut for static functions in JsonrpcService
   */
  get jsonrpc() {
    return JsonrpcService;
  }

  /**
   *  The main window sends results of promises resolve/reject and RXJS events as JSON messages via
   * IPC to the child window
   *  Listen and handle these messages here
   */
  private listenMainWindowMessages() {
    const promises = this.promises;

    ipcRenderer.on(
      'services-message',
      (event: Electron.Event, message: IJsonRpcResponse<IJsonRpcEvent>) => {
        // handle only `EVENT` messages here
        if (message.result._type !== 'EVENT') return;

        // handle promise reject/resolve
        if (message.result.emitter === 'PROMISE') {
          const promisePayload = message.result;
          if (promisePayload) {
            // skip the promise result if this promise has been created from another window
            if (!promises[promisePayload.resourceId]) return;

            // resolve or reject the promise depending on the response from the main window
            const [resolve, reject] = promises[promisePayload.resourceId];
            const callback = promisePayload.isRejected ? reject : resolve;
            callback(promisePayload.data);
            delete promises[promisePayload.resourceId];
          }
        } else if (message.result.emitter === 'STREAM') {
          // handle RXJS events
          const resourceId = message.result.resourceId;
          if (!this.subscriptions[resourceId]) return;
          this.subscriptions[resourceId].next(message.result.data);
        }
      },
    );
  }
}
