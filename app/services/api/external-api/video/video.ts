import { Fallback, Singleton } from 'services/api/external-api';
import { Inject } from 'services/core/injector';
import { VideoService as InternalVideoSettingsService } from 'services/video';
import { IVideo } from '../../../../../obs-api';

@Singleton()
export class VideoService {
  @Fallback()
  @Inject()
  private videoService!: InternalVideoSettingsService;

  /*
   * Returns video contexts
   */
  get contexts(): Dictionary<IVideo> {
    return this.videoService.contexts;
  }
}
