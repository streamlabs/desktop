import electron from 'electron';
import { Observable, Subject } from 'rxjs';
import { IJsonRpcEvent, IJsonRpcResponse, IMutation, JsonrpcService } from 'services/api/jsonrpc';
import * as traverse from 'traverse';
import { Service } from '../core/service';
import { ServicesManager } from '../../services-manager';
import { commitMutation } from '../../store';
import { ServiceHelper } from 'services/core';
import Utils from 'services/utils';
import { RealmObject, RealmService } from 'services/realm';
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
   * Similar to promises, but holds promises specifically waiting for
   * async action responses.
   */
  private actionResponses: Dictionary<Function[]> = {};

  /**
   * almost the same as `promises` but for keeping subscriptions
   */
  private subscriptions: Dictionary<Subject<any>> = {};

  private windowId = Utils.getWindowId();

  constructor() {
    this.listenWorkerWindowMessages();
  }

  /**
   * All services methods calls will be sent to the main window
   * TODO: add more comments and try to refactor
   */
  applyIpcProxy(service: Service, isAction = false, shouldReturn = false): Service {
    const availableServices = Object.keys(this.servicesManager.services);
    if (!availableServices.includes(service.constructor.name)) return service;

    return new Proxy(service, {
      get: (target, property, receiver) => {
        if (property === 'actions') {
          return this.applyIpcProxy(target, true);
        }

        if (isAction && property === 'return') {
          return this.applyIpcProxy(target, true, true);
        }

        // TODO: index
        // @ts-ignore
        if (!target[property]) return target[property];

        // TODO: index
        // @ts-ignore
        if (typeof target[property] !== 'function' && !(target[property] instanceof Observable)) {
          // TODO: index
          // @ts-ignore
          return target[property];
        }

        if (
          // TODO: index
          // @ts-ignore
          typeof target[property] === 'function' &&
          // TODO: index
          // @ts-ignore
          target[property]['__executeInCurrentWindow']
        ) {
          // TODO: index
          // @ts-ignore
          return target[property];
        }

        const methodName = property.toString();
        // TODO: index
        // @ts-ignore
        const isHelper = target['_isHelper'];

        // TODO: Remove once you're sure this is impossible
        if (isHelper) {
          throw new Error('ATTEMPTED TO PROXY HELPER METHOD');
        }

        const handler = this.getRequestHandler(target, methodName, {
          isAction,
          shouldReturn,
        });

        // TODO: index
        // @ts-ignore
        if (typeof target[property] === 'function') return handler;
        // TODO: index
        // @ts-ignore
        if (target[property] instanceof Observable) return handler();
      },
    });
  }

  getRequestHandler(
    target: any,
    methodName: string,
    options: { isAction: boolean; shouldReturn: boolean },
  ) {
    const serviceName = target.constructor.name;
    const isHelper = target['_isHelper'];
    const resourceId = isHelper ? target['_resourceId'] : serviceName;
    const isObservable = target[methodName] instanceof Observable;
    const isDevMode = Utils.isDevMode();

    return (...args: any[]) => {
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

      if (options.isAction || isObservable) {
        const request = this.jsonrpc.createRequestWithOptions(
          resourceId,
          methodName as string,
          {
            compactMode: true,
            fetchMutations: options.shouldReturn,
            noReturn: !options.shouldReturn,
          },
          ...args,
        );

        try {
          ipcRenderer.send('services-request-async', request);
        } catch (e: unknown) {
          console.error('Failed to send async services request', e, {
            request,
          });
          throw e; // Re-raise original exception
        }

        if (isObservable) {
          const observableResourceId = `${resourceId}.${methodName}`;

          return (this.subscriptions[observableResourceId] =
            this.subscriptions[observableResourceId] || new Subject());
        }

        if (options.shouldReturn) {
          // Return a promise that will be fulfilled later with the response
          return new Promise((resolve, reject) => {
            this.actionResponses[request.id] = [resolve, reject];
          });
        }

        // We don't care about the response
        return;
      }

      let startMark: number;

      if (isDevMode) {
        const msg = `Calling synchronous service method from renderer process: ${resourceId}.${methodName} - Consider calling as an action instead`;
        const func = Utils.env.SLOBS_TRACE_SYNC_IPC ? console.trace : console.warn;

        func(msg);

        startMark = performance.now();
      }

      const response: IJsonRpcResponse<any> = electron.ipcRenderer.sendSync(
        'services-request',
        this.jsonrpc.createRequestWithOptions(
          resourceId,
          methodName,
          { compactMode: true, fetchMutations: true, windowId: this.windowId },
          ...args,
        ),
      );

      if (isDevMode) {
        const measure = performance.now() - startMark;

        if (measure > 50) {
          console.warn(
            `Synchronous method ${resourceId}.${methodName} took ${measure.toFixed(
              2,
            )}ms to execute`,
          );
        }
      }

      if (response.error) {
        throw new Error('IPC request failed: check the errors in the worker window');
      }

      const result = response.result;
      const mutations = response.mutations;

      mutations.forEach(commitMutation);

      return this.handleResult(result);
    };
  }

  /**
   * Handles a services response result and processes special cases
   * such as promises, event subscriptions, helpers, and services.
   * @param result The processed result
   */
  handleResult(result: any) {
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
      return helper;
    }

    if (result && result._type === 'REALM_OBJECT') {
      return RealmService.registeredClasses[result.realmType].fromId(result.resourceId);
    }

    // payload can contain helpers-objects
    // we have to wrap them in IpcProxy too
    traverse(result).forEach((item: any) => {
      if (item && item._type === 'HELPER') {
        return this.getResource(item.resourceId);
      }

      if (item && item._type === 'REALM_OBJECT') {
        return RealmService.registeredClasses[result.realmType].fromId(result.resourceId);
      }
    });

    return result;
  }

  getResource(resourceId: string) {
    // ServiceManager already applied the proxy-function to all services in the ChildWindow
    return this.servicesManager.getResource(resourceId);
  }

  /**
   * just a shortcut for static functions in JsonrpcService
   */
  get jsonrpc() {
    return JsonrpcService;
  }

  /**
   *  The worker window sends results of promises resolve/reject and
   *  RXJS events as JSON messages via IPC to the renderer windows
   *  Listen and handle these messages here
   */
  private listenWorkerWindowMessages() {
    const promises = this.promises;

    ipcRenderer.on('services-response-async', (e, response: IJsonRpcResponse<any>) => {
      if (response.error) {
        this.actionResponses[response.id][1](response.error);
        return;
      }

      response.mutations.forEach(commitMutation);
      const result = this.handleResult(response.result);

      if (result instanceof Promise) {
        // Roll this promise into the original response promise
        result
          .then(r => this.actionResponses[response.id][0](r))
          .catch(r => this.actionResponses[response.id][1](r));
      } else {
        this.actionResponses[response.id][0](result);
      }
    });

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
