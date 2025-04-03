import { IJsonRpcEvent, IJsonRpcRequest, IJsonRpcResponse } from '../../app/services/api/jsonrpc';
import { Observable, Subject, Subscription } from 'rxjs';
import { first } from 'rxjs/operators';
import { isEqual } from 'lodash';

const net = require('net');
const { spawnSync } = require('child_process');
const snp = require('node-win32-np');

const PIPE_NAME = 'slobs';
const PIPE_PATH = `\\\\.\\pipe\\${PIPE_NAME}`;
const PROMISE_TIMEOUT = 20000;

let clientInstance: ApiClient = null;

export type TConnectionStatus = 'disconnected' | 'pending' | 'connected';

export class ApiClient {
  eventReceived = new Subject<IJsonRpcEvent>();
  messageReceived = new Subject<IJsonRpcResponse<any>>();

  private nextRequestId = 1;
  private socket: any;
  private resolveConnection: Function;
  private rejectConnection: Function;
  private requests = {};
  private subscriptions: Dictionary<Subject<any>> = {};
  private connectionStatus: TConnectionStatus = 'disconnected';

  /**
   * cached resourceSchemes
   */
  private resourceSchemes: Dictionary<Dictionary<string>> = {};

  /**
   * if result of calling a service method is promise -
   * we create a linked promise and keep it callbacks here until
   * the promise in the application will be resolved or rejected
   */
  private promises: Dictionary<Function[]> = {};

  // set to 'true' for debugging
  logsEnabled = false;

  connect() {
    if (this.socket) this.socket.destroy();

    this.socket = new net.Socket();
    this.bindListeners();

    this.log('connecting...');
    this.connectionStatus = 'pending';

    return new Promise((resolve, reject) => {
      this.resolveConnection = resolve;
      this.rejectConnection = reject;
      this.socket.connect(PIPE_PATH);
    });
  }

  bindListeners() {
    this.socket.on('connect', () => {
      this.log('connected');
      this.connectionStatus = 'connected';
      this.resolveConnection();
    });

    this.socket.on('error', (error: any) => {
      this.log('error', error);
      this.connectionStatus = 'disconnected';
      this.rejectConnection();
    });

    this.socket.on('data', (data: any) => {
      this.log(`Received: ${data}`);
      this.onMessageHandler(data);
    });

    this.socket.on('close', () => {
      this.connectionStatus = 'disconnected';
      this.log('Connection closed');
    });
  }

  disconnect() {
    this.socket.end();
    this.resolveConnection = null;
    this.rejectConnection = null;
  }

  getConnectionStatus(): TConnectionStatus {
    return this.connectionStatus;
  }

  log(...messages: string[]) {
    if (this.logsEnabled) console.log(...messages);
  }

  async request(resourceId: string, methodName: string, ...args: any[]) {
    if (this.connectionStatus === 'disconnected') {
      await this.connect();
    }

    const id = String(this.nextRequestId++);
    const requestBody: IJsonRpcRequest = {
      id,
      jsonrpc: '2.0',
      method: methodName,
      params: { args, resource: resourceId },
    };
    return this.sendMessage(requestBody);
  }

  requestSync(resourceId: string, methodName: string, ...args: string[]) {
    const id = String(this.nextRequestId++);
    const requestBody: IJsonRpcRequest = {
      id,
      jsonrpc: '2.0',
      method: methodName,
      params: { args, resource: resourceId },
    };

    const response = this.sendMessageSync(requestBody);
    const parsedResponse = JSON.parse(response.toString());
    this.log('Response Sync:', parsedResponse);

    if (parsedResponse.error) {
      throw parsedResponse.error;
    }

    return parsedResponse.result;
  }

  sendMessage(message: string | Object) {
    let requestBody: IJsonRpcRequest = message as IJsonRpcRequest;
    if (typeof message === 'string') {
      try {
        requestBody = JSON.parse(message);
      } catch (e) {
        throw 'Invalid JSON';
      }
    }

    if (!requestBody.id) throw 'id is required';

    return new Promise((resolve, reject) => {
      this.requests[requestBody.id] = {
        resolve,
        reject,
        body: requestBody,
        completed: false,
      };
      const rawMessage = `${JSON.stringify(requestBody)}\n`;
      this.log('Send async:', rawMessage);

      if (!this.socket.writable) {
        this.log('Socket is not writeable. Attempted to write:', rawMessage);
        reject(false);
      } else {
        this.socket.write(rawMessage);
      }
    });
  }

  sendMessageSync(message: string | Object) {
    let requestBody: IJsonRpcRequest = message as IJsonRpcRequest;
    if (typeof message === 'string') {
      try {
        requestBody = JSON.parse(message);
      } catch (e) {
        throw 'Invalid JSON';
      }
    }

    if (!requestBody.id) throw 'id is required';

    const rawMessage = `${JSON.stringify(requestBody)}\n`;
    this.log('Send sync:', rawMessage);

    const client = new snp.Client(PIPE_PATH);
    client.write(Buffer.from(rawMessage));

    /* \x0a is being used as a message delimiter for
     * JSON-RPC messages. */
    const response = client.read_until('\x0a');
    client.close();

    return Buffer.concat(response);
  }

  sendJson(json: string) {
    this.log('Send json:', json);
    this.socket.write(json);
  }

  onMessageHandler(data: ArrayBuffer) {
    data
      .toString()
      .split('\n')
      .forEach(rawMessage => {
        if (!rawMessage) return;
        const message = JSON.parse(rawMessage);
        this.messageReceived.next(message);

        // if message is response for an API call
        // than we should have a pending request object
        const request = this.requests[message.id];
        if (request) {
          if (message.error) {
            request.reject(message.error);
          } else {
            request.resolve(message.result);
          }
          delete this.requests[message.id];
        }

        const result = message.result;
        if (!result) return;

        if (result._type === 'EVENT') {
          if (result.emitter === 'STREAM') {
            const eventSubject = this.subscriptions[message.result.resourceId];
            this.eventReceived.next(result);
            if (eventSubject) eventSubject.next(result.data);
          } else if (result.emitter === 'PROMISE') {
            // case when listenAllSubscriptions = true
            if (!this.promises[result.resourceId]) return;

            const [resolve, reject] = this.promises[result.resourceId];
            if (result.isRejected) {
              reject(result.data);
            } else {
              resolve(result.data);
            }
          }
        }
      });
  }

  unsubscribe(subscriptionId: string): Promise<any> {
    delete this.subscriptions[subscriptionId];
    return this.request(subscriptionId, 'unsubscribe');
  }

  unsubscribeAll(): Promise<any> {
    return Promise.all(
      Object.keys(this.subscriptions).map(subscriptionId => this.unsubscribe(subscriptionId)),
    );
  }

  getResource<TResourceType>(resourceId: string, resourceModel = {}): TResourceType {
    const handleRequest = (resourceId: string, property: string, ...args: any[]): any => {
      const result = this.requestSync(resourceId, property as string, ...args);

      if (result && result._type === 'SUBSCRIPTION' && result.emitter === 'PROMISE') {
        return new Promise((resolve, reject) => {
          this.promises[result.resourceId] = [resolve, reject];
          setTimeout(
            () => reject(`promise timeout for ${resourceId}.${property}`),
            PROMISE_TIMEOUT,
          );
        });
        // tslint:disable-next-line:no-else-after-return
      } else if (result && result._type === 'SUBSCRIPTION' && result.emitter === 'STREAM') {
        let subject = this.subscriptions[result.resourceId];
        if (!subject) subject = this.subscriptions[result.resourceId] = new Subject();
        return subject;
      } else if (result && (result._type === 'HELPER' || result._type === 'SERVICE')) {
        return this.getResource(result.resourceId, result);
      } else {
        // result can contain helpers-objects

        if (Array.isArray(result)) {
          let i = result.length;
          while (i--) {
            const item = result[i];
            if (item._type !== 'HELPER') continue;
            result.splice(i, 1, this.getResource(item.resourceId, { ...item }));
          }
        }

        return result;
      }
    };

    return new Proxy(resourceModel, {
      get: (target, property: string, receiver) => {
        if (resourceModel[property] !== void 0) return resourceModel[property];

        const resourceScheme = this.getResourceScheme(resourceId);

        if (resourceScheme[property] !== 'function') {
          return handleRequest(resourceId, property as string);
        }

        return (...args: any[]) => {
          return handleRequest(resourceId, property as string, ...args);
        };
      },
    }) as TResourceType;
  }

  fetchNextEvent(): Promise<IJsonRpcEvent> {
    return new Promise((resolve, reject) => {
      this.eventReceived.pipe(first()).subscribe(event => resolve(event));
      setTimeout(() => reject('Promise timeout'), PROMISE_TIMEOUT);
    });
  }

  watchForEvents(eventNames: string[]): ApiEventWatcher {
    return new ApiEventWatcher(this, eventNames);
  }

  private getResourceTypeName(resourceId: string): string {
    return resourceId.split('[')[0];
  }

  private getResourceScheme(resourceId: string): Dictionary<string> {
    const resourceTypeName = this.getResourceTypeName(resourceId);

    if (!this.resourceSchemes[resourceTypeName]) {
      this.resourceSchemes[resourceTypeName] = this.requestSync(
        'ExternalApiService',
        'getResourceScheme',
        resourceId,
      );
    }

    return this.resourceSchemes[resourceTypeName];
  }
}

export async function getApiClient() {
  if (!clientInstance) clientInstance = new ApiClient();

  if (clientInstance.getConnectionStatus() === 'disconnected') {
    await clientInstance.connect();
    // Execute API requests even if API stopped receiving requests (when a scene collection is loading)
    await clientInstance.request('TcpServerService', 'forceRequests', [true]);
    await clientInstance.request('TcpServerService', 'listenAllSubscriptions');
  }

  return clientInstance;
}

/**
 * Watcher for testing API events
 */
class ApiEventWatcher {
  receivedEvents: IJsonRpcEvent[] = [];
  private subscriptions: Subscription[];
  private eventReceived = new Subject();

  constructor(private apiClient: ApiClient, private eventNames: string[]) {
    // start watching for events
    this.subscriptions = this.eventNames.map(eventName => {
      const [resourceId, prop] = eventName.split('.');
      const observable = this.apiClient.getResource(resourceId)[prop] as Observable<any>;
      return observable.subscribe(() => void 0);
    });

    this.apiClient.eventReceived.subscribe(event => this.onEventHandler(event));
  }

  /**
   * wait for API to emit events in the specific order
   */
  waitForSequence(eventNames: string[], timeout = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      // compare already received events with required order
      const checkSequence = () => {
        if (isEqual(this.getReceivedEventNames(), eventNames)) {
          resolve();
          return true;
        }
      };

      // check the situation when the all events are already received
      if (checkSequence()) return;

      // if events are not received then listen for them and wait until timeout
      const subscription = this.eventReceived.subscribe(checkSequence);
      setTimeout(() => {
        subscription.unsubscribe();
        reject(`Unexpected events sequence: \n${this.getReceivedEventNames().join('\n')}`);
      }, timeout);
    });
  }

  waitForAll(timeout?: number): Promise<void> {
    return this.waitForSequence(this.eventNames, timeout);
  }

  private getReceivedEventNames(): string[] {
    return this.receivedEvents.map(ev => ev.resourceId);
  }

  private onEventHandler(event: IJsonRpcEvent) {
    if (!this.eventNames.includes(event.resourceId)) return;
    this.receivedEvents.push(event);
    this.eventReceived.next();
  }
}
