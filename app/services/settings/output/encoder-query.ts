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

interface IStreamingEncoderResult {
  // null = the query failed; [] = a confirmed empty intersection. Callers that need to
  // fall back only on failure (not on a real empty result) rely on this distinction.
  encoders: IEncoderOption[] | null;
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

  /**
   * The dropdown list: the intersection of what every enabled target platform accepts,
   * with the currently selected encoder's option re-appended from the device list when
   * the intersection dropped it, so a value the user actually has selected does not just
   * vanish from the options. Returns null only when both the intersection and device
   * queries failed outright — callers should leave existing options untouched in that case.
   */
  getAvailableStreamingEncoderOptions(
    mode: TOutputSettingsMode,
    selectedEncoder: string | undefined,
  ): IObsListOption<string>[] | null {
    const targetEntry = this.getStreamingEncoderEntry(mode);
    const deviceEntry = this.getDeviceStreamingEncoderEntry(mode);

    if (targetEntry.encoders === null && deviceEntry.encoders === null) return null;

    const options = targetEntry.encoders === null ? [] : targetEntry.options;

    if (
      selectedEncoder &&
      deviceEntry.encoders &&
      !options.some(o => o.value === selectedEncoder)
    ) {
      const deviceEncoder = findEncoder(deviceEntry.encoders, selectedEncoder);
      if (deviceEncoder) {
        return [...options, { description: deviceEncoder.title, value: deviceEncoder.name }];
      }
    }

    return options;
  }

  /**
   * Whether `encoder` is usable on this machine at all, independent of which targets are
   * currently enabled. Resolved against the device list, not the target-set intersection,
   * since an encoder a destination rejects is still an encoder the machine can run. null
   * means the device could not be queried — callers must not treat that as unavailable.
   */
  isStreamingEncoderAvailable(mode: TOutputSettingsMode, encoder: string): boolean | null {
    const deviceEntry = this.getDeviceStreamingEncoderEntry(mode);
    if (deviceEntry.encoders === null) return null;
    return findEncoder(deviceEntry.encoders, encoder) !== undefined;
  }

  /** Drops memoized encoder lists. Only needed if the registered encoder set itself changes. */
  clearCache() {
    this.streamingEncoderCache.clear();
    this.recordingEncoderCache.clear();
  }

  private getStreamingEncoderEntry(mode: TOutputSettingsMode): IStreamingEncoderResult {
    const targets = this.getTargetPlatforms();
    // Keyed on the full target set, so enabling or disabling a platform lands on a
    // different entry instead of reusing a list filtered for a different destination.
    const cacheKey = `${mode}:${targets.join('+') || 'none'}`;
    return this.resolveStreamingEncoderEntry(cacheKey, () =>
      this.queryEncodersForTargets(mode, targets),
    );
  }

  /**
   * The device entry: what this machine can encode with, unfiltered by any enabled
   * target. This is the source of truth for encoder metadata and availability — only the
   * dropdown options should ever be narrowed by the target-set intersection.
   */
  private getDeviceStreamingEncoderEntry(mode: TOutputSettingsMode): IStreamingEncoderResult {
    return this.resolveStreamingEncoderEntry(`${mode}:device`, () =>
      this.queryEncodersForPlatform(mode, null),
    );
  }

  private resolveStreamingEncoderEntry(
    cacheKey: string,
    query: () => IEncoderOption[] | null,
  ): IStreamingEncoderResult {
    try {
      // While actively streaming, the running output already carries the real service:
      // read it straight through ahead of the cache, so an active output is never served
      // a cached or stale list. Recording-only sessions (isStreaming false even though a
      // streaming dependency exists for the recording) fall through to the query below,
      // so they still get the target-set intersection instead of this shortcut.
      if (this.streamingService.isStreaming) {
        const live = this.streamingService.getStreamingInstance();
        if (live && hasGetAvailableEncoders(live)) {
          const encoders = live.getAvailableEncoders();
          return { encoders, options: mapEncoders(encoders) };
        }
      }

      const cached = this.streamingEncoderCache.get(cacheKey);
      if (cached) return cached;

      const encoders = query();
      if (encoders === null) {
        // The query failed outright: a soft failure, not a confirmed empty
        // intersection, so it must not be memoized here.
        return { encoders: null, options: [] };
      }

      const entry = { encoders, options: mapEncoders(encoders) };
      this.streamingEncoderCache.set(cacheKey, entry);
      return entry;
    } catch (e: unknown) {
      console.error('Error querying available streaming encoders', e);
      // null (not []) marks this a failed query rather than a confirmed empty intersection.
      return { encoders: null, options: [] };
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
  ): IEncoderOption[] | null {
    if (!targets.length) return this.queryEncodersForPlatform(mode, null);

    let usable: IEncoderOption[] | null = null;
    for (const platform of targets) {
      const encoders = this.queryEncodersForPlatform(mode, platform);
      // A target we could not query is skipped; one that genuinely supports nothing
      // empties the intersection.
      if (encoders === null) continue;
      usable = usable === null ? encoders : intersectEncoders(usable, encoders);
    }

    // null here means no target produced an answer at all.
    return usable;
  }

  /**
   * Returns null when the target could not be queried at all — no query method, or the
   * query threw. An empty array is a real answer: the platform supports no encoders.
   */
  private queryEncodersForPlatform(
    mode: TOutputSettingsMode,
    platform: TPlatform | null,
  ): IEncoderOption[] | null {
    let instance: any;
    let service: any = null;

    try {
      instance =
        mode === 'Simple' ? SimpleStreamingFactory.create() : AdvancedStreamingFactory.create();
      service = this.setupTempStreamingService(instance, platform);
      if (!hasGetAvailableEncoders(instance)) return null;
      return instance.getAvailableEncoders();
    } catch (e: unknown) {
      // Contained per target so one failure cannot discard the narrowing the other
      // targets already contributed.
      console.error(`Error querying available encoders for ${platform ?? 'no platform'}`, e);
      return null;
    } finally {
      // create() may have thrown before assigning an instance; nothing to destroy then.
      if (instance) {
        if (mode === 'Simple') {
          SimpleStreamingFactory.destroy(instance);
        } else {
          AdvancedStreamingFactory.destroy(instance);
        }
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
    return this.getDeviceStreamingEncoderEntry(mode).encoders ?? [];
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
