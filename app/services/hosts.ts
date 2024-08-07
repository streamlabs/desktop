import { Service } from './core/service';
import Utils from 'services/utils';

// Hands out hostnames to the rest of the app. Eventually
// we should allow overriding this value. But for now we
// are just keeping the value in one place.
export class HostsService extends Service {
  useDevServer: boolean = !!process.env.DEV_SERVER;
  replaceHost(url: string) {
    if (this.useDevServer) {
      if (url.startsWith(this.niconicoAccount)) {
        return url.replace(this.niconicoAccount, 'http://localhost:8080/account');
      }
      if (url.startsWith(this.niconicoOAuth)) {
        return url.replace(this.niconicoOAuth, 'http://localhost:8080/oauth');
      }
      if (url.startsWith(this.blogNicovideo)) {
        return url.replace(this.blogNicovideo, 'http://localhost:8080/blog');
      }
    }
    return url;
  }
  get niconicoAccount() {
    return 'https://account.nicovideo.jp';
  }
  get niconicoOAuth() {
    return 'https://oauth.nicovideo.jp';
  }
  get nAirLogin() {
    if (process.env.NAIR_LOGIN_URL) {
      return process.env.NAIR_LOGIN_URL;
    }

    const scopes = ['openid', 'profile', 'user.premium'];

    const url = new URL('https://n-air-app.nicovideo.jp/authorize');
    url.searchParams.set('scope', scopes.join(' '));
    return url.toString();
  }
  get blogNicovideo() {
    return 'https://blog.nicovideo.jp';
  }
  get niconicoNAirInformationsFeed() {
    return this.replaceHost('https://blog.nicovideo.jp/niconews/category/se_n-air/feed/index.xml');
  }
  get statistics() {
    if (Utils.isDevMode()) {
      return 'https://n-air-app.dev.nicovideo.jp/statistics';
    } else {
      return 'https://n-air-app.nicovideo.jp/statistics';
    }
  }

  get nicoLiveWeb() {
    return 'https://live.nicovideo.jp';
  }

  getWatchPageURL(programID: string): string {
    return `${this.nicoLiveWeb}/watch/${programID}`;
  }
  getMyPageURL(): string {
    return `${this.nicoLiveWeb}/my`;
  }
  getUserPageURL(userId: string): string {
    return `https://www.nicovideo.jp/user/${userId}`;
  }

  getContentTreeURL(programID: string): string {
    return `https://commons.nicovideo.jp/tree/${programID}`;
  }

  getCreatorsProgramURL(programID: string): string {
    return `https://commons.nicovideo.jp/cpp/application/?site_id=nicolive&creation_id=${programID}`;
  }

  getModeratorSettingsURL(): string {
    return 'https://www.upload.nicovideo.jp/niconico-garage/live/moderators';
  }
}
