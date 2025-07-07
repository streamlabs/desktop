import { PropertiesManager } from './properties-manager';
import { Inject } from 'services/core/injector';
import { WebsocketService } from 'services/websocket';
import { SseService  } from 'services/server-sent-events';
import { Subscription } from 'rxjs'; 

export class SmartBrowserSourceManager extends PropertiesManager {
  @Inject() private websocketService: WebsocketService;
	@Inject() private sseService: SseService ;

  private socketSub!: Subscription;
  private sseSub!: Subscription;

  init() {
    this.socketSub = this.websocketService.socketEvent.subscribe(e => {
      console.log('WS event', e);
      this.obsSource.sendMessage({ message: JSON.stringify(e) });
    });

    this.sseSub = this.sseService.open('http://localhost:8000/events').subscribe((e: any) => {
      this.obsSource.sendMessage({ message: e.data });
    });
  }

  destroy() {
    this.socketSub?.unsubscribe();
    this.sseSub?.unsubscribe();
  }
}