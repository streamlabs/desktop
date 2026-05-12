import { PropertiesManager } from './properties-manager';
import { Inject } from 'services/core/injector';
import { WebsocketService } from 'services/websocket';
import { Subscription } from 'rxjs';
import { VisionService } from 'services/vision';
import { TObsFormData } from 'components/obs/inputs/ObsInput';

/**
 * Target origin for all reactive sources.
 * This enforces a consistent hostname across all reactive browser sources,
 * enabling centralized testing and deployment of new reactive overlay features.
 */
const REACTIVE_SOURCES_ORIGIN = 'https://v2-sl-dynamic-overlays-demo.streamlabs.workers.dev';

export const USER_STATE_SCHEMA_URL = `${REACTIVE_SOURCES_ORIGIN}/schema.json`;

/**
 * List of valid reactive source hostname patterns that should be normalized.
 * Any reactive browser source using one of these hostnames will be automatically
 * redirected to use REACTIVE_SOURCES_ORIGIN for consistency.
 * Supports wildcards (*) for matching dynamic subdomains.
 */
const HOSTNAME_PATTERNS = [
  'reactive-sources.streamlabs.com',
  '*-sl-dynamic-overlays-demo.streamlabs.workers.dev',
  'sl-dynamic-overlays-demo.streamlabs.workers.dev',
];

/**
 * Converts a wildcard pattern to a RegExp.
 * Supports * as a wildcard that matches any characters.
 */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const regexPattern = escaped.replace(/\*/g, '.*');
  return new RegExp(`^${regexPattern}$`);
}

/**
 * Checks if a hostname matches any of the defined patterns.
 */
function matchesHostnamePattern(hostname: string): boolean {
  return HOSTNAME_PATTERNS.some(pattern => patternToRegex(pattern).test(hostname));
}

export class SmartBrowserSourceManager extends PropertiesManager {
  @Inject() private websocketService: WebsocketService;
  @Inject() visionService: VisionService;
  private socketSub!: Subscription;

  normalizeUrl(formUrl?: string): string | undefined {
    const hasSourceUrl = this.obsSource.settings.url && this.obsSource.settings.url !== '';
    const url = hasSourceUrl ? this.obsSource.settings.url : formUrl;

    // If the source is new, there might not be a url yet because the user hasn't input it
    if (!url) return;

    const { hostname, origin } = new URL(url);

    if (matchesHostnamePattern(hostname) && origin !== REACTIVE_SOURCES_ORIGIN) {
      const updatedUrl = url.replace(origin, REACTIVE_SOURCES_ORIGIN);

      // Update source if it exists
      if (hasSourceUrl) {
        this.obsSource.update({
          ...this.settings,
          url: updatedUrl,
        });

        this.obsSource.save();
      }

      return updatedUrl;
    }

    return url;
  }

  init() {
    // todo: switch over to consume from ReactiveDataService
    this.socketSub = this.websocketService.socketEvent.subscribe(e => {
      // send all visionEvents and userStateUpdated to smart sources
      if (['visionEvent', 'userStateUpdated'].includes(e.type)) {
        this.obsSource.sendMessage({ message: JSON.stringify(e) });
      }
    });

    this.normalizeUrl();
  }

  setPropertiesFormData(properties: TObsFormData): void {
    const isLocalFile =
      (super.getPropertiesFormData().find(prop => prop.name === 'is_local_file')
        ?.value as boolean) || false;

    // If the source is not a local file, normalize the URL to prevent errors loading the source
    // in various reactive source versions
    const updatedProperties = !isLocalFile
      ? properties.map(prop =>
          prop.name === 'url' ? { ...prop, value: this.normalizeUrl(prop.value as string) } : prop,
        )
      : properties;

    super.setPropertiesFormData(updatedProperties);
  }

  destroy() {
    this.socketSub?.unsubscribe();
  }
}
