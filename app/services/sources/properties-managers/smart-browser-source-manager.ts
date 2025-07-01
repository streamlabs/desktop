import { PropertiesManager } from './properties-manager';
import { Inject } from 'services/core/injector';
import { WebsocketService } from 'services/websocket';
import { Subscription } from 'rxjs'; 

export class SmartBrowserSourceManager extends PropertiesManager {
  @Inject() private websocketService: WebsocketService;

  private socketSub!: Subscription;
  private sseSub!: Subscription;

  init() {
    this.socketSub = this.websocketService.socketEvent.subscribe(event => {
      console.log('WS event', event);
      this.obsSource.sendMessage({ message: JSON.stringify(event) });
    });

    this.websocketService.openSSEConnection();
    this.sseSub = this.websocketService.sseEvent.subscribe(e => {
      this.obsSource.sendMessage({ message: e.data });
    });
  }

  destroy() {
    this.socketSub?.unsubscribe();
    this.sseSub?.unsubscribe();
		// to completely yeet sse connections:
    // this.websocketService.closeSSEConnection();
  }
}