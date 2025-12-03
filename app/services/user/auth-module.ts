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
import { jfetch } from 'util/requests';

interface IPkceAuthResponse {
  data: {
    oauth_token: string;
    platform: TPlatform | 'slid';
    platform_id: string;
    platform_token: string;
    platform_username: string;
    token: string;
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

    const partition = `persist:${uuid()}`;

    let code = '';

    if (external) {
      code = await this.externalLogin(authUrl, codeChallenge, merge, onWindowShow);
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
      const url = `https://${host}/api/v5/slobs/auth/data?code_verifier=${codeVerifier}&code=${code}`;

      const resp = await jfetch<IPkceAuthResponse>(url);

      if (resp.data.platform === 'slid') {
        return {
          widgetToken: resp.data.token,
          apiToken: resp.data.oauth_token,
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
        widgetToken: resp.data.token,
        apiToken: resp.data.oauth_token,
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
    } catch (error: unknown) {
      console.error('Authentication Error: ', error);

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
}
