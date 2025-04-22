/*global SLOBS_BUNDLE_ID*/

import { Inject } from './core/injector';
import { UserService } from './user';
import { HostsService } from './hosts';
import fs from 'fs';
import path from 'path';
import { authorizedHeaders, handleResponse } from 'util/requests';
import throttle from 'lodash/throttle';
import { Service } from './core/service';
import Utils from './utils';
import os from 'os';
import * as remote from '@electron/remote';

export type TUsageEvent = 'stream_start' | 'stream_end' | 'app_start' | 'app_close' | 'crash';

interface IUsageApiData {
  installer_id?: string;
  version: string;
  slobs_user_id: string;
  event: TUsageEvent;
  data: string;
}

export type TAnalyticsEvent =
  | 'PlatformLogin'
  | 'SocialShare'
  | 'Heartbeat'
  | 'StreamPerformance'
  | 'StreamingStatus'
  | 'RecordingStatus'
  | 'ReplayBufferStatus'
  | 'Click'
  | 'Session'
  | 'Shown'
  | 'AppStart'
  | 'Highlighter'
  | 'AIHighlighter'
  | 'Hardware'
  | 'WebcamUse'
  | 'MicrophoneUse'
  | 'GuestCam'
  | 'RecordingHistory'
  | 'DualOutput'
  | 'StreamToTikTokSettings'
  | 'StreamCustomDestinations'
  | 'TikTokLiveAccess'
  | 'TwitchCredentialsAlert'
  | 'TikTokApplyPrompt'
  | 'ScheduleStream';

interface IAnalyticsEvent {
  product: string;
  version: string;
  event: string;
  value?: any;
  time?: Date;
  count?: number;
  uuid?: string;
  saveUser?: boolean;
  userId?: number;
}

interface ISystemInfo {
  os: {
    platform: string;
    release: string;
  };
  arch: string;
  cpu: string;
  cores: number;
  mem: number;
}

interface ISessionInfo {
  startTime: Date;
  endTime?: Date;
  features: Dictionary<boolean>;
  sysInfo: ISystemInfo;
}

export function track(event: TUsageEvent) {
  return (target: any, methodName: string, descriptor: PropertyDescriptor) => {
    return {
      ...descriptor,
      value(...args: any[]): any {
        UsageStatisticsService.instance.recordEvent(event);
        descriptor.value.apply(this, args);
      },
    };
  };
}

export class UsageStatisticsService extends Service {
  @Inject() userService: UserService;
  @Inject() hostsService: HostsService;

  installerId: string;
  version = Utils.env.SLOBS_VERSION;

  private analyticsEvents: IAnalyticsEvent[] = [];

  init() {
    this.loadInstallerId();
    this.throttledSendAnalytics = throttle(this.sendAnalytics, 30 * 1000);

    setInterval(() => {
      this.recordAnalyticsEvent('Heartbeat', { bundle: SLOBS_BUNDLE_ID });
    }, 10 * 60 * 1000);
  }

  loadInstallerId() {
    let installerId = localStorage.getItem('installerId');

    if (!installerId) {
      const exePath = remote.app.getPath('exe');
      const installerNamePath = path.join(path.dirname(exePath), 'installername');

      if (fs.existsSync(installerNamePath)) {
        try {
          const installerName = fs.readFileSync(installerNamePath).toString();

          if (installerName) {
            const matches = installerName.match(/\-([A-Za-z0-9]+)\.exe/);
            if (matches) {
              installerId = matches[1];
              localStorage.setItem('installerId', installerId);
            }
          }
        } catch (e: unknown) {
          console.error('Error loading installer id', e);
        }
      }
    }

    this.installerId = installerId;
  }

  get isProduction() {
    return process.env.NODE_ENV === 'production';
  }

  /**
   * Record a usage event on our server.
   * @param event the event type to record
   * @param metadata arbitrary data to store with the event (must be serializable)
   */
  recordEvent(event: TUsageEvent, metadata: object = {}) {
    if (!this.isProduction) return;

    let headers = new Headers();
    headers.append('Content-Type', 'application/json');

    // Don't check logged in because login may not be verified at this point
    if (this.userService.state.auth && this.userService.state.auth.primaryPlatform) {
      metadata['platform'] = this.userService.state.auth.primaryPlatform;
    }

    metadata['os'] = process.platform;

    const bodyData: IUsageApiData = {
      event,
      slobs_user_id: this.userService.getLocalUserId(),
      version: this.version,
      data: JSON.stringify(metadata),
    };

    if (this.userService.state.auth && this.userService.state.auth.apiToken) {
      headers = authorizedHeaders(this.userService.apiToken, headers);
    }

    if (this.installerId) {
      bodyData.installer_id = this.installerId;
    }

    const request = new Request(`https://${this.hostsService.streamlabs}/api/v5/slobs/log`, {
      headers,
      method: 'POST',
      body: JSON.stringify(bodyData),
    });

    return fetch(request);
  }

  /**
   * Record event for the analytics DB
   */
  recordAnalyticsEvent(event: TAnalyticsEvent, value: any) {
    if (!this.isProduction) return;

    const analyticsEvent: IAnalyticsEvent = {
      event,
      value,
      product: 'SLOBS',
      version: this.version,
      count: 1,
      uuid: this.userService.getLocalUserId(),
      time: new Date(),
    };

    if (this.userService.state.userId) analyticsEvent.userId = this.userService.state.userId;

    this.analyticsEvents.push(analyticsEvent);
    this.throttledSendAnalytics();
  }

  /**
   * All clicks should use this function to ensure consistent naming
   * of click events.
   * @param component A logical grouping to namespace this click. Can
   * be the name of the component, or some other grouping.
   * @param target A unique and descriptive name for the element that
   * was clicked.
   */
  recordClick(component: string, target: string) {
    this.recordAnalyticsEvent('Click', { component, target });
  }

  recordShown(component: string, target?: string) {
    this.recordAnalyticsEvent('Shown', { component, target });
  }

  /**
   * Should be called on shutdown to flush all events in the pipeline
   */
  async flushEvents() {
    this.session.endTime = new Date();

    const session = {
      ...this.session,
      // Convert features to an array for persistence for better querying
      features: Object.keys(this.session.features),
      isPrime: this.userService.state.isPrime,
    };

    this.recordAnalyticsEvent('Session', session);

    // Unthrottled version
    await this.sendAnalytics();
  }

  getSysInfo() {
    return {
      os: {
        platform: os.platform(),
        release: os.release(),
      },
      arch: process.arch,
      cpu: os.cpus()[0].model,
      cores: os.cpus().length,
      mem: os.totalmem(),
    };
  }

  private session: ISessionInfo = {
    startTime: new Date(),
    features: {},
    sysInfo: this.getSysInfo(),
  };

  recordFeatureUsage(feature: string) {
    this.session.features[feature] = true;
  }

  /**
   * Should not be called directly except during shutdown.
   */
  private async sendAnalytics() {
    if (!this.analyticsEvents.length) return;

    const data = { analyticsTokens: [...this.analyticsEvents] };
    const headers = authorizedHeaders(this.userService.apiToken);
    headers.append('Content-Type', 'application/json');

    this.analyticsEvents.length = 0;

    const request = new Request(`https://${this.hostsService.analitycs}/slobs/data/ping`, {
      headers,
      method: 'post',
      body: JSON.stringify(data || {}),
    });
    await fetch(request)
      .then(handleResponse)
      .catch(e => {
        console.error('Error sending analytics events', e);
      });
  }

  private throttledSendAnalytics: () => void;
}
