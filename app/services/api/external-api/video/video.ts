import { Fallback, Singleton } from 'services/api/external-api';
import { Inject } from 'services/core/injector';
import { VideoSettingsService as InternalVideoSettingsService } from 'services/settings-v2';
import { IVideo } from '../../../../../obs-api';

@Singleton()
export class VideoSettingsService {
  @Fallback()
  @Inject()
  private videoSettingsService!: InternalVideoSettingsService;

  /*
   * Returns video contexts
   */
  get contexts(): Dictionary<IVideo> {
    return this.videoSettingsService.contexts;
  }
}
