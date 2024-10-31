import electron from 'electron';
import { Subscription } from 'rxjs';
import { InternalApiService } from 'services/api/internal-api';
import { IJsonRpcEvent, IJsonRpcRequest, IJsonRpcResponse } from 'services/api/jsonrpc';
import { Inject } from 'services/core/injector';
import { Service } from '../../core/service';

const { ipcRenderer } = electron;

/**
 * A transport layer for IPC communications between services in the child and main window
 */
export class IpcServerService extends Service {
  servicesEventsSubscription: Subscription;
  requestHandler: (event: Electron.IpcRendererEvent, request: IJsonRpcRequest) => void;

  @Inject() private internalApiService: InternalApiService;

  listen() {
    this.requestHandler = (event: Electron.IpcRendererEvent, request: IJsonRpcRequest) => {
      const response: IJsonRpcResponse<any> = this.exec(request);
      ipcRenderer.send('services-response', response);
    };
    ipcRenderer.on('services-request', this.requestHandler);
    ipcRenderer.send('services-ready');

    this.servicesEventsSubscription = this.internalApiService.serviceEvent.subscribe(event =>
      this.sendEvent(event),
    );
  }

  exec(request: IJsonRpcRequest) {
    return this.internalApiService.executeServiceRequest(request);
  }

  stopListening() {
    ipcRenderer.removeListener('services-request', this.requestHandler);
    this.servicesEventsSubscription.unsubscribe();
  }

  private sendEvent(event: IJsonRpcResponse<IJsonRpcEvent>) {
    ipcRenderer.send('services-message', event);
  }
}
