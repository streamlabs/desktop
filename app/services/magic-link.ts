import { Service } from 'services';
import { Inject } from 'services/core';
import { UserService } from 'services/user';
import { authorizedHeaders, jfetch } from 'util/requests';
import { HostsService } from './hosts';
import * as remote from '@electron/remote';
import electron from 'electron';
import { UsageStatisticsService } from './usage-statistics';
import { byOS, OS } from 'util/operating-systems';

interface ILoginTokenResponse {
  login_token: string;
  expires_at: number;
}

interface ILoginError {
  status: number;
}

export class MagicLinkService extends Service {
  @Inject() userService: UserService;
  @Inject() hostsService: HostsService;
  @Inject() usageStatisticsService: UsageStatisticsService;

  async getDashboardMagicLink(subPage = '', source?: string, os?: string) {
    const token = (await this.fetchNewToken()).login_token;
    // TODO: we really need `qs` or similar
    const sourceString = source ? `&refl=${source}` : '';
    const osString = os ? `&os=${os}` : '';

    if (subPage === 'multistream') {
      // TODO: remove this if statement when multistream settings are implemented
      return `https://${this.hostsService.streamlabs}/content-hub/post/how-to-multistream-the-ultimate-guide-to-multistreaming?login_token=${token}`;
    }

    return `https://${this.hostsService.streamlabs}/slobs/magic/dashboard?login_token=${token}&r=${
      subPage ?? ''
    }${sourceString}${osString}`;
  }

  private fetchNewToken(): Promise<ILoginTokenResponse> {
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(
      `https://${this.hostsService.streamlabs}/api/v5/slobs/login/token`,
      { headers },
    );

    return jfetch(request);
  }

  /**
   * open the prime onboarding in the browser
   * @param refl a referral tag for analytics
   */
  async linkToPrime(refl: string) {
    // TODO: this is only here to acommodate ultra checkout A/B test requiring OS
    // remove this and the parameter from {getDashboardMagicLink} after.
    const os = byOS({ [OS.Windows]: 'windows', [OS.Mac]: 'mac' });

    if (!this.userService.views.isLoggedIn) {
      return remote.shell.openExternal(
        `https://${this.hostsService.streamlabs}/ultra?refl=${refl}&os=${os}`,
      );
    }
    try {
      const link = await this.getDashboardMagicLink('prime', refl, os);
      remote.shell.openExternal(link);
    } catch (e: unknown) {
      console.error('Error generating dashboard magic link', e);
    }
  }

  async openWidgetThemesMagicLink() {
    try {
      const link = await this.getDashboardMagicLink('widgetthemes');
      remote.shell.openExternal(link);
    } catch (e: unknown) {
      console.error('Error generating dashboard magic link', e);
    }
  }

  async openDonationSettings() {
    try {
      const link = await this.getDashboardMagicLink('settings/donation-settings');
      remote.shell.openExternal(link);
      this.usageStatisticsService.recordFeatureUsage('openDonationSettings');
    } catch (e: unknown) {
      console.error('Error generating dashboard magic link', e);
    }
  }

  async openAdvancedAlertTesting() {
    try {
      const link = await this.getDashboardMagicLink('advancedtesting');
      remote.shell.openExternal(link);
      this.usageStatisticsService.recordFeatureUsage('openAdvancedAlertTesting');
    } catch (e: unknown) {
      console.error('Error generating dashboard magic link', e);
    }
  }

  async getMagicSessionUrl(targetUrl: string) {
    try {
      const loginToken = (await this.fetchNewToken()).login_token;
      return `https://${
        this.hostsService.streamlabs
      }/slobs/magic/init-session?login_token=${loginToken}&r=${encodeURIComponent(targetUrl)}`;
    } catch (e: unknown) {
      console.error('Error generating session magic link', e);
    }
  }
}
