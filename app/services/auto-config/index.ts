import { Subject } from 'rxjs';
import debounce from 'lodash/debounce';
import { Service } from '../core/service';
import * as obs from '../../../obs-api';
import { Inject } from 'services';
import { StreamSettingsService } from 'services/settings/streaming';
import { getPlatformService } from 'services/platforms';
import { TwitchService } from 'services/platforms/twitch';
import { YoutubeService } from 'app-services';
import { VideoService } from 'services/video';
import { UserService } from 'services/user';

export type TConfigEvent = 'starting_step' | 'progress' | 'stopping_step' | 'error' | 'done';

export interface IConfigStep {
  startMethod: string;
  identifier: string;
}

export interface IConfigProgress {
  event: TConfigEvent;
  description: string;
  percentage?: number;
  continent?: string;
}

export class AutoConfigService extends Service {
  @Inject() streamSettingsService: StreamSettingsService;
  @Inject() videoService: VideoService;
  @Inject() userService: UserService;

  configProgress = new Subject<IConfigProgress>();

  async start() {
    // temporarily disable auto config until migrate to new api

    return;
    // try {
    //   if (this.userService.views.isTwitchAuthed) {
    //     const service = getPlatformService('twitch') as TwitchService;
    //     const key = await service.fetchStreamKey();
    //     this.streamSettingsService.setSettings({ key, platform: 'twitch' });
    //   } else if (this.userService.views.isYoutubeAuthed) {
    //     const service = getPlatformService('youtube') as YoutubeService;
    //     await service.beforeGoLive({
    //       platforms: {
    //         youtube: {
    //           enabled: true,
    //           useCustomFields: false,
    //           title: 'bandwidthTest',
    //           description: 'bandwidthTest',
    //           privacyStatus: 'private',
    //           categoryId: '1',
    //         },
    //       },
    //       advancedMode: true,
    //       customDestinations: [],
    //     });
    //   }
    // } catch (e: unknown) {
    //   console.error('Failure fetching stream key for auto config');
    //   this.handleProgress({ event: 'error', description: 'error_fetching_stream_key' });
    //   return;
    // }

    // /**
    //  * Using the optimizer when two contexts are active is tricky because the optimizer
    //  * works with the last context created. If the app has opened a dual output scene at any
    //  * point during the current session, the vertical context exists. The optimizer
    //  * should only run on the horizontal context. Until output settings and streaming are migrated,
    //  * some non-optimal trickery is necessary.
    //  *
    //  * By design, the only difference in settings between the horizontal and vertical contexts is
    //  * the base width/height and output width/height. So before running the optimizer,
    //  * confirm that horizontal base width/height and output width/height are on the Video property.
    //  */
    // if (this.videoService.contexts?.vertical) {
    //   this.videoService.confirmVideoSettingDimensions();
    // }

    // obs.NodeObs.InitializeAutoConfig(
    //   (progress: IConfigProgress) => {
    //     this.handleProgress(progress);
    //     this.configProgress.next(progress);
    //   },
    //   { continent: '', service_name: '' },
    // );

    // obs.NodeObs.StartBandwidthTest();
  }

  async startRecording() {
    // temporarily disable auto config until migrate to new api

    return;
    // obs.NodeObs.InitializeAutoConfig(
    //   (progress: IConfigProgress) => this.handleRecordingProgress(progress),
    //   { continent: '', service_name: '' },
    // );

    // obs.NodeObs.StartRecordingEncoderTest();
  }

  handleProgress(progress: IConfigProgress) {
    if (progress.event === 'stopping_step') {
      if (progress.description === 'bandwidth_test') {
        obs.NodeObs.StartStreamEncoderTest();
      } else if (progress.description === 'streamingEncoder_test') {
        obs.NodeObs.StartRecordingEncoderTest();
      } else if (progress.description === 'recordingEncoder_test') {
        obs.NodeObs.StartCheckSettings();
      } else if (progress.description === 'checking_settings') {
        obs.NodeObs.StartSaveStreamSettings();
      } else if (progress.description === 'saving_service') {
        obs.NodeObs.StartSaveSettings();
      } else if (progress.description === 'setting_default_settings') {
        obs.NodeObs.StartSaveStreamSettings();
      }
    }

    if (progress.event === 'error') {
      obs.NodeObs.StartSetDefaultSettings();
      obs.NodeObs.TerminateAutoConfig();
      this.configProgress.next(progress);
    }

    if (progress.event === 'done') {
      obs.NodeObs.TerminateAutoConfig();

      // apply optimized settings to the video contexts
      this.videoService.migrateAutoConfigSettings();
    }
  }

  handleRecordingProgress(progress: IConfigProgress) {
    if (progress.event === 'stopping_step') {
      if (progress.description === 'recordingEncoder_test') {
        obs.NodeObs.StartSaveSettings();
      } else {
        obs.NodeObs.TerminateAutoConfig();

        // apply optimized settings to the video contexts
        this.videoService.migrateAutoConfigSettings();
        debounce(() => this.configProgress.next({ ...progress, event: 'done' }), 1000)();
      }
    }
  }
}
