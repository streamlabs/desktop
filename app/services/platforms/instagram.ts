import { getDefined } from 'util/properties-type-guards';
import {
  IGame,
  IPlatformCapabilityResolutionPreset,
  IPlatformRequest,
  IPlatformService,
  IPlatformState,
  TPlatformCapability,
  TStartStreamOptions,
  EPlatformCallResult,
} from '.';
import { BasePlatformService } from './base-platform';
import { IGoLiveSettings } from 'services/streaming';
import { TDisplayType } from 'services/video';
import { WidgetType } from 'services/widgets';
import { InheritMutations, mutation } from 'services/core';
import Utils from 'services/utils';

export interface IInstagramStartStreamOptions {
  streamUrl: string;
  streamKey: string;
  title: string;
}

interface IInstagramServiceState extends IPlatformState {
  settings: IInstagramStartStreamOptions;
}

@InheritMutations()
export class InstagramService
  extends BasePlatformService<IInstagramServiceState>
  implements IPlatformService {
  searchGames?: (searchString: string) => Promise<IGame[]>;
  scheduleStream?: (startTime: number, info: TStartStreamOptions) => Promise<any>;
  getHeaders: (req: IPlatformRequest, useToken?: string | boolean) => Dictionary<string>;
  streamPageUrl: string;
  widgetsWhitelist?: WidgetType[];

  readonly apiBase = '';
  readonly platform = 'instagram';
  readonly displayName = 'Instagram';
  readonly capabilities = new Set<TPlatformCapability>(['resolutionPreset']);

  static initialState: IInstagramServiceState = {
    ...BasePlatformService.initialState,
    settings: { title: '', streamUrl: '', streamKey: '' },
  };

  readonly authWindowOptions = {};
  readonly authUrl = '';

  fetchNewToken() {
    return Promise.resolve();
  }

  protected init() {
    this.syncSettingsWithLocalStorage();
    // Need to reset stream key here as well since it might've been persisted if filled in but didn't stream (we clear after stream)
    this.state.settings.streamKey = '';
  }

  // FIXME: failing to go live doesn't seem to trigger an error, is there a way to detect it?
  async beforeGoLive(goLiveSettings: IGoLiveSettings, context?: TDisplayType) {
    const settings = getDefined(goLiveSettings.platforms.instagram);

    if (!this.streamingService.views.isMultiplatformMode) {
      this.streamSettingsService.setSettings(
        {
          streamType: 'rtmp_custom',
          key: settings.streamKey,
          server: settings.streamUrl,
        },
        context,
      );
    }

    this.SET_STREAM_KEY(settings.streamKey);
    this.UPDATE_STREAM_SETTINGS(settings);
    this.setPlatformContext('instagram');
  }

  /**
   * prepopulate channel info and save it to the store
   */
  async prepopulateInfo(): Promise<void> {
    this.SET_PREPOPULATED(true);
  }

  async validatePlatform() {
    /*
     * TODO: this validation isn't needed, but doesn't hurt to be safe, in case we decide to persist
     * stream URL as part of "linking". Maybe also validate stream keys, they seem to start with IG-*
     */
    if (!this.state.settings.streamKey.length || !this.state.settings.streamUrl.length) {
      return EPlatformCallResult.Error;
    }

    return EPlatformCallResult.Success;
  }

  async putChannelInfo(): Promise<void> {
    // no API
  }

  get chatUrl(): string {
    // no API
    return '';
  }

  get liveDockEnabled(): boolean {
    return this.streamingService.views.isMultiplatformMode;
  }

  // Reset stream key since Instagram decided they change for each stream
  afterStopStream() {
    this.SET_STREAM_SETTINGS({
      ...this.state.settings,
      streamKey: '',
    });
    return Promise.resolve();
  }

  unlink() {
    this.userService.UNLINK_PLATFORM('instagram');
  }

  updateSettings(settings: IInstagramStartStreamOptions) {
    this.UPDATE_STREAM_SETTINGS(settings);
  }
}
