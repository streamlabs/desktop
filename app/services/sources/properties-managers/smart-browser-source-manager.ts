import { PropertiesManager } from './properties-manager';
import { Inject } from 'services/core/injector';
import { WebsocketService } from 'services/websocket';
import { SseService  } from 'services/server-sent-events';
import { Subscription } from 'rxjs';

export class SmartBrowserSourceManager extends PropertiesManager {
  @Inject() private websocketService: WebsocketService;

  private socketSub!: Subscription;
  private sseSub!: Subscription;

  init() {
    this.socketSub = this.websocketService.socketEvent.subscribe(e => {
      console.log('WS event', e);

      if (['visionEvent', 'userStateUpdated'].includes(e.type)) {
        //@ts-ignore
        this.obsSource.sendMessage({ message: JSON.stringify(e) });
      }
    });

    // this.sseSub = this.sseService.open('http://localhost:8000/events').subscribe((e: any) => {
    //   //@ts-ignore
    //   this.obsSource.sendMessage({ message: e.data });
    // });

		// obs.NodeObs.RegisterSourceMessageCallback((message: any) => {
		// 	console.log('source message received', message);
		// });
  }

  destroy() {
    this.socketSub?.unsubscribe();
    this.sseSub?.unsubscribe();
  }
}