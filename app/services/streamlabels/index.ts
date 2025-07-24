import { mutation, StatefulService } from 'services/core/stateful-service';
import { UserService } from 'services/user';
import { Inject } from 'services/core/injector';
import { HostsService } from 'services/hosts';
import { authorizedHeaders, handleResponse, jfetch } from 'util/requests';
import { TSocketEvent, WebsocketService } from 'services/websocket';
import { AppService } from 'services/app';
import { InitAfter } from '../core';
import { BehaviorSubject } from 'rxjs';
import { getPlatformService } from '../platforms';

interface IStreamlabelActiveSubscriptions {
  filename: string;
  subscribers: string[];
}

export interface IStreamlabelSettings {
  format: string;
  item_format?: string;
  item_separator?: string;
  limit?: number;
  duration?: number;
  show_clock?: 'always' | 'active';
  show_count?: 'always' | 'active';
  show_latest?: 'always' | 'active';
  include_resubs?: boolean;
}

interface ITrainInfo {
  mostRecentEventAt: number;
  mostRecentName: string;
  counter: number;
  setting: string;
}

interface IDonationTrainInfo extends ITrainInfo {
  mostRecentAmount: number;
  totalAmount: number;
  donationTrain: boolean;
}

interface ITrains {
  donation: IDonationTrainInfo;
  subscription: ITrainInfo;
  follow: ITrainInfo;
  support: ITrainInfo;
  bits: ITrainInfo;
  stars: ITrainInfo;
  sponsor: ITrainInfo;
  superchat: ITrainInfo;
  youtube_subscriber: ITrainInfo;
  facebook_follow: ITrainInfo;
  trovo_follow: ITrainInfo;
  trovo_subscription: ITrainInfo;
}

export interface IStreamlabelSet {
  [categoryName: string]: IStreamlabelCategory;
}

export interface IStreamlabelCategory {
  label: string;
  files: IStreamlabelDefinition[];
}

export interface IStreamlabelDefinition {
  name: string;
  label: string;
  settings: IStreamlabelSettingsDefinition;
}

export interface IStreamlabelSettingsDefinition {
  format?: { tokens: string[] };
  item_format?: { tokens: string[] };
  item_separator?: { tokens: string[] };
  settingsStat?: string;
  // TODO: Change API to settingsAllowlist
  settingsWhitelist?: string[];
}

type TTrainType =
  | 'donation'
  | 'follow'
  | 'subscription'
  | 'support'
  | 'bits'
  | 'stars'
  | 'sponsor'
  | 'superchat'
  | 'youtube_subscriber'
  | 'trovo_follow'
  | 'trovo_subscription'
  | 'facebook_follow';

interface IStreamlabelsServiceState {
  definitions: IStreamlabelSet;
}

function isDonationTrain(train: ITrainInfo | IDonationTrainInfo): train is IDonationTrainInfo {
  return (train as IDonationTrainInfo).donationTrain;
}

const capitalize = (val: string) =>
  val
    .split('_')
    .map(word => `${word[0].toLocaleUpperCase()}${word.slice(1)}`)
    .join(' ');

@InitAfter('UserService')
export class StreamlabelsService extends StatefulService<IStreamlabelsServiceState> {
  @Inject() userService: UserService;
  @Inject() hostsService: HostsService;
  @Inject() websocketService: WebsocketService;
  @Inject() appService: AppService;

  static initialState: IStreamlabelsServiceState = {
    definitions: null,
  };

  /**
   * Represents the raw string value of the sources
   */
  output = new BehaviorSubject({});

  /**
   * Represents settings which are stored on the server
   */
  settings: Dictionary<IStreamlabelSettings> = {};

  /**
   * Holds info about currently active subscribers
   */
  subscriptions: Dictionary<IStreamlabelActiveSubscriptions> = {};

  trainInterval: number;

  socket: SocketIOClient.Socket;

  /**
   * Holds data about the currently running trains.
   * Will be updated by socket events and be used to
   * generate output.
   */
  trains: ITrains = {
    donation: {
      mostRecentEventAt: null,
      mostRecentName: null,
      counter: 0,
      mostRecentAmount: null,
      totalAmount: 0,
      donationTrain: true,
      setting: 'train_tips',
    },
    subscription: {
      mostRecentEventAt: null,
      mostRecentName: null,
      counter: 0,
      setting: 'train_twitch_subscriptions',
    },
    trovo_subscription: {
      mostRecentEventAt: null,
      mostRecentName: null,
      counter: 0,
      setting: 'train_trovo_subscriptions',
    },
    youtube_subscriber: {
      mostRecentEventAt: null,
      mostRecentName: null,
      counter: 0,
      setting: 'train_youtube_subscribers',
    },
    follow: {
      mostRecentEventAt: null,
      mostRecentName: null,
      counter: 0,
      setting: 'train_twitch_follows',
    },
    facebook_follow: {
      mostRecentEventAt: null,
      mostRecentName: null,
      counter: 0,
      setting: 'train_facebook_follows',
    },
    trovo_follow: {
      mostRecentEventAt: null,
      mostRecentName: null,
      counter: 0,
      setting: 'train_trovo_follows',
    },
    support: {
      mostRecentEventAt: null,
      mostRecentName: null,
      counter: 0,
      setting: 'train_facebook_supports',
    },
    bits: {
      mostRecentEventAt: null,
      mostRecentName: null,
      counter: 0,
      setting: 'train_twitch_bits',
    },
    stars: {
      mostRecentEventAt: null,
      mostRecentName: null,
      counter: 0,
      setting: 'train_facebook_stars',
    },
    sponsor: {
      mostRecentEventAt: null,
      mostRecentName: null,
      counter: 0,
      setting: 'train_youtube_sponsors',
    },
    superchat: {
      mostRecentEventAt: null,
      mostRecentName: null,
      counter: 0,
      setting: 'train_youtube_superchats',
    },
  };

  @mutation()
  SET_DEFINITIONS(definitions: IStreamlabelSet) {
    this.state.definitions = definitions;
  }

  async init() {
    this.initSocketConnection();
    this.initTrainClockInterval();

    this.userService.userLogin.subscribe(() => {
      this.onUserLogin();
    });
  }

  onUserLogin() {
    const primaryPlatform = getPlatformService(this.userService.platform.type);
    if (!primaryPlatform.hasCapability('streamlabels')) return;
    this.fetchInitialData();
    this.fetchSettings();
    this.fetchDefinitions();
  }

  getSettingsForStat(statname: string) {
    const settings = { ...this.settings[statname] };

    if (settings.format) {
      settings.format = this.escapeNewline(settings.format);
    }

    if (settings.item_separator) {
      settings.item_separator = this.escapeNewline(settings.item_separator);
    }

    return settings;
  }

  escapeNewline(text: string) {
    return text.replace(/\n/gi, '\\n');
  }

  unescapeNewline(text: string) {
    return text.replace(/\\n/gi, '\n');
  }

  setSettingsForStat(statname: string, settings: IStreamlabelSettings): Promise<boolean> {
    if (settings.format) {
      settings.format = this.escapeNewline(settings.format);
    }

    if (settings.item_separator) {
      settings.item_separator = this.unescapeNewline(settings.item_separator);
    }

    this.settings[statname] = {
      ...this.settings[statname],
      ...settings,
    };

    // Because trains are client-side, we can force a fast update
    if (
      [
        'train_tips',
        'train_twitch_follows',
        'train_twitch_subscriptions',
        'train_facebook_supports',
        'train_twitch_bits',
        'train_facebook_stars',
        'train_youtube_sponsors',
        'train_youtube_superchats',
        'train_youtube_subscribers',
        'train_facebook_follows',
        'train_trovo_follows',
        'train_trovo_subscriptions',
      ].includes(statname)
    ) {
      this.outputAllTrains();
    }

    const headers = authorizedHeaders(this.userService.apiToken);
    headers.append('Content-Type', 'application/json');

    const url = `https://${this.hostsService.streamlabs}/api/v5/slobs/stream-labels/settings`;
    const request = new Request(url, {
      headers,
      method: 'POST',
      body: JSON.stringify(this.settings),
    });

    return fetch(request)
      .then(handleResponse)
      .then(() => true);
  }

  restartSession(): Promise<boolean> {
    if (!this.userService.isLoggedIn) return;

    const url = `https://${this.hostsService.streamlabs}/api/v5/slobs/stream-labels/restart-session`;
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(url, { headers });

    return fetch(request)
      .then(handleResponse)
      .then(() => true);
  }

  private log(message: string, ...args: any[]) {
    console.debug(`Streamlabels: ${message}`, ...args);
  }

  /**
   * Attempt to load initial data via HTTP instead of waiting
   * for a socket event
   */
  private fetchInitialData(): void {
    if (!this.userService.isLoggedIn) return;

    const url = `https://${this.hostsService.streamlabs}/api/v5/slobs/stream-labels/files`;
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(url, { headers });

    jfetch<{ data: Dictionary<string> }>(request).then(json => this.updateOutput(json.data));
  }

  private fetchSettings(): void {
    if (!this.userService.isLoggedIn) return;

    const url = `https://${this.hostsService.streamlabs}/api/v5/slobs/stream-labels/settings`;
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(url, { headers });

    jfetch<Dictionary<IStreamlabelSettings>>(request).then(settings =>
      this.updateSettings(settings),
    );
  }

  fetchDefinitions(): void {
    if (!this.userService.isLoggedIn) return;

    const platform = this.userService.platform.type;
    const url = `https://${this.hostsService.streamlabs}/api/v5/slobs/stream-labels/app-settings/${platform}`;
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(url, { headers });

    fetch(request)
      .then(handleResponse)
      .then((data: IStreamlabelSet) => {
        this.SET_DEFINITIONS(this.formatTrainDefinitions(data));
      });
  }

  formatTrainDefinitions(data: IStreamlabelSet) {
    const { trains_combos, ...rest } = data;
    const trainData = {};
    trains_combos.files.forEach(file => {
      // TODO: index
      // @ts-ignore
      trainData[file.name] = { label: file.label, files: this.trainFiles(file.name) };
    });
    return {
      ...rest,
      ...trainData,
    };
  }

  trainFiles(fileName: string) {
    // TODO: index
    // @ts-ignore
    const type = Object.keys(this.trains).find(key => this.trains[key].setting === fileName);

    const baseFiles = [
      {
        name: `${type}_train_counter`,
        label: capitalize(`${type}_train_counter`),
        settings: { settingsStat: fileName, settingsWhitelist: ['show_count'] },
      },
      {
        name: `${type}_train_latest_name`,
        label: capitalize(`${type}_train_latest_name`),
        settings: { settingsStat: fileName, settingsWhitelist: ['show_latest'] },
      },
      {
        name: `${type}_train_clock`,
        label: capitalize(`${type}_train_clock`),
        settings: { settingsStat: fileName, settingsWhitelist: ['duration', 'show_clock'] },
      },
    ];

    const donationFiles = [
      {
        name: `${type}_train_latest_amount`,
        label: capitalize(`${type}_train_latest_amount`),
        settings: { settingsStat: fileName, settingsWhitelist: [] as Array<string> },
      },
      {
        name: `${type}_train_total_amount`,
        label: capitalize(`${type}_train_total_amount`),
        settings: { settingsStat: fileName, settingsWhitelist: [] as Array<string> },
      },
    ];

    if (fileName !== 'train_tips') return baseFiles;
    return baseFiles.concat(donationFiles);
  }

  private initSocketConnection(): void {
    this.websocketService.socketEvent.subscribe(e => this.onSocketEvent(e));
  }

  private initTrainClockInterval() {
    this.trainInterval = window.setInterval(() => {
      Object.keys(this.trains).forEach((trainType: TTrainType) => {
        const train = this.trains[trainType] as ITrainInfo;

        if (train.mostRecentEventAt == null) return;

        const statname = `${trainType}_train_clock`;
        const settings = this.getSettingsForStat(train.setting);

        // There is currently a bug where this will sometimes come back
        // from the server as a string.
        const duration = parseInt(settings.duration as any, 10) * 1000;
        const msRemaining = duration - (Date.now() - train.mostRecentEventAt);

        if (msRemaining < 0) {
          this.clearTrain(trainType);
          this.outputTrainInfo(trainType);
        } else {
          const minutes = Math.floor(msRemaining / (60 * 1000));
          const seconds = Math.floor((msRemaining % (60 * 1000)) / 1000);
          const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;

          this.updateOutput({
            [statname]: formatted,
          });
        }
      });
    }, 1000);
  }

  private clearTrain(trainType: TTrainType) {
    const train = this.trains[trainType] as ITrainInfo | IDonationTrainInfo;

    if (isDonationTrain(train)) {
      train.mostRecentAmount = null;
      train.totalAmount = 0;
    }

    train.counter = 0;
    train.mostRecentEventAt = null;
    train.mostRecentName = null;
  }

  private outputAllTrains() {
    Object.keys(this.trains).forEach((train: TTrainType) => this.outputTrainInfo(train));
  }

  /**
   * Outputs all files on a train, except for the clock while the
   * train is running.
   */
  private outputTrainInfo(trainType: TTrainType) {
    const train = this.trains[trainType] as ITrainInfo | IDonationTrainInfo;
    const settings = this.getSettingsForStat(train.setting);
    const output = {
      [`${trainType}_train_counter`]:
        train.counter || settings.show_count === 'always' ? train.counter.toString() : '',
      [`${trainType}_train_latest_name`]: settings.show_latest ? train.mostRecentName || '' : '',
    };

    if (isDonationTrain(train)) {
      const latestAmount = train.mostRecentAmount ? train.mostRecentAmount.toFixed(2) : '';
      const totalAmount = train.totalAmount ? train.totalAmount.toFixed(2) : '';

      output[`${trainType}_train_latest_amount`] = latestAmount;
      output[`${trainType}_train_total_amount`] = totalAmount;
    }

    if (train.mostRecentEventAt == null) {
      output[`${trainType}_train_clock`] = settings.show_clock === 'always' ? '0:00' : '';
    }

    this.updateOutput(output);
  }

  private onSocketEvent(event: TSocketEvent) {
    this.log('Socket Event', event);

    if (event.type === 'streamlabels') {
      this.updateOutput(event.message.data);
    } else if (event.type === 'donation') {
      this.trains.donation.mostRecentEventAt = Date.now();
      this.trains.donation.counter += event.message.length;
      this.trains.donation.totalAmount += event.message.reduce((sum: number, donation: any) => {
        return sum + parseFloat(donation.amount);
      }, 0);

      const latest = event.message[event.message.length - 1];
      this.trains.donation.mostRecentName = latest.name;
      this.trains.donation.mostRecentAmount = parseFloat(latest.amount);

      this.outputTrainInfo('donation');
    } else if (event.type === 'follow') {
      if (event.for === 'twitch_account') {
        this.trains.follow.mostRecentEventAt = Date.now();
        this.trains.follow.counter += event.message.length;

        const latest = event.message[event.message.length - 1];
        this.trains.follow.mostRecentName = latest.name;

        this.outputTrainInfo('follow');
      } else if (event.for === 'facebook_account') {
        this.trains.facebook_follow.mostRecentEventAt = Date.now();
        this.trains.facebook_follow.counter += event.message.length;

        const latest = event.message[event.message.length - 1];
        this.trains.facebook_follow.mostRecentName = latest.name;

        this.outputTrainInfo('facebook_follow');
      } else if (event.for === 'youtube_account') {
        this.trains.youtube_subscriber.mostRecentEventAt = Date.now();
        this.trains.youtube_subscriber.counter += event.message.length;

        const latest = event.message[event.message.length - 1];
        this.trains.youtube_subscriber.mostRecentName = latest.name;

        this.outputTrainInfo('youtube_subscriber');
      } else if (event.for === 'trovo_account') {
        this.trains.trovo_follow.mostRecentEventAt = Date.now();
        this.trains.trovo_follow.counter += event.message.length;

        const latest = event.message[event.message.length - 1];
        this.trains.trovo_follow.mostRecentName = latest.name;

        this.outputTrainInfo('trovo_follow');
      }
    } else if (event.type === 'subscription') {
      if (event.for === 'twitch_account') {
        this.trains.subscription.mostRecentEventAt = Date.now();
        this.trains.subscription.counter += event.message.length;

        const latest = event.message[event.message.length - 1];
        this.trains.subscription.mostRecentName = latest.name;

        this.outputTrainInfo('subscription');
      } else if (event.for === 'youtube_account') {
        this.trains.sponsor.mostRecentEventAt = Date.now();
        this.trains.sponsor.counter += event.message.length;

        const latest = event.message[event.message.length - 1];
        this.trains.sponsor.mostRecentName = latest.name;

        this.outputTrainInfo('sponsor');
      } else if (event.for === 'trovo_account') {
        this.trains.trovo_subscription.mostRecentEventAt = Date.now();
        this.trains.trovo_subscription.counter += event.message.length;

        const latest = event.message[event.message.length - 1];
        this.trains.trovo_subscription.mostRecentName = latest.name;

        this.outputTrainInfo('trovo_subscription');
      }
    } else if (event.type === 'support') {
      this.trains.support.mostRecentEventAt = Date.now();
      this.trains.support.counter += event.message.length;

      const latest = event.message[event.message.length - 1];
      this.trains.support.mostRecentName = latest.name;
      this.outputTrainInfo('support');
    } else if (event.type === 'bits') {
      this.trains.bits.mostRecentEventAt = Date.now();
      this.trains.bits.counter += event.message.length;

      const latest = event.message[event.message.length - 1];
      this.trains.bits.mostRecentName = latest.name;

      this.outputTrainInfo('bits');
    } else if (event.type === 'superchat') {
      this.trains.superchat.mostRecentEventAt = Date.now();
      this.trains.superchat.counter += event.message.length;

      const latest = event.message[event.message.length - 1];
      this.trains.superchat.mostRecentName = latest.name;

      this.outputTrainInfo('superchat');
    } else if (event.type === 'stars') {
      this.trains.stars.mostRecentEventAt = Date.now();
      this.trains.stars.counter += event.message.length;

      const latest = event.message[event.message.length - 1];
      this.trains.stars.mostRecentName = latest.name;

      this.outputTrainInfo('stars');
    }
  }

  /**
   * Applies a patch to the settings object
   * @param settingsPatch the new settings to be applied
   */
  private updateSettings(settingsPatch: Dictionary<IStreamlabelSettings>) {
    this.settings = {
      ...this.settings,
      ...settingsPatch,
    };
    this.outputAllTrains();
  }

  /**
   * Applies a patch to the output object and fires an update event
   * @param outputPatch the new output strings
   */
  private updateOutput(outputPatch: Dictionary<string>) {
    const oldOutput = this.output.getValue();
    this.output.next({
      ...oldOutput,
      ...outputPatch,
    });
  }
}
