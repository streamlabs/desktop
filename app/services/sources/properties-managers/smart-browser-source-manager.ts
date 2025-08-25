import { PropertiesManager } from './properties-manager';
import { Inject } from 'services/core/injector';
import { WebsocketService } from 'services/websocket';
import { Subscription } from 'rxjs';
import { VisionService } from 'services/vision';

export class SmartBrowserSourceManager extends PropertiesManager {
  @Inject() private websocketService: WebsocketService;
  @Inject() visionService: VisionService;
  private socketSub!: Subscription;
  private sseSub!: Subscription;

  init() {
    this.socketSub = this.websocketService.socketEvent.subscribe(e => {
      console.log('WS event', e);

      if (['visionEvent', 'userStateUpdated'].includes(e.type)) {
        //@ts-ignore
        console.log('success', JSON.stringify(e));
        this.obsSource.sendMessage({ message: JSON.stringify(e) });
      }
    });
    this.visionService.ensureVision();
  }

  destroy() {
    this.socketSub?.unsubscribe();
    this.sseSub?.unsubscribe();
  }
}
