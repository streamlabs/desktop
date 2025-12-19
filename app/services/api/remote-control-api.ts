import os from 'os';
import { authorizedHeaders, jfetch } from 'util/requests';
import { importSocketIOClient } from 'util/slow-imports';
import { ObjectSchema } from 'realm';
import { InitAfter, Inject, Service } from 'services/core';
import { RealmObject } from 'services/realm';
import { ExternalApiService, HostsService, UserService } from 'app-services';
import {
  JsonrpcService,
  E_JSON_RPC_ERROR,
  IJsonRpcRequest,
  IJsonRpcResponse,
  IJsonRpcEvent,
} from 'services/api/jsonrpc/index';

export interface IConnectedDevice {
  socketId: string;
  deviceName: string;
  clientType: string;
}

interface ISLRemoteResponse {
  success: boolean;
  message: 'OK';
  data: {
    url: string;
    token: string;
  };
}

class ConnectedDevice extends RealmObject {
  socketId: string;
  deviceName: string;
  clientType: string;

  static schema: ObjectSchema = {
    name: 'ConnectedDevice',
    embedded: true,
    properties: {
      socketId: 'string',
      deviceName: 'string',
      clientType: 'string',
    },
  };
}

ConnectedDevice.register();

class RemoteControlEphemeralState extends RealmObject {
  devices: IConnectedDevice[];

  static schema: ObjectSchema = {
    name: 'RemoteControlEphemeralState',
    properties: {
      devices: {
        type: 'list',
        objectType: 'ConnectedDevice',
        default: [] as ConnectedDevice[],
      },
    },
  };
}

RemoteControlEphemeralState.register();

class RemoteControlPresistentState extends RealmObject {
  enabled: boolean;

  static schema: ObjectSchema = {
    name: 'RemoteControlPersistentState',
    properties: {
      enabled: { type: 'bool', default: false },
    },
  };
}

RemoteControlPresistentState.register({ persist: true });

@InitAfter('UserService')
export class RemoteControlService extends Service {
  @Inject() hostsService: HostsService;
  @Inject() userService: UserService;
  @Inject() externalApiService: ExternalApiService;
  @Inject() jsonRpcService: JsonrpcService;

  state = RemoteControlPresistentState.inject();
  connectedDevices = RemoteControlEphemeralState.inject();

  socket: SocketIOClient.Socket;

  init() {
    super.init();
    this.userService.userLogin.subscribe(() => {
      if (this.state.enabled) this.createStreamlabsRemoteConnection();
    });
    this.externalApiService.serviceEvent.subscribe(event => {
      this.sendMessage(event);
    });
  }

  disconnect() {
    this.setEnableRemoteConnection(false);
    this.socket.disconnect();
    this.socket = undefined;
    this.setConnectedDevices([]);
  }

  disconnectDevice(socketId: string) {
    if (this.socket) {
      this.socket.emit('disconnectDevice', { socketId }, (response: any) => {
        if (!response.error) {
          this.removeConnectedDevice(socketId);
        }
      });
    }
  }

  async createStreamlabsRemoteConnection() {
    if (!this.userService.isLoggedIn) return;
    this.setEnableRemoteConnection(true);
    const io = await importSocketIOClient();
    const url = `https://${
      this.hostsService.streamlabs
    }/api/v5/slobs/modules/mobile-remote-io/config?device_name=${os.hostname()}`;
    const headers = authorizedHeaders(this.userService.apiToken);

    const resp: ISLRemoteResponse = await jfetch(new Request(url, { headers }));
    if (resp.success) {
      const socket = io.default(`${resp.data.url}?token=${resp.data.token}`, {
        transports: ['websocket'],
        reconnection: false,
      });

      socket.emit('getDevices', {}, (devices: IConnectedDevice[]) => {
        this.setConnectedDevices(devices);
      });

      this.socket = socket;
      this.listen();
    }
  }

  listen() {
    if (this.socket) {
      this.socket.on('message', (data: Buffer, callback: Function) => {
        const response = this.requestHandler(data.toString());
        callback(this.formatEvent(response));
      });

      this.socket.on('deviceConnected', (device: IConnectedDevice) => {
        const devices = this.connectedDevices.devices;
        if (devices.find(d => d.socketId === device.socketId)) return;
        this.setConnectedDevices(devices.concat([device]));
      });

      this.socket.on('deviceDisconnected', (device: IConnectedDevice) => {
        this.removeConnectedDevice(device.socketId);
      });

      this.socket.on('error', (e: unknown) => {
        throw e;
      });

      this.socket.on('disconnect', (reason: string) => {
        if (reason !== 'io client disconnect') {
          this.createStreamlabsRemoteConnection();
        }
      });
    }
  }

  sendMessage(event: IJsonRpcResponse<IJsonRpcEvent>) {
    if (this.socket) {
      try {
        this.socket.emit('message', this.formatEvent(event), (response: any) => {
          if (response.error) throw response.error;
        });
      } catch (e: unknown) {
        console.error('Unable to send message', e);
      }
    }
  }

  private requestHandler(data: string) {
    const requests = data.split('\n');

    for (const requestString of requests) {
      if (!requestString) return;
      try {
        const request: IJsonRpcRequest = JSON.parse(requestString);

        const errorMessage = this.validateRequest(request);

        if (errorMessage) {
          const errorResponse = this.jsonRpcService.createError(request, {
            code: E_JSON_RPC_ERROR.INVALID_PARAMS,
            message: errorMessage,
          });
          return errorResponse;
        }

        // Prevent access to certain particularly sensitive services
        const protectedResources = ['FileManagerService'];

        if (protectedResources.includes(request.params.resource)) {
          const err = this.jsonRpcService.createError(request, {
            code: E_JSON_RPC_ERROR.INTERNAL_JSON_RPC_ERROR,
            message: 'The requested resource is not available.',
          });
          return err;
        }

        const response = this.externalApiService.executeServiceRequest(request);

        return response;
      } catch (e: unknown) {
        const errorResponse = this.jsonRpcService.createError(null, {
          code: E_JSON_RPC_ERROR.INVALID_REQUEST,
          message:
            'Make sure that the request is valid json. ' +
            'If request string contains multiple requests, ensure requests are separated ' +
            'by a single newline character LF ( ASCII code 10)',
        });

        // Disconnect and stop processing requests
        // IMPORTANT: For security reasons it is important we immediately stop
        // processing requests that don't look will well formed JSON RPC calls.
        // Without this check, it is possible to send normal HTTP requests
        // from an unprivileged web page and make calls to this API.
        this.disconnect();
        return errorResponse;
      }
    }
  }

  private formatEvent(event: IJsonRpcResponse<any>) {
    return `${JSON.stringify(event)}\n`;
  }

  private validateRequest(request: IJsonRpcRequest): string {
    let message = '';
    if (!request.id) message += ' id is required;';
    if (!request.params) message += ' params is required;';
    if (request.params && !request.params.resource) message += ' resource is required;';
    return message;
  }

  setEnableRemoteConnection(val: boolean) {
    this.state.db.write(() => {
      this.state.enabled = val;
    });
  }

  setConnectedDevices(devices: IConnectedDevice[]) {
    this.connectedDevices.db.write(() => {
      this.connectedDevices.devices = devices.filter(device => device.deviceName !== os.hostname());
    });
  }

  removeConnectedDevice(socketId: string) {
    this.connectedDevices.db.write(() => {
      this.connectedDevices.devices = this.connectedDevices.devices.filter(
        d => d.socketId !== socketId,
      );
    });
  }
}
