import os from 'os';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { PersistentStatefulService, Inject, mutation, ViewHandler } from 'services/core';
import {
  JsonrpcService,
  E_JSON_RPC_ERROR,
  IJsonRpcEvent,
  IJsonRpcRequest,
  IJsonRpcResponse,
} from 'services/api/jsonrpc/index';
import { UsageStatisticsService } from 'services/usage-statistics';
import { ExternalApiService } from '../external-api';
// eslint-disable-next-line no-undef
import WritableStream = NodeJS.WritableStream;
import { $t } from 'services/i18n';
import { OS, getOS } from 'util/operating-systems';

const net = require('net');

const LOCAL_HOST_NAME = '127.0.0.1';
const WILDCARD_HOST_NAME = '0.0.0.0';
const SOCKET_NAME = 'slobs.sock';

function getUserDataPath(): string {
  if (process.env.SLOBS_CACHE_DIR) {
    return path.join(process.env.SLOBS_CACHE_DIR, 'slobs-client');
  }
  const appData =
    process.platform === 'win32'
      ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
      : path.join(os.homedir(), 'Library', 'Application Support');
  return path.join(appData, 'slobs-client');
}

export interface ITcpServersSettings {
  token: string;
  namedPipe: {
    pipeName: string;
  };
  websockets: {
    enabled: boolean;
    port: number;
    allowRemote: boolean;
  };
}

export interface IIPAddressDescription {
  address: string;
  interface: string;
  family: 'IPv4' | 'IPv6';
  internal: boolean;
}

interface IClient {
  id: number;
  socket: WritableStream;
  subscriptions: string[];
  isAuthorized: boolean;

  /**
   * Clients with listenAllSubscriptions=true receive events that have been sent to other clients.
   * This is helpful for tests.
   */
  listenAllSubscriptions: boolean;
}

interface IServer {
  type: string;
  nativeServer: {
    on(eventName: string, cb: (event: any) => any): any;
  };
  close(): void;
}

class TcpServerServiceViews extends ViewHandler<ITcpServersSettings> {
  get settings() {
    return this.state;
  }

  get metadata() {
    return {
      namedPipe: {
        pipeName: {
          type: 'text',
          label: $t('Pipe Name'),
        },
      },
      websockets: {
        enabled: {
          type: 'checkbox',
          label: $t('Enabled'),
          children: {
            allowRemote: {
              type: 'checkbox',
              label: $t('Allow Remote Connections'),
              displayed: this.state.websockets.enabled,
            },
            port: {
              type: 'number',
              label: $t('Port'),
              min: 0,
              max: 65535,
              displayed: this.state.websockets.enabled,
            },
          },
        },
      },
    };
  }
}

/**
 * A transport layer for TCP and Websockets communications with internal API
 */
export class TcpServerService extends PersistentStatefulService<ITcpServersSettings> {
  static defaultState: ITcpServersSettings = {
    token: '',
    namedPipe: {
      pipeName: 'slobs',
    },
    websockets: {
      enabled: false,
      port: 59650,
      allowRemote: false,
    },
  };

  @Inject() private jsonrpcService: JsonrpcService;
  @Inject() private usageStatisticsService: UsageStatisticsService;
  @Inject() private externalApiService: ExternalApiService;
  private clients: Dictionary<IClient> = {};
  private nextClientId = 1;
  private servers: IServer[] = [];
  private isRequestsHandlingStopped = false;
  private isEventsSendingStopped = true;

  // if true then execute API request even if "isRequestsHandlingStopped" flag is set
  private forceRequests = false;

  // enable to debug
  private enableLogs = false;

  get views() {
    return new TcpServerServiceViews(this.state);
  }

  init() {
    super.init();
    this.externalApiService.serviceEvent.subscribe(event => this.onServiceEventHandler(event));
  }

  listen() {
    if (getOS() === OS.Windows) {
      this.listenConnections(this.createNamedPipeServer());
    } else {
      this.listenConnections(this.createUnixSocketServer());
    }

    if (this.state.websockets.enabled) this.listenConnections(this.createWebsoketsServer());
  }

  /**
   * stop handle any requests
   * each API request will be responded with "API is busy" error
   */
  stopRequestsHandling(stopEventsToo = true) {
    this.isRequestsHandlingStopped = true;
    this.isEventsSendingStopped = stopEventsToo;
  }

  startRequestsHandling() {
    this.isRequestsHandlingStopped = false;
    this.isEventsSendingStopped = false;
  }

  stopListening() {
    this.servers.forEach(server => server.close());
    Object.keys(this.clients).forEach(clientId => this.disconnectClient(Number(clientId)));
  }

  get websocketRemoteConnectionEnabled() {
    return this.state.websockets.enabled && this.state.websockets.allowRemote;
  }

  enableWebsoketsRemoteConnections() {
    this.stopListening();

    // update websockets settings
    const defaultWebsoketsSettings = TcpServerService.defaultState.websockets;
    this.setSettings({
      websockets: {
        ...defaultWebsoketsSettings,
        enabled: true,
        allowRemote: true,
      },
    });

    this.listen();
  }

  disableWebsocketsRemoteConnections() {
    this.stopListening();
    // update websockets settings
    const defaultWebsoketsSettings = TcpServerService.defaultState.websockets;
    this.setSettings({
      websockets: {
        ...defaultWebsoketsSettings,
      },
    });

    this.listen();
  }

  restoreDefaultSettings() {
    this.setSettings(TcpServerService.defaultState);
  }

  setSettings(settings: Partial<ITcpServersSettings>) {
    const needToGenerateToken =
      settings.websockets && settings.websockets.allowRemote && !this.state.token;
    if (needToGenerateToken) this.generateToken();
    this.SET_SETTINGS(settings);
  }

  getSettings(): ITcpServersSettings {
    return this.state;
  }

  getIPAddresses(): IIPAddressDescription[] {
    const ifaces = os.networkInterfaces();
    const addresses: IIPAddressDescription[] = [];
    Object.keys(ifaces).forEach(ifaceName => {
      const iface = ifaces[ifaceName];
      iface.forEach(interfaceInfo => {
        addresses.push({
          interface: ifaceName,
          address: interfaceInfo.address,
          family: interfaceInfo.family,
          internal: interfaceInfo.internal,
        });
      });
    });

    // Sort IPv4 before IPv6
    return addresses.sort((a, b) => parseInt(a.family[3], 10) - parseInt(b.family[3], 10));
  }

  generateToken(): string {
    const buf = new Uint8Array(20);
    crypto.randomFillSync(buf);
    let token = '';
    buf.forEach(val => (token += val.toString(16)));
    this.setSettings({ token });
    return token;
  }

  private listenConnections(server: IServer) {
    this.servers.push(server);

    server.nativeServer.on('connection', socket => this.onConnectionHandler(socket, server));

    server.nativeServer.on('error', error => {
      throw error;
    });
  }

  private createNamedPipeServer(): IServer {
    const settings = this.state.namedPipe;
    const { createSecurePipe } = require('secure-pipe');
    const fd = createSecurePipe(settings.pipeName);
    const server = net.createServer();
    server.listen({ fd });
    return {
      type: 'namedPipe',
      nativeServer: server,
      close() {
        server.close();
      },
    };
  }

  private createUnixSocketServer(): IServer {
    const socketPath = path.join(getUserDataPath(), SOCKET_NAME);

    // Clean up stale socket file from a prior crash
    try {
      if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
    } catch (e: unknown) {
      console.warn('Failed to remove stale socket file', e);
    }

    const server = net.createServer();
    server.listen(socketPath);

    // Restrict to owner only — prevents other OS accounts from connecting
    fs.chmodSync(socketPath, 0o600);

    return {
      type: 'unixSocket',
      nativeServer: server,
      close() {
        server.close();
        try {
          if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
        } catch (e: unknown) {
          console.warn('Failed to clean up socket file', e);
        }
      },
    };
  }

  private createWebsoketsServer(): IServer {
    const settings = this.state.websockets;
    const http = require('http');
    const sockjs = require('sockjs');
    const websocketsServer = sockjs.createServer();
    const httpServer = http.createServer();
    websocketsServer.installHandlers(httpServer, { prefix: '/api' });
    httpServer.listen(settings.port, settings.allowRemote ? WILDCARD_HOST_NAME : LOCAL_HOST_NAME);
    return {
      type: 'websockets',
      nativeServer: websocketsServer,
      close() {
        httpServer.close();
      },
    };
  }

  private onConnectionHandler(socket: WritableStream, server: IServer) {
    this.log('new connection');

    const id = this.nextClientId++;
    const client: IClient = {
      id,
      socket,
      subscriptions: [],
      listenAllSubscriptions: false,
      isAuthorized: false,
    };
    this.clients[id] = client;
    this.log(`Id assigned ${id}`);

    // Named pipes (Windows) and Unix sockets (macOS) are protected by OS-level
    // file permissions, so only the owning user can connect. Auto-authorize them.
    // Websocket clients must authenticate with a token.
    if (server.type === 'namedPipe' || server.type === 'unixSocket') {
      this.authorizeClient(client);
    }

    socket.on('data', (data: Buffer) => {
      this.onRequestHandler(client, data.toString());
    });

    socket.on('end', () => {
      this.onDisconnectHandler(client);
    });

    socket.on('close', () => {
      this.onDisconnectHandler(client);
    });

    socket.on('error', e => {
      if (e.code === 'EPIPE') {
        // Client has silently disconnected
        console.debug('TCP Server: Socket was disconnected', e);
        this.onDisconnectHandler(client);
      } else {
        throw e;
      }
    });

    this.log(`Client ${id} ready`);
  }

  private authorizeClient(client: IClient) {
    client.isAuthorized = true;
  }

  private onRequestHandler(client: IClient, data: string) {
    this.log(`tcp request from ${client.id}`, data);

    if (this.isRequestsHandlingStopped && !this.forceRequests) {
      this.sendResponse(
        client,
        this.jsonrpcService.createError(null, {
          code: E_JSON_RPC_ERROR.INTERNAL_JSON_RPC_ERROR,
          message: 'API server is busy. Try again later',
        }),
        true,
      );

      return;
    }

    const requests = data.split('\n');

    for (const requestString of requests) {
      if (!requestString) return;
      try {
        const request: IJsonRpcRequest = JSON.parse(requestString);

        const errorMessage = this.validateRequest(request);

        if (errorMessage) {
          const errorResponse = this.jsonrpcService.createError(request, {
            code: E_JSON_RPC_ERROR.INVALID_PARAMS,
            message: errorMessage,
          });
          this.sendResponse(client, errorResponse);
          return;
        }

        // some requests have to be handled by TcpServerService
        if (this.hadleTcpServerDirectives(client, request)) return;

        const response = this.externalApiService.executeServiceRequest(request);

        // if response is subscription then add this subscription to client
        if (response.result && response.result._type === 'SUBSCRIPTION') {
          const subscriptionId = response.result.resourceId;
          if (!client.subscriptions.includes(subscriptionId)) {
            client.subscriptions.push(subscriptionId);
          }
        }

        this.sendResponse(client, response);
      } catch (e: unknown) {
        this.sendResponse(
          client,
          this.jsonrpcService.createError(null, {
            code: E_JSON_RPC_ERROR.INVALID_REQUEST,
            message:
              'Make sure that the request is valid json. ' +
              'If request string contains multiple requests, ensure requests are separated ' +
              'by a single newline character LF ( ASCII code 10)',
          }),
        );

        // Disconnect and stop processing requests
        // IMPORTANT: For security reasons it is important we immediately stop
        // processing requests that don't look will well formed JSON RPC calls.
        // Without this check, it is possible to send normal HTTP requests
        // from an unprivileged web page and make calls to this API.
        this.disconnectClient(client.id);
        return;
      }
    }
  }

  private onServiceEventHandler(event: IJsonRpcResponse<IJsonRpcEvent>) {
    // send event to subscribed clients
    Object.keys(this.clients).forEach(clientId => {
      const client = this.clients[clientId];
      const eventName = event.result.resourceId.split('.')[1];

      // these events will be sent to the client even if isRequestsHandlingStopped = true
      // this allows to send this event even if the app is in the loading state
      // TODO: This is pretty brittle - we should probably consider moving to filtering out
      // specific events, rather than filtering out all events by default.
      const allowlistedEvents = [
        'collectionWillSwitch',
        'collectionAdded',
        'collectionRemoved',
        'collectionSwitched',
        'collectionUpdated',
        'studioModeChanged',
      ];
      const force = (allowlistedEvents as string[]).includes(eventName);

      const needToSendEvent =
        client.listenAllSubscriptions || client.subscriptions.includes(event.result.resourceId);
      if (needToSendEvent) this.sendResponse(client, event, force);
    });
  }

  private validateRequest(request: IJsonRpcRequest): string {
    let message = '';
    if (!request.id) message += ' id is required;';
    if (!request.params) message += ' params is required;';
    if (request.params && !request.params.resource) message += ' resource is required;';
    return message;
  }

  private hadleTcpServerDirectives(client: IClient, request: IJsonRpcRequest) {
    // Prevent access to certain particularly sensitive services
    const protectedResources = ['FileManagerService'];

    if (protectedResources.includes(request.params.resource)) {
      this.sendResponse(
        client,
        this.jsonrpcService.createError(request, {
          code: E_JSON_RPC_ERROR.INTERNAL_JSON_RPC_ERROR,
          message: 'The requested resource is not available.',
        }),
      );

      return true;
    }

    // handle auth
    if (request.method === 'auth' && request.params.resource === 'TcpServerService') {
      if (this.state.token && request.params.args[0] === this.state.token) {
        this.authorizeClient(client);
        this.sendResponse(client, {
          jsonrpc: '2.0',
          id: request.id,
          result: true,
        });
      } else {
        this.sendResponse(
          client,
          this.jsonrpcService.createError(request, {
            code: E_JSON_RPC_ERROR.INTERNAL_JSON_RPC_ERROR,
            message: 'Invalid token',
          }),
        );
      }

      return true;
    }

    if (!client.isAuthorized) {
      this.sendResponse(
        client,
        this.jsonrpcService.createError(request, {
          code: E_JSON_RPC_ERROR.INTERNAL_JSON_RPC_ERROR,
          message: 'Authorization required. Use TcpServerService.auth(token) method',
        }),
      );
      return true;
    }

    // handle unsubscribing by clearing client subscriptions
    if (
      request.method === 'unsubscribe' &&
      this.externalApiService.subscriptions[request.params.resource]
    ) {
      const subscriptionInd = client.subscriptions.indexOf(request.params.resource);
      if (subscriptionInd !== -1) client.subscriptions.splice(subscriptionInd, 1);
      this.sendResponse(client, {
        jsonrpc: '2.0',
        id: request.id,
        result: subscriptionInd !== -1,
      });
      return true;
    }

    // handle `listenAllSubscriptions` directive
    if (
      request.method === 'listenAllSubscriptions' &&
      request.params.resource === 'TcpServerService'
    ) {
      client.listenAllSubscriptions = true;
      this.sendResponse(client, {
        jsonrpc: '2.0',
        id: request.id,
        result: true,
      });
      return true;
    }

    // set forceRequests flag
    // when forceRequest is true API responds even while loading a SceneCollection
    if (request.method === 'forceRequests' && request.params.resource === 'TcpServerService') {
      this.forceRequests = request.params.args[0];
      this.sendResponse(client, {
        jsonrpc: '2.0',
        id: request.id,
        result: true,
      });
      return true;
    }
  }

  private onDisconnectHandler(client: IClient) {
    this.log(`client disconnected ${client.id}`);
    delete this.clients[client.id];
  }

  private sendResponse(client: IClient, response: IJsonRpcResponse<any>, force = false) {
    if (this.isEventsSendingStopped) {
      if (!force && !this.forceRequests) return;
    }

    if (!client.socket.writable) {
      // prevent attempts to write to a closed socket

      this.log('cannot write to closed socket to send response', response);
      return;
    }

    // unhandled exceptions completely destroy Rx.Observable subscription
    try {
      this.log('send response', response);
      client.socket.write(`${JSON.stringify(response)}\n`);
    } catch (e: unknown) {
      // probably the client has been silently disconnected
      console.info('unable to send response', response, e);
    }
  }

  private disconnectClient(clientId: number) {
    const client = this.clients[clientId];
    client.socket.end();
    delete this.clients[clientId];
  }

  private log(...messages: any[]) {
    if (!this.enableLogs) return;
    console.log(...messages);
  }

  @mutation()
  private SET_SETTINGS(patch: Partial<ITcpServersSettings>) {
    this.state = { ...this.state, ...patch };
  }
}
