import { PropertiesManager } from './properties-manager';
import { Inject } from 'services/core/injector';
import { WebsocketService } from 'services/websocket';
import { Subscription } from 'rxjs';
import { VisionService } from 'services/vision';

/**
 * Target origin for all reactive sources.
 * This enforces a consistent hostname across all reactive browser sources,
 * enabling centralized testing and deployment of new reactive overlay features.
 */
const REACTIVE_SOURCES_ORIGIN = 'https://alpha-sl-dynamic-overlays-demo.streamlabs.workers.dev';

/**
 * List of valid reactive source hostnames that should be normalized.
 * Any reactive browser source using one of these hostnames will be automatically
 * redirected to use REACTIVE_SOURCES_ORIGIN for consistency.
 */
const ALL_HOSTNAMES = [
  'reactive-sources.streamlabs.com',
  'alpha-sl-dynamic-overlays-demo.streamlabs.workers.dev',
  'sl-dynamic-overlays-demo.streamlabs.workers.dev',
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

      this.obsSource.save();
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
