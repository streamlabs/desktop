import { Service } from 'services/core';
import { Inject } from 'services/core/injector';
import { UserService } from 'services/user';
import { HostsService } from 'services/hosts';
import { authorizedHeaders, jfetch } from 'util/requests';
import Util from 'services/utils';

export class StreamAvatarApiService extends Service {
  @Inject() private userService: UserService;
  @Inject() private hostsService: HostsService;

  private cachedJwt: string | null = null;
  private cachedJwtExp = 0;
  private inflight: Promise<string> | null = null;

  private get apiBase(): string {
    const protocol = Util.shouldUseAvatarLocalHost() ? 'http://' : 'https://';
    return `${protocol}${this.hostsService.streamAvatarApi}`;
  }

  async getToken(forceRefresh = false): Promise<string> {
    const now = Date.now() / 1000;
    if (!forceRefresh && this.cachedJwt && this.cachedJwtExp - now > 60) {
      return this.cachedJwt;
    }

    if (this.inflight) return this.inflight;

    this.inflight = this.mintToken().finally(() => {
      this.inflight = null;
    });

    return this.inflight;
  }

  private async mintToken(): Promise<string> {
    const response = await jfetch<{ token: string }>(
      new Request(`${this.apiBase}/token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: this.userService.apiToken }),
      }),
    );

    const jwt = response.token;
    // Decode the exp from the JWT payload (second base64url segment)
    const payloadB64 = jwt.split('.')[1];
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
    this.cachedJwt = jwt;
    this.cachedJwtExp = payload.exp;
    return jwt;
  }

  async authedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const makeRequest = (token: string) =>
      new Request(`${this.apiBase}${path}`, {
        ...init,
        headers: authorizedHeaders(token, new Headers({ 'Content-Type': 'application/json' })),
      });

    try {
      return await jfetch<T>(makeRequest(await this.getToken()));
    } catch (e: any) {
      if (e?.status === 401) {
        return await jfetch<T>(makeRequest(await this.getToken(true)));
      }
      throw e;
    }
  }
}
