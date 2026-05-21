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
  trovo: { streamType: 'rtmp_custom' },
  tiktok: { streamType: 'rtmp_custom' },
  twitter: { streamType: 'rtmp_custom' },
  instagram: { streamType: 'rtmp_custom' },
  kick: { streamType: 'rtmp_custom' },
  patreon: { streamType: 'rtmp_custom' },
};

interface ICacheEntry {
  key: string;
  encoders: IEncoderOption[];
  options: IObsListOption<string>[];
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

  private streamingEncoderCache: ICacheEntry | null = null;
  private recordingEncoderCache: ICacheEntry | null = null;

  getAvailableStreamingEncoders(mode: TOutputSettingsMode): IObsListOption<string>[] {
    const platform = this.getPrimaryPlatform();
    const cacheKey = `${mode}:${platform || 'none'}`;

    if (this.streamingEncoderCache?.key === cacheKey) {
      return this.streamingEncoderCache.options;
    }

    try {
      const existing = this.streamingService.getStreamingInstance();
      if (existing && hasGetAvailableEncoders(existing)) {
        const encoders = existing.getAvailableEncoders();
        const options = mapEncoders(encoders);
        this.streamingEncoderCache = { key: cacheKey, encoders, options };
        return options;
      }

      if (mode === 'Simple') {
        const instance = SimpleStreamingFactory.create();
        let service: any = null;
        try {
          service = this.setupTempStreamingService(instance);
          if (!hasGetAvailableEncoders(instance)) return [];
          const encoders = instance.getAvailableEncoders();
          const options = mapEncoders(encoders);
          this.streamingEncoderCache = { key: cacheKey, encoders, options };
          return options;
        } finally {
          SimpleStreamingFactory.destroy(instance);
          if (service) ServiceFactory.destroy(service);
        }
      } else {
        const instance = AdvancedStreamingFactory.create();
        let service: any = null;
        try {
          service = this.setupTempStreamingService(instance);
          if (!hasGetAvailableEncoders(instance)) return [];
          const encoders = instance.getAvailableEncoders();
          const options = mapEncoders(encoders);
          this.streamingEncoderCache = { key: cacheKey, encoders, options };
          return options;
        } finally {
          AdvancedStreamingFactory.destroy(instance);
          if (service) ServiceFactory.destroy(service);
        }
      }
    } catch (e: unknown) {
      console.error('Error querying available streaming encoders', e);
      return [];
    }
  }

  getAvailableRecordingEncoders(
    mode: TOutputSettingsMode,
    format: ERecordingFormat,
  ): IObsListOption<string>[] {
    const cacheKey = `${mode}:${format}`;

    if (this.recordingEncoderCache?.key === cacheKey) {
      return this.recordingEncoderCache.options;
    }

    try {
      const existing = this.streamingService.getRecordingInstance();
      if (existing && hasGetAvailableEncoders(existing)) {
        const encoders = existing.getAvailableEncoders();
        const options = mapEncoders(encoders);
        this.recordingEncoderCache = { key: cacheKey, encoders, options };
        return options;
      }

      if (mode === 'Simple') {
        const instance = SimpleRecordingFactory.create();
        try {
          instance.format = format;
          if (!hasGetAvailableEncoders(instance)) return [];
          const encoders = instance.getAvailableEncoders();
          const options = mapEncoders(encoders);
          this.recordingEncoderCache = { key: cacheKey, encoders, options };
          return options;
        } finally {
          SimpleRecordingFactory.destroy(instance);
        }
      } else {
        const instance = AdvancedRecordingFactory.create();
        try {
          instance.format = format;
          if (!hasGetAvailableEncoders(instance)) return [];
          const encoders = instance.getAvailableEncoders();
          const options = mapEncoders(encoders);
          this.recordingEncoderCache = { key: cacheKey, encoders, options };
          return options;
        } finally {
          AdvancedRecordingFactory.destroy(instance);
        }
      }
    } catch (e: unknown) {
      console.error('Error querying available recording encoders', e);
      return [];
    }
  }

  getAvailableStreamingEncoderMetadata(mode: TOutputSettingsMode): IEncoderOption[] {
    const platform = this.getPrimaryPlatform();
    const cacheKey = `${mode}:${platform || 'none'}`;

    this.getAvailableStreamingEncoders(mode);
    return this.streamingEncoderCache?.key === cacheKey ? this.streamingEncoderCache.encoders : [];
  }

  getAvailableRecordingEncoderMetadata(
    mode: TOutputSettingsMode,
    format: ERecordingFormat,
  ): IEncoderOption[] {
    const cacheKey = `${mode}:${format}`;

    this.getAvailableRecordingEncoders(mode, format);
    return this.recordingEncoderCache?.key === cacheKey ? this.recordingEncoderCache.encoders : [];
  }

  resolveStreamingEncoderId(
    mode: TOutputSettingsMode,
    selectedEncoder: string,
  ): string {
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
  private setupTempStreamingService(instance: any): any {
    try {
      const platform = this.getPrimaryPlatform();
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

  private getPrimaryPlatform(): TPlatform | null {
    try {
      const enabledPlatforms = this.streamingService.views.enabledPlatforms;
      if (!enabledPlatforms.length) return null;
      return enabledPlatforms[0];
    } catch (e: unknown) {
      return null;
    }
  }
}
