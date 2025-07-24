import { Service } from './core/service';
import { Inject } from 'services/core/injector';
import { UserService } from 'services/user';
import { HostsService } from 'services/hosts';
import { authorizedHeaders, jfetch } from 'util/requests';
import { Subject } from 'rxjs';
import { AppService } from 'services/app';
import { IRecentEvent, ISafeModeServerSettings } from 'services/recent-events';
import { importSocketIOClient } from '../util/slow-imports';
import { SceneCollectionsService } from 'services/scene-collections';
import { TPlatform } from './platforms';

export type TSocketEvent =
  | IStreamlabelsSocketEvent
  | IAlertPlayingSocketEvent
  | IAlertProfileChanged
  | IEventSocketEvent
  | IFmExtEnabledSocketEvent
  | IEventPanelSettingsChangedSocketEvent
  | IMediaSharingSettingsUpdateSocketEvent
  | IPauseEventQueueSocketEvent
  | IUnpauseEventQueueSocketEvent
  | IPrimeSubEvent
  | ISafeModeEnabledSocketEvent
  | ISafeModeDisabledSocketEvent
  | ISLIDMerged
  | IUserAccountMerged
  | IUserAccountUnlinked
  | IUserAccountMergeError
  | IAccountPermissionsRequired;

interface IStreamlabelsSocketEvent {
  type: 'streamlabels';
  message: {
    data: Dictionary<string>;
  };
}

export interface IEventSocketEvent {
  type:
    | 'merch'
    | 'donation'
    | 'follow'
    | 'subscription'
    | 'bits'
    | 'host'
    | 'raid'
    | 'sticker'
    | 'effect'
    | 'like'
    | 'stars'
    | 'support'
    | 'share'
    | 'superchat'
    | 'pledge'
    | 'eldonation'
    | 'tiltifydonation'
    | 'donordrivedonation'
    | 'justgivingdonation'
    | 'treat'
    | 'account_permissions_required';
  for: string;
  message: IRecentEvent[];
}

interface IPrimeSubEvent {
  type: 'streamlabs_prime_subscribe';
  message: {
    expires_at: string;
    for: string;
    type: 'streamlabs_prime_subscribe';
  };
}

interface IFmExtEnabledSocketEvent {
  type: 'fm-ext-enabled';
}

export interface IAlertPlayingSocketEvent {
  type: 'alertPlaying';
  message: {
    type: string;
    amount?: string;
  };
}

interface IAlertProfileChanged {
  type: 'alertProfileChanged';
}

interface IPauseEventQueueSocketEvent {
  type: 'pauseQueue';
}

interface IUnpauseEventQueueSocketEvent {
  type: 'unpauseQueue';
}

interface IEventPanelSettingsChangedSocketEvent {
  type: 'eventsPanelSettingsUpdate';
  message: {
    muted?: boolean;
  };
}

interface IMediaSharingSettingsUpdateSocketEvent {
  type: 'mediaSharingSettingsUpdate';
  message: {
    advanced_settings: {
      enabled?: boolean;
    };
  };
}

export interface ISafeModeEnabledSocketEvent {
  type: 'safeModeEnabled';
  message: ISafeModeServerSettings & { ends_at: number };
}

interface ISafeModeDisabledSocketEvent {
  type: 'safeModeDisabled';
  message: {};
}

interface ISLIDMerged {
  type: 'slid.force_logout';
  for: string;
}

interface IUserAccountMerged {
  type: 'account_merged';
  for: string;
}
interface IUserAccountUnlinked {
  type: 'account_unlinked';
  for: string;
}
interface IUserAccountMergeError {
  type: 'account_merge_error';
  for: string;
  platform: TPlatform;
  message: string;
  code: number;
}

interface IAccountPermissionsRequired {
  type: 'account_permissions_required';
  for: string;
  message: {
    platform: string;
    url: any;
  }[];
}

export class WebsocketService extends Service {
  @Inject() private userService: UserService;
  @Inject() private hostsService: HostsService;
  @Inject() private appService: AppService;
  @Inject() private sceneCollectionsService: SceneCollectionsService;

  socket: SocketIOClient.Socket;

  socketEvent = new Subject<TSocketEvent>();
  ultraSubscription = new Subject<boolean>();
  io: SocketIOClientStatic;

  init() {
    this.sceneCollectionsService.collectionInitialized.subscribe(() => {
      this.openSocketConnection();
    });
  }

  async openSocketConnection() {
    if (!this.userService.isLoggedIn) {
      console.warn('User must be logged in to make a socket connection');
      return;
    }

    // dynamically import socket.io because it takes to much time to import it on startup
    if (!this.io) {
      this.io = (await importSocketIOClient()).default;
    }

    if (this.socket) {
      this.socket.disconnect();
    }

    const url = `https://${this.hostsService.streamlabs}/api/v5/slobs/socket-token`;
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(url, { headers });

    jfetch<{ socket_token: string }>(request)
      .then(json => json.socket_token)
      .then(token => {
        const url = `${this.hostsService.io}?token=${token}`;
        this.socket = this.io(url, { transports: ['websocket'] });

        // These are useful for debugging
        this.socket.on('connect', () => this.log('Connection Opened'));
        this.socket.on('connect_error', (e: any) => this.log('Connection Error', e));
        this.socket.on('connect_timeout', () => this.log('Connection Timeout'));
        this.socket.on('error', () => this.log('Error'));
        this.socket.on('disconnect', () => this.log('Connection Closed'));

        this.socket.on('event', (e: any) => {
          this.log('event', e);
          this.socketEvent.next(e);
        });
      });
  }

  private log(message: string, ...args: any[]) {
    console.debug(`WS: ${message}`, ...args);

    if (this.appService.state.argv.includes('--network-logging')) {
      console.log(`WS: ${message}`);
    }
  }
}
