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

/**
 * The module.ts in obs-studio-node is out of sync with module.d.ts and is
 * missing getAvailableEncoders and IEncoderOption.  TypeScript resolves
 * .ts over .d.ts, so we declare the shapes we need locally.
 */
interface IEncoderOption {
  title: string;
  name: string;
}

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
};

interface ICacheEntry {
  key: string;
  value: IObsListOption<string>[];
  timestamp: number;
}

const CACHE_TTL_MS = 2000;

export class EncoderQueryService extends Service {
  @Inject() private streamingService: StreamingService;

  private streamingEncoderCache: ICacheEntry | null = null;
  private recordingEncoderCache: ICacheEntry | null = null;

  getAvailableStreamingEncoders(
    mode: 'Simple' | 'Advanced',
    streamSettings?: Record<string, any>,
  ): IObsListOption<string>[] {
    const platform = this.getPrimaryPlatform();
    const cacheKey = `${mode}:${platform || 'none'}`;
    const now = Date.now();

    if (
      this.streamingEncoderCache &&
      this.streamingEncoderCache.key === cacheKey &&
      now - this.streamingEncoderCache.timestamp < CACHE_TTL_MS
    ) {
      return this.streamingEncoderCache.value;
    }

    try {
      // Try to use an existing streaming instance first
      const existing = this.streamingService.getStreamingInstance();
      if (existing && hasGetAvailableEncoders(existing)) {
        console.log('[EncoderQueryService] streaming: using existing instance');
        const result = mapEncoders(existing.getAvailableEncoders());
        this.streamingEncoderCache = { key: cacheKey, value: result, timestamp: now };
        return result;
      }

      // Fallback: create a temporary instance with service configured
      console.log('[EncoderQueryService] streaming: creating temporary instance');
      if (mode === 'Simple') {
        const instance = SimpleStreamingFactory.create();
        let service: any = null;
        try {
          service = this.setupTempStreamingService(instance);
          if (!hasGetAvailableEncoders(instance)) {
            return [];
          }
          const result = mapEncoders(instance.getAvailableEncoders());
          this.streamingEncoderCache = { key: cacheKey, value: result, timestamp: now };
          return result;
        } finally {
          SimpleStreamingFactory.destroy(instance);
          if (service) ServiceFactory.destroy(service);
        }
      } else {
        const instance = AdvancedStreamingFactory.create();
        let service: any = null;
        try {
          service = this.setupTempStreamingService(instance);
          if (!hasGetAvailableEncoders(instance)) {
            return [];
          }
          const result = mapEncoders(instance.getAvailableEncoders());
          this.streamingEncoderCache = { key: cacheKey, value: result, timestamp: now };
          return result;
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
    mode: 'Simple' | 'Advanced',
    format: ERecordingFormat,
  ): IObsListOption<string>[] {
    const cacheKey = `${mode}:${format}`;
    const now = Date.now();

    if (
      this.recordingEncoderCache &&
      this.recordingEncoderCache.key === cacheKey &&
      now - this.recordingEncoderCache.timestamp < CACHE_TTL_MS
    ) {
      return this.recordingEncoderCache.value;
    }

    try {
      // Try to use an existing recording instance first
      const existing = this.streamingService.getRecordingInstance();
      if (existing && hasGetAvailableEncoders(existing)) {
        console.log('[EncoderQueryService] recording: using existing instance');
        const result = mapEncoders(existing.getAvailableEncoders());
        this.recordingEncoderCache = { key: cacheKey, value: result, timestamp: now };
        return result;
      }

      // Fallback: create a temporary instance
      console.log('[EncoderQueryService] recording: creating temporary instance');
      if (mode === 'Simple') {
        const instance = SimpleRecordingFactory.create();
        try {
          instance.format = format;
          if (!hasGetAvailableEncoders(instance)) {
            return [];
          }
          const result = mapEncoders(instance.getAvailableEncoders());
          this.recordingEncoderCache = { key: cacheKey, value: result, timestamp: now };
          return result;
        } finally {
          SimpleRecordingFactory.destroy(instance);
        }
      } else {
        const instance = AdvancedRecordingFactory.create();
        try {
          instance.format = format;
          if (!hasGetAvailableEncoders(instance)) {
            return [];
          }
          const result = mapEncoders(instance.getAvailableEncoders());
          this.recordingEncoderCache = { key: cacheKey, value: result, timestamp: now };
          return result;
        } finally {
          AdvancedRecordingFactory.destroy(instance);
        }
      }
    } catch (e: unknown) {
      console.error('Error querying available recording encoders', e);
      return [];
    }
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
        console.log(`[EncoderQueryService] setupTempService: platform=${platform}, streamType=${config.streamType}, service=${serviceName}`);

        const service = ServiceFactory.create(
          config.streamType,
          'encoder-query-temp-service',
          { ...legacySettings?.settings, service: serviceName },
        );
        instance.service = service;
        return service;
      } else {
        // No enabled platform — fall back to legacySettings
        instance.service = legacySettings;
        return null; // don't destroy legacySettings, it's shared
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
      console.error('[EncoderQueryService] failed to get enabled platforms', e);
      return null;
    }
  }
}
