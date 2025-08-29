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

      // send all visionEvents and userStateUpdated to smart sources
      if (['visionEvent', 'userStateUpdated'].includes(e.type)) {
        this.obsSource.sendMessage({ message: JSON.stringify(e) });
      }
    });

    this.visionService.ensureRunning();
  }

  destroy() {
    this.socketSub?.unsubscribe();
    this.sseSub?.unsubscribe();
  }
}
