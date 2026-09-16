import { Inject } from 'services/core/injector';
import { Service } from 'services/core/service';
import { IObsListOption } from 'components/obs/inputs/ObsInput';
import {
  SimpleStreamingFactory,
  AdvancedStreamingFactory,
  SimpleRecordingFactory,
  AdvancedRecordingFactory,
  ServiceFactory,
  ERecordingFormat,
} from '../../../../obs-api';
import { StreamingService } from 'services/streaming';
import { TPlatform } from 'services/platforms';
import type { IEncoderOption } from 'obs-studio-node';
import type { TOutputSettingsMode } from './output-settings';
import { legacyEncoderAliasToObsEncoderIdOrSelf } from './encoder-compatibility';

interface IWithAvailableEncoders {
  getAvailableEncoders(): IEncoderOption[];
}

function mapEncoders(encoders: IEncoderOption[]): IObsListOption<string>[] {
  return encoders.map(e => ({ description: e.title, value: e.name }));
}

function hasGetAvailableEncoders(instance: any): instance is IWithAvailableEncoders {
  return typeof instance?.getAvailableEncoders === 'function';
}

const platformServiceConfig: Record<TPlatform, { streamType: string; service?: string }> = {
  twitch: { streamType: 'rtmp_common', service: 'Twitch' },
  youtube: { streamType: 'rtmp_common', service: 'YouTube - RTMPS' },
  facebook: { streamType: 'rtmp_common', service: 'Facebook Live' },
  tiktok: { streamType: 'rtmp_custom' },
  twitter: { streamType: 'rtmp_custom' },
  instagram: { streamType: 'rtmp_custom' },
  kick: { streamType: 'rtmp_custom' },
  patreon: { streamType: 'rtmp_custom' },
};

interface ICacheEntry {
  encoders: IEncoderOption[];
  options: IObsListOption<string>[];
}

function intersectEncoders(a: IEncoderOption[], b: IEncoderOption[]): IEncoderOption[] {
  return a.filter(encoder => b.some(other => other.name === encoder.name));
}

function findEncoder(
  encoders: IEncoderOption[],
  selectedEncoder: string,
): IEncoderOption | undefined {
  // Match both UI setting values and concrete OBS encoder ids. Legacy saved values
  // are normalized so old configs can still resolve to backend-owned metadata.
  const normalizedEncoder = legacyEncoderAliasToObsEncoderIdOrSelf(selectedEncoder);
  return encoders.find(encoder => {
    return (
      encoder.name === selectedEncoder ||
      encoder.id === selectedEncoder ||
      encoder.name === normalizedEncoder ||
      encoder.id === normalizedEncoder
    );
  });
}

export class EncoderQueryService extends Service {
  @Inject() private streamingService: StreamingService;

  private streamingEncoderCache = new Map<string, ICacheEntry>();
  private recordingEncoderCache = new Map<string, ICacheEntry>();

  getAvailableStreamingEncoders(mode: TOutputSettingsMode): IObsListOption<string>[] {
    return this.getStreamingEncoderEntry(mode).options;
  }

  /** Drops memoized encoder lists. Only needed if the registered encoder set itself changes. */
  clearCache() {
    this.streamingEncoderCache.clear();
    this.recordingEncoderCache.clear();
  }

  private getStreamingEncoderEntry(mode: TOutputSettingsMode): ICacheEntry {
    const targets = this.getTargetPlatforms();
    // Keyed on the full target set, so enabling or disabling a platform lands on a
    // different entry instead of reusing a list filtered for a different destination.
    const cacheKey = `${mode}:${targets.join('+') || 'none'}`;

    const cached = this.streamingEncoderCache.get(cacheKey);
    if (cached) return cached;

    try {
      // While live the running output already carries the real service. Read it straight
      // through rather than caching, so the list is not still live-derived once we stop.
      const live = this.streamingService.isIdle
        ? null
        : this.streamingService.getStreamingInstance();
      if (live && hasGetAvailableEncoders(live)) {
        const encoders = live.getAvailableEncoders();
        return { encoders, options: mapEncoders(encoders) };
      }

      const encoders = this.queryEncodersForTargets(mode, targets);
      if (!encoders.length) return { encoders: [], options: [] };

      const entry = { encoders, options: mapEncoders(encoders) };
      this.streamingEncoderCache.set(cacheKey, entry);
      return entry;
    } catch (e: unknown) {
      console.error('Error querying available streaming encoders', e);
      return { encoders: [], options: [] };
    }
  }

  /**
   * Every target receives the same encoded stream, so the usable set is the
   * intersection of what each enabled platform accepts. Custom destinations are
   * unconstrained and do not narrow it.
   */
  private queryEncodersForTargets(
    mode: TOutputSettingsMode,
    targets: TPlatform[],
  ): IEncoderOption[] {
    if (!targets.length) return this.queryEncodersForPlatform(mode, null);

    let usable: IEncoderOption[] | null = null;
    for (const platform of targets) {
      const encoders = this.queryEncodersForPlatform(mode, platform);
      // A platform we cannot query must not silently empty the list.
      if (!encoders.length) continue;
      usable = usable ? intersectEncoders(usable, encoders) : encoders;
    }

    return usable ?? [];
  }

  private queryEncodersForPlatform(
    mode: TOutputSettingsMode,
    platform: TPlatform | null,
  ): IEncoderOption[] {
    const instance: any =
      mode === 'Simple' ? SimpleStreamingFactory.create() : AdvancedStreamingFactory.create();
    let service: any = null;

    try {
      service = this.setupTempStreamingService(instance, platform);
      if (!hasGetAvailableEncoders(instance)) return [];
      return instance.getAvailableEncoders();
    } finally {
      if (mode === 'Simple') {
        SimpleStreamingFactory.destroy(instance);
      } else {
        AdvancedStreamingFactory.destroy(instance);
      }
      if (service) ServiceFactory.destroy(service);
    }
  }

  getAvailableRecordingEncoders(
    mode: TOutputSettingsMode,
    format: ERecordingFormat,
  ): IObsListOption<string>[] {
    return this.getRecordingEncoderEntry(mode, format).options;
  }

  private getRecordingEncoderEntry(
    mode: TOutputSettingsMode,
    format: ERecordingFormat,
  ): ICacheEntry {
    const cacheKey = `${mode}:${format}`;

    const cached = this.recordingEncoderCache.get(cacheKey);
    if (cached) return cached;

    try {
      const encoders = this.queryRecordingEncoders(mode, format);
      if (!encoders.length) return { encoders: [], options: [] };

      const entry = { encoders, options: mapEncoders(encoders) };
      this.recordingEncoderCache.set(cacheKey, entry);
      return entry;
    } catch (e: unknown) {
      console.error('Error querying available recording encoders', e);
      return { encoders: [], options: [] };
    }
  }

  private queryRecordingEncoders(
    mode: TOutputSettingsMode,
    format: ERecordingFormat,
  ): IEncoderOption[] {
    const existing = this.streamingService.getRecordingInstance();
    if (existing) {
      existing.format = format;
      if (hasGetAvailableEncoders(existing)) return existing.getAvailableEncoders();
    }

    const instance: any =
      mode === 'Simple' ? SimpleRecordingFactory.create() : AdvancedRecordingFactory.create();

    try {
      instance.format = format;
      if (!hasGetAvailableEncoders(instance)) return [];
      return instance.getAvailableEncoders();
    } finally {
      if (mode === 'Simple') {
        SimpleRecordingFactory.destroy(instance);
      } else {
        AdvancedRecordingFactory.destroy(instance);
      }
    }
  }

  getAvailableStreamingEncoderMetadata(mode: TOutputSettingsMode): IEncoderOption[] {
    return this.getStreamingEncoderEntry(mode).encoders;
  }

  getAvailableRecordingEncoderMetadata(
    mode: TOutputSettingsMode,
    format: ERecordingFormat,
  ): IEncoderOption[] {
    return this.getRecordingEncoderEntry(mode, format).encoders;
  }

  resolveStreamingEncoderId(mode: TOutputSettingsMode, selectedEncoder: string): string {
    const encoder = findEncoder(this.getAvailableStreamingEncoderMetadata(mode), selectedEncoder);

    if (encoder) return encoder.id;

    console.warn(`[EncoderQueryService] No metadata for streaming encoder ${selectedEncoder}`);
    return selectedEncoder;
  }

  resolveRecordingEncoderId(
    mode: TOutputSettingsMode,
    format: ERecordingFormat,
    selectedEncoder: string,
  ): string {
    const encoder = findEncoder(
      this.getAvailableRecordingEncoderMetadata(mode, format),
      selectedEncoder,
    );

    if (encoder) return encoder.id;

    console.warn(`[EncoderQueryService] No metadata for recording encoder ${selectedEncoder}`);
    return selectedEncoder;
  }

  resolveStreamingEncoderFamily(
    mode: TOutputSettingsMode,
    selectedEncoder: string,
  ): string | undefined {
    return findEncoder(this.getAvailableStreamingEncoderMetadata(mode), selectedEncoder)?.family;
  }

  resolveRecordingEncoderFamily(
    mode: TOutputSettingsMode,
    format: ERecordingFormat,
    selectedEncoder: string,
  ): string | undefined {
    return findEncoder(this.getAvailableRecordingEncoderMetadata(mode, format), selectedEncoder)
      ?.family;
  }

  resolveStreamingEncoderPreset(
    mode: TOutputSettingsMode,
    selectedEncoder: string,
  ): string | undefined {
    return findEncoder(this.getAvailableStreamingEncoderMetadata(mode), selectedEncoder)?.preset;
  }

  resolveStreamingEncoderCodec(
    mode: TOutputSettingsMode,
    selectedEncoder: string,
  ): string | undefined {
    return findEncoder(this.getAvailableStreamingEncoderMetadata(mode), selectedEncoder)?.codec;
  }

  resolveRecordingEncoderCodec(
    mode: TOutputSettingsMode,
    format: ERecordingFormat,
    selectedEncoder: string,
  ): string | undefined {
    return findEncoder(this.getAvailableRecordingEncoderMetadata(mode, format), selectedEncoder)
      ?.codec;
  }

  /**
   * Creates a temp OBS service and assigns it to the streaming instance.
   * Returns the created service so the caller can destroy it after use.
   */
  private setupTempStreamingService(instance: any, platform: TPlatform | null): any {
    try {
      const legacySettings = ServiceFactory.legacySettings;

      if (platform) {
        const config = platformServiceConfig[platform];
        const serviceName = config.service || legacySettings?.settings?.service;

        const service = ServiceFactory.create(config.streamType, 'encoder-query-temp-service', {
          ...legacySettings?.settings,
          service: serviceName,
        });
        instance.service = service;
        return service;
      } else {
        // No enabled platform — fall back to legacySettings
        instance.service = legacySettings;
        return null;
      }
    } catch (e: unknown) {
      console.error('[EncoderQueryService] setupTempService failed, proceeding without service', e);
      return null;
    }
  }

  /** Sorted so that the same set of platforms always produces the same cache key. */
  private getTargetPlatforms(): TPlatform[] {
    try {
      return [...this.streamingService.views.enabledPlatforms].sort();
    } catch (e: unknown) {
      return [];
    }
  }
}
