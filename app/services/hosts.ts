import { Service } from './core/service';
import Util from 'services/utils';
import { Inject } from './core/injector';
import { ViewHandler } from './core';
import { I18nService } from 'app-services';

// Hands out hostnames to the rest of the app. Eventually
// we should allow overriding this value. But for now we
// are just keeping the value in one place.
export class HostsService extends Service {
  get streamlabs() {
    if (Util.shouldUseLocalHost()) {
      return 'streamlabs.site';
    } else if (Util.shouldUseBeta()) {
      return 'beta.streamlabs.com';
    }

    return 'streamlabs.com';
  }

  get overlays() {
    return 'overlays.streamlabs.com';
  }

  get media() {
    return 'media.streamlabs.com';
  }

  get io() {
    if (Util.shouldUseLocalHost()) {
      return 'http://io.streamlabs.site:4567';
    } else if (Util.shouldUseBeta()) {
      return 'https://beta.streamlabs.com';
    }

    return 'https://aws-io.streamlabs.com';
  }

  get cdn() {
    return 'cdn.streamlabs.com';
  }

  get platform() {
    return 'platform.streamlabs.com';
  }

  get analitycs() {
    return 'r2d2.streamlabs.com';
  }
}

export class UrlService extends Service {
  @Inject('HostsService') private hosts: HostsService;
  @Inject('I18nService') private i18nService: I18nService;

  get protocol() {
    return Util.shouldUseLocalHost() ? 'http://' : 'https://';
  }

  getStreamlabsApi(endpoint: string) {
    return `${this.protocol}${this.hosts.streamlabs}/api/v5/slobs/${endpoint}`;
  }

  get supportLink() {
    const locale = this.i18nService.state.locale;
    return `https://support.streamlabs.com/hc/${locale.toLowerCase()}`;
  }
}
