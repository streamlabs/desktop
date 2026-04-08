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

export class EncoderQueryService extends Service {
  @Inject() private streamingService: StreamingService;

  getAvailableStreamingEncoders(
    mode: 'Simple' | 'Advanced',
    streamSettings?: Record<string, any>,
  ): IObsListOption<string>[] {
    try {
      // Try to use an existing streaming instance first
      const existing = this.streamingService.getStreamingInstance();
      if (existing && hasGetAvailableEncoders(existing)) {
        console.log('[EncoderQueryService] streaming: using existing instance');
        const encoders = existing.getAvailableEncoders();
        console.log(`[EncoderQueryService] streaming: result=${JSON.stringify(mapEncoders(encoders))}`);
        return mapEncoders(encoders);
      }

      // Fallback: create a temporary instance with service configured
      console.log('[EncoderQueryService] streaming: no existing instance, creating temporary');
      if (mode === 'Simple') {
        const instance = SimpleStreamingFactory.create();
        try {
          this.setupTempStreamingService(instance);
          if (!hasGetAvailableEncoders(instance)) {
            console.log('[EncoderQueryService] streaming: temp Simple instance has no getAvailableEncoders');
            return [];
          }
          const encoders = instance.getAvailableEncoders();
          console.log(`[EncoderQueryService] streaming: temp Simple result=${JSON.stringify(mapEncoders(encoders))}`);
          return mapEncoders(encoders);
        } finally {
          SimpleStreamingFactory.destroy(instance);
        }
      } else {
        const instance = AdvancedStreamingFactory.create();
        try {
          this.setupTempStreamingService(instance);
          if (!hasGetAvailableEncoders(instance)) {
            console.log('[EncoderQueryService] streaming: temp Advanced instance has no getAvailableEncoders');
            return [];
          }
          const encoders = instance.getAvailableEncoders();
          console.log(`[EncoderQueryService] streaming: temp Advanced result=${JSON.stringify(mapEncoders(encoders))}`);
          return mapEncoders(encoders);
        } finally {
          AdvancedStreamingFactory.destroy(instance);
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
    try {
      // Try to use an existing recording instance first
      const existing = this.streamingService.getRecordingInstance();
      if (existing && hasGetAvailableEncoders(existing)) {
        console.log('[EncoderQueryService] recording: using existing instance');
        const encoders = existing.getAvailableEncoders();
        console.log(`[EncoderQueryService] recording: result=${JSON.stringify(mapEncoders(encoders))}`);
        return mapEncoders(encoders);
      }

      // Fallback: create a temporary instance
      console.log('[EncoderQueryService] recording: no existing instance, creating temporary');
      if (mode === 'Simple') {
        const instance = SimpleRecordingFactory.create();
        try {
          instance.format = format;
          if (!hasGetAvailableEncoders(instance)) {
            console.log('[EncoderQueryService] recording: temp Simple instance has no getAvailableEncoders');
            return [];
          }
          const encoders = instance.getAvailableEncoders();
          console.log(`[EncoderQueryService] recording: temp Simple format=${format} result=${JSON.stringify(mapEncoders(encoders))}`);
          return mapEncoders(encoders);
        } finally {
          SimpleRecordingFactory.destroy(instance);
        }
      } else {
        const instance = AdvancedRecordingFactory.create();
        try {
          instance.format = format;
          if (!hasGetAvailableEncoders(instance)) {
            console.log('[EncoderQueryService] recording: temp Advanced instance has no getAvailableEncoders');
            return [];
          }
          const encoders = instance.getAvailableEncoders();
          console.log(`[EncoderQueryService] recording: temp Advanced format=${format} result=${JSON.stringify(mapEncoders(encoders))}`);
          return mapEncoders(encoders);
        } finally {
          AdvancedRecordingFactory.destroy(instance);
        }
      }
    } catch (e: unknown) {
      console.error('Error querying available recording encoders', e);
      return [];
    }
  }

  private setupTempStreamingService(instance: any): void {
    try {
      const platform = this.getPrimaryPlatform();
      const legacySettings = ServiceFactory.legacySettings;

      if (platform) {
        const config = platformServiceConfig[platform];
        const serviceName = config.service || legacySettings.settings?.service;
        console.log(`[EncoderQueryService] setupTempService: platform=${platform}, streamType=${config.streamType}, service=${serviceName}`);

        const service = ServiceFactory.create(
          config.streamType,
          'encoder-query-temp-service',
          { ...legacySettings.settings, service: serviceName },
        );
        instance.service = service;
      } else {
        // No enabled platform — fall back to legacySettings
        console.log(`[EncoderQueryService] setupTempService: no enabled platform, using legacySettings=${JSON.stringify(legacySettings?.settings)}`);
        instance.service = legacySettings;
      }
    } catch (e: unknown) {
      console.error('[EncoderQueryService] setupTempService failed, proceeding without service', e);
    }
  }

  private getPrimaryPlatform(): TPlatform | null {
    try {
      const enabledPlatforms = this.streamingService.views.enabledPlatforms;
      if (!enabledPlatforms.length) return null;
      console.log(`[EncoderQueryService] enabledPlatforms=${JSON.stringify(enabledPlatforms)}`);
      return enabledPlatforms[0];
    } catch (e: unknown) {
      console.error('[EncoderQueryService] failed to get enabled platforms', e);
      return null;
    }
  }
}
