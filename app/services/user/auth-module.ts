import { TPlatform } from 'services/platforms';
import { IUserAuth } from '.';
import uuid from 'uuid/v4';
import electron from 'electron';
import defer from 'lodash/defer';
import URI from 'urijs';
import http from 'http';
import Utils from 'services/utils';
import * as remote from '@electron/remote';
import crypto from 'crypto';
import { Inject } from 'services/core';
import { HostsService } from 'app-services';
import { authorizedHeaders, jfetch } from 'util/requests';

interface IPkceAuthResponse {
  success: boolean;
  data: {
    platform: TPlatform | 'slid';
    platform_id: string;
    platform_token: string;
    platform_username: string;
    token: string;
    first_time_user: boolean;
    api_token: {
      token_type: string;
      expires_in: number;
      access_token: string;
      refresh_token: string;
    };
  };
}

/**
 * Responsible for secure handling of platform OAuth flows.
 * Supports 2 different modes:
 * - Internal Auth: Login happens in an electron window.
 * - External Auth: Login happens in the user's default web browser.
 */
export class AuthModule {
  @Inject() hostsService: HostsService;

  /**
   * Starts a login flow using PKCE for credential exchange
   */
  async startPkceAuth(
    authUrl: string,
    onWindowShow: () => void,
    onWindowClose: () => void = () => {},
    platform: TPlatform | 'slid' = 'slid',
    merge = false,
    external = true,
    windowOptions: electron.BrowserWindowConstructorOptions = {},
  ): Promise<IUserAuth> {
    const codeVerifier = crypto.randomBytes(64).toString('hex');
    const hash = crypto.createHash('sha256');
    hash.update(codeVerifier);

    // Equivalent to `base64url` encoding
    const codeChallenge = hash
      .digest('base64')
      .replace(/\=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const loginUrl =
      `https://${this.hostsService.streamlabs}/client/login` +
      `?_=${Date.now()}` +
      '&skip_splash=true' +
      '&external=electron' +
      `&${platform}` +
      '&force_verify' +
      '&origin=slobs';

    const partition = `persist:${uuid()}`;

    let code = '';

    if (external) {
      code = await this.externalLogin(loginUrl, codeChallenge, merge, onWindowShow);
    } else {
      code = await this.internalLogin(
        authUrl,
        codeChallenge,
        merge,
        partition,
        windowOptions,
        onWindowShow,
        onWindowClose,
      );
    }

    try {
      const host = this.hostsService.streamlabs;
      const url = `https://${host}/api/v5/auth/data?code_verifier=${codeVerifier}&code=${code}`;

      const resp = await jfetch<IPkceAuthResponse>(url);

      if (!resp.success) {
        console.error('Authentication failed, please relogin to resolve the issue.');
        return null;
      }

      const valid = await this.testToken(resp.data.api_token.access_token);

      if (!valid) {
        console.error('Invalid token, please relogin to resolve the issue.');
        return null;
      }

      const data = {
        widgetToken: resp.data.token,
        apiToken: resp.data.api_token.access_token,
        refreshToken: resp.data.api_token.refresh_token,
        newUser: resp.data.first_time_user,
        refreshExpires: Date.now() + resp.data.api_token.expires_in * 1000,
      };

      if (resp.data.platform === 'slid') {
        return {
          ...data,
          primaryPlatform: null,
          platforms: {},
          slid: {
            id: resp.data.platform_id,
            username: resp.data.platform_username,
          },
          hasRelogged: true,
        };
      }

      return {
        ...data,
        primaryPlatform: resp.data.platform,
        platforms: {
          [resp.data.platform]: {
            type: resp.data.platform,
            username: resp.data.platform_username,
            token: resp.data.platform_token,
            id: resp.data.platform_id,
          },
        },
        partition,
        hasRelogged: true,
      };
    } catch (e: unknown) {
      console.error('Authentication Error: ', e);

      return;
    }
  }

  private authServer: http.Server;

  private async externalLogin(
    authUrl: string,
    codeChallenge: string,
    merge: boolean,
    onWindowShow: () => void,
  ): Promise<string> {
    const code = await new Promise<string>(resolve => {
      if (this.authServer) {
        this.authServer.close();
        this.authServer.unref();
      }

      this.authServer = http.createServer((request, response) => {
        const query = URI.parseQuery(URI.parse(request.url).query) as Dictionary<string>;

        if (query['success']) {
          // handle account already merged to another account
          if (
            query['success'] === 'false' ||
            ['connected_with_another_account', 'unknown'].includes(query['reason'])
          ) {
            response.writeHead(302, {
              Location: `https://${this.hostsService.streamlabs}/dashboard#/settings/account-settings/platforms`,
            });
            response.end();
          } else {
            response.writeHead(302, {
              Location: `https://${this.hostsService.streamlabs}/streamlabs-obs/login-success`,
            });
            response.end();
          }

          this.authServer.close();
          this.authServer.unref();
          this.authServer = null;

          resolve(query['code']);
        } else {
          // All other requests we respond with a generic 200
          response.writeHead(200);
          response.write('Success');
          response.end();
        }
      });

      this.authServer.on('listening', () => {
        const address = this.authServer.address();
        if (address && typeof address !== 'string') {
          const paramSeparator = merge ? '?' : '&';
          const url = `${authUrl}${paramSeparator}port=${address.port}&code_challenge=${codeChallenge}&code_flow=true`;

          electron.shell.openExternal(url);
          onWindowShow();
        }
      });

      // Specifying port 0 lets the OS know we want a free port assigned
      this.authServer.listen(0, '127.0.0.1');
    });

    const win = Utils.getMainWindow();

    // A little hack to bring the window back to the front
    win.setAlwaysOnTop(true);
    win.show();
    win.focus();
    win.setAlwaysOnTop(false);

    return code;
  }

  private async testToken(token: string) {
    const host = this.hostsService.streamlabs;
    const url = `https://${host}/api/v5/oauth/test`;
    const headers = authorizedHeaders(token, new Headers({ 'Content-Type': 'application/json' }));

    try {
      const resp = await jfetch<any>(url, { method: 'GET', headers });

      if (!resp.message || !resp.message.toLowerCase().includes('authenticated')) {
        console.error('Invalid token: ', resp);
        return false;
      }

      return true;
    } catch (e: unknown) {
      console.error('Error testing token: ', e);
      return false;
    }
  }

  private async internalLogin(
    authUrl: string,
    codeChallenge: string,
    merge: boolean,
    partition: string,
    windowOptions: electron.BrowserWindowConstructorOptions,
    onWindowShow: () => void,
    onWindowClose: () => void,
  ) {
    return new Promise<string>(resolve => {
      let completed = false;
      const authWindow = new remote.BrowserWindow({
        ...windowOptions,
        alwaysOnTop: false,
        show: false,
        webPreferences: {
          partition,
          nodeIntegration: false,
        },
      });

      authWindow.webContents.on('did-navigate', async (e, url) => {
        const query = URI.parseQuery(URI.parse(url).query) as Dictionary<string>;

        if (query['success']) {
          completed = true;
          authWindow.close();
          resolve(query['code']);
        }
      });

      authWindow.once('ready-to-show', () => {
        authWindow.show();
        defer(onWindowShow);
      });

      authWindow.on('close', () => {
        if (!completed) onWindowClose();
      });

      const paramSeparator = merge ? '?' : '&';
      const url = `${authUrl}${paramSeparator}code_challenge=${codeChallenge}`;

      authWindow.removeMenu();
      authWindow.loadURL(url);
    });
  }

  async refreshToken(token: string) {
    try {
      const host = this.hostsService.streamlabs;
      const headers = authorizedHeaders(token, new Headers({ 'Content-Type': 'application/json' }));
      const clientId = await jfetch<{
        success: boolean;
        data: { client_id: string };
        message: string;
      }>(`https://${host}/api/v5/oauth/client-id/desktop`, { method: 'GET', headers }).then(
        resp => resp.data.client_id,
      );

      const body = JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: token,
        client_id: clientId,
      });

      const url = `https://${host}/api/v5/oauth/token`;
      const resp = await jfetch<any>(url, { method: 'POST', headers, body });

      console.log('Refresh token response: ', resp);

      if (!resp) {
        throw new Error('Failed to refresh token');
      }

      return {
        apiToken: resp.access_token,
        refreshToken: resp.refresh_token,
        refreshExpires: Date.now() + resp.expires_in * 1000,
      };
    } catch (e: unknown) {
      console.log('Error refreshing token: ', e);
    }
  }

  async revokeToken(token: string) {
    try {
      const host = this.hostsService.streamlabs;
      const headers = authorizedHeaders(token, new Headers({ 'Content-Type': 'application/json' }));
      const url = `https://${host}/api/v5/oauth/token/revoke`;

      const resp = await jfetch<Partial<IPkceAuthResponse>>(url, { method: 'POST', headers });

      if (!resp.success) {
        throw new Error('Failed to revoke refresh token');
      }
    } catch (e: unknown) {
      console.log('Error revoking refresh token: ', e);
    }
  }

  async exchangeToken(auth: IUserAuth, retries = 3): Promise<IUserAuth> {
    if (!auth.apiToken) {
      console.error('No API token found for user, cannot exchange token');
      return null;
    }

    try {
      const host = this.hostsService.streamlabs;
      const headers = authorizedHeaders(
        auth.apiToken,
        new Headers({ 'Content-Type': 'application/json' }),
      );
      const body = JSON.stringify({
        origin: 'desktop',
      });
      const url = `https://${host}/api/v5/oauth/token/exchange`;
      const request = new Request(url, { headers, body, method: 'POST' });
      const resp = await jfetch<any>(request);

      if (!resp.success) {
        throw new Error('Failed to exchange token');
      }

      return {
        ...auth,
        apiToken: resp.data.api_token.access_token,
        refreshToken: resp.data.api_token.refresh_token,
        refreshExpires: Date.now() + resp.data.api_token.expires_in * 1000,
      };
    } catch (e: unknown) {
      console.error('Error exchanging token: ', e);

      // Retry a few times in case of unexpected errors
      if (retries > 0) {
        console.error(`Retrying token exchange, attempts left: ${retries - 1}`);
        return this.exchangeToken(auth, retries - 1);
      }
    }
  }
}
