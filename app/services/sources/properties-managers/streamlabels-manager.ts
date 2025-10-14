import { DefaultManager, IDefaultManagerSettings } from './default-manager';
import { Inject } from 'services/core/injector';
import { StreamlabelsService } from 'services/streamlabels';
import { UserService } from 'services/user';
import { byOS, OS } from 'util/operating-systems';
import { Subscription } from 'rxjs';

export interface IStreamlabelsManagerSettings extends IDefaultManagerSettings {
  statname: string;
}

export class StreamlabelsManager extends DefaultManager {
  @Inject() streamlabelsService: StreamlabelsService;
  @Inject() userService: UserService;

  settings: IStreamlabelsManagerSettings;
  oldOutput: string = null;
  customUIComponent = 'StreamlabelProperties';

  private subscription: Subscription;

  init() {
    super.init();
    this.subscription = this.streamlabelsService.output.subscribe(output => {
      // TODO: index
      // @ts-ignore
      if (output[this.settings.statname] !== this.oldOutput) {
        // TODO: index
        // @ts-ignore
        this.oldOutput = output[this.settings.statname];

        this.obsSource.update({
          ...this.obsSource.settings,
          // TODO: index
          // @ts-ignore
          text: this.normalizeText(output[this.settings.statname]),
          read_from_file: false,
        });
      }
    });
  }

  get denylist() {
    return byOS({
      [OS.Windows]: ['read_from_file', 'text'],
      [OS.Mac]: ['from_file', 'text', 'text_file', 'log_mode', 'log_lines'],
    });
  }

  destroy() {
    if (this.subscription) this.subscription.unsubscribe();
  }

  normalizeSettings(settings: IStreamlabelsManagerSettings) {
    const youtubeKeys = {
      most_recent_follower: 'most_recent_youtube_subscriber',
      session_followers: 'session_youtube_subscribers',
      session_follower_count: 'session_youtube_subscriber_count',
      session_most_recent_follower: 'session_most_recent_youtube_subscriber',
      total_subscriber_count: 'total_youtube_sponsor_count',
      most_recent_subscriber: 'most_recent_youtube_sponsor',
      session_subscribers: 'session_youtube_sponsors',
      session_subscriber_count: 'session_youtube_sponsor_count',
      session_most_recent_subscriber: 'session_most_recent_youtube_sponsor',
    };

    if (this.userService.platform) {
      if (this.userService.platform.type === 'youtube') {
        // TODO: index
        // @ts-ignore
        if (youtubeKeys[settings.statname]) {
          // TODO: index
          // @ts-ignore
          settings.statname = youtubeKeys[settings.statname];
        }
      }
    }
  }

  normalizeText(text: string | undefined) {
    // When using `item_separator` for list items, it would appear that streamlabels will
    // send output like `foo\\nbar` instead of `foo\nbar`, normalize here.
    // We don't want to do it in settings since it would be sent to the backend
    return text?.replace('\\n', '\n');
  }

  applySettings(settings: Dictionary<any>) {
    if (settings.statname !== this.settings.statname) {
      this.obsSource.update({
        // TODO: index
        // @ts-ignore
        text: this.normalizeText(this.streamlabelsService.output.getValue()[settings.statname]),
      });
    }

    const newSettings = {
      // Default to All-Time Top Donator
      statname: 'all_time_top_donator',
      ...this.settings,
      ...settings,
    };

    // Modifies the object in-place
    this.normalizeSettings(newSettings);
    super.applySettings(newSettings);
  }
}
