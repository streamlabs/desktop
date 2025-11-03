import { PropertiesManager } from './properties-manager';
import { Inject } from 'services/core/injector';
import { WebsocketService } from 'services/websocket';
import { Subscription } from 'rxjs';
import { VisionService } from 'services/vision';

const REACTIVE_SOURCES_ORIGIN = 'https://alpha-sl-dynamic-overlays-demo.streamlabs.workers.dev';
const ALL_HOSTNAMES = [
  'reactive-sources.streamlabs.com',
  'alpha-sl-dynamic-overlays-demo.streamlabs.workers.dev',
  'sl-dynamic-overlays-demo.streamlabs.workers.dev',
  'tmaneri-m4',
];

export class SmartBrowserSourceManager extends PropertiesManager {
  @Inject() private websocketService: WebsocketService;
  @Inject() visionService: VisionService;
  private socketSub!: Subscription;

  normalizeUrl() {
    const url = this.obsSource.settings.url;

    const { hostname, origin } = new URL(url);

    if (ALL_HOSTNAMES.includes(hostname) && origin !== REACTIVE_SOURCES_ORIGIN) {
      this.obsSource.update({
        ...this.settings,
        url: url.replace(origin, REACTIVE_SOURCES_ORIGIN),
      });
    }
  }

  init() {
    this.normalizeUrl();

    // todo: switch over to consume from UserStateService
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
  }
}
