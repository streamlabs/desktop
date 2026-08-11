import { Service } from 'services/core/service';
import electron from 'electron';
import { Subscription } from 'rxjs';
import { IJsonRpcRequest, IJsonRpcResponse, IJsonRpcEvent } from 'services/api/jsonrpc';
import { Inject } from 'services/core/injector';
import { InternalApiService } from 'services/api/internal-api';

const { ipcRenderer } = electron;

/**
 * A transport layer for the service IPC: runs in the worker window, receives
 * service requests from the UI windows, and returns responses and events.
 */
export class IpcServerService extends Service {
  servicesEventsSubscription: Subscription;
  requestHandler: (event: Electron.Event, request: IJsonRpcRequest) => void;

  @Inject() private internalApiService: InternalApiService;

  listen() {
    this.requestHandler = (event: Electron.Event, request: IJsonRpcRequest) => {
      const response: IJsonRpcResponse<any> = this.exec(request);

      if (!request.params.noReturn) {
        try {
          ipcRenderer.send('services-response', response);
        } catch (e: unknown) {
          console.error('Failed to send services response', e, {
            request,
            response,
          });
        }
      }
    };
    ipcRenderer.on('services-request', this.requestHandler);
    ipcRenderer.send('services-ready');

    this.servicesEventsSubscription = this.internalApiService.serviceEvent.subscribe(event => {
      // wrap in try/catch to prevent un-subscribing in the case of failure
      try {
        this.sendEvent(event);
      } catch (e: unknown) {
        console.error(
          'Failed to send event to an IPC client. Make sure the object is serializable',
          e,
          event,
        );
      }
    });
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
