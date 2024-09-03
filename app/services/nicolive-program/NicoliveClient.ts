import * as Sentry from '@sentry/vue';
import { ipcRenderer } from 'electron';
import { addClipboardMenu } from 'util/addClipboardMenu';
import { handleErrors } from 'util/requests';
import {
  BroadcastStreamData,
  CommonErrorResponse,
  Extension,
  FilterRecord,
  Filters,
  NicoadStatistics,
  OnairChannelData,
  OnairChannelProgramData,
  OnairUserProgramData,
  ProgramInfo,
  ProgramSchedules,
  Segment,
  Statistics,
  UserFollowStatus,
  UserFollow,
  AddFilterRecord,
  AddFilterResult,
  AddModerator,
  Moderator,
  Supporters,
} from './ResponseTypes';

import * as remote from '@electron/remote';

const { BrowserWindow } = remote;

export enum CreateResult {
  CREATED = 'CREATED',
  RESERVED = 'RESERVED',
  OTHER = 'OTHER',
}

export enum EditResult {
  EDITED = 'EDITED',
  OTHER = 'OTHER',
}

interface HeaderSeed {
  [key: string]: string;
}

type SucceededResult<T> = {
  ok: true;
  value: T;
};

export type FailedResult = {
  ok: false;
  value: CommonErrorResponse | Error;
};

/**
 * JSONで結果が返ってくることまでを信用したEitherのようなもの
 * @example
 * declare var result: WrappedResult<number>;
 * if (isOk(result)) result.value; // number
 * else result.value // CommonErrorResponse
 */
export type WrappedResult<T> = SucceededResult<T> | FailedResult;

export function isOk<T>(result: WrappedResult<T>): result is SucceededResult<T> {
  return result.ok === true;
}

export class NotLoggedInError {}

type Quality = {
  bitrate: number;
  height: number;
  fps: number;
};

export function parseMaxQuality(maxQuality: string, fallback: Quality): Quality {
  try {
    const match = maxQuality.match(/(\d+)([Mk])bps(\d+)p((\d+)fps)?/);

    return {
      bitrate: parseInt(match[1], 10) * (match[2] === 'M' ? 1000 : 1),
      height: parseInt(match[3], 10),
      fps: parseInt(match[5], 10) || 30,
    };
  } catch (e) {
    console.warn('Failed to parse max quality', maxQuality, e);
    return fallback;
  }
}

export type KonomiTag = {
  tag_id: {
    value: string;
  };
  name: string;
  followers_count: number;
};
type KonomiTags = {
  konomi_tags: KonomiTag[];
};

function isValidUserFollowResponse(response: any): response is UserFollow {
  if (typeof response !== 'object') return false;
  if (!('meta' in response)) return false;
  if (typeof response['meta'] !== 'object') return false;
  if (!('status' in response['meta'])) return false;
  if (typeof response['meta']['status'] !== 'number') return false;
  return true;
}

function isValidUserFollowStatusResponse(response: any): response is UserFollowStatus {
  if (!isValidUserFollowResponse(response)) return false;
  if (response.meta.status !== 200) return false;
  if (!('data' in response)) return false;
  if (typeof response['data'] !== 'object') return false;
  if (!('following' in (response as { data: any })['data'])) return false;
  if (typeof (response as { data: any })['data']['following'] !== 'boolean') return false;
  return true;
}

export class NicoliveClient {
  static live2BaseURL = 'https://live2.nicovideo.jp' as const;
  static live2ApiBaseURL = 'https://api.live2.nicovideo.jp' as const;
  static publicBaseURL = 'https://public.api.nicovideo.jp' as const;
  static nicoadBaseURL = 'https://api.nicoad.nicovideo.jp' as const;
  static userFollowBaseURL = 'https://user-follow-api.nicovideo.jp' as const;
  static userIconBaseURL = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/' as const;

  private static FrontendIdHeader = {
    'x-frontend-id': '134',
  } as const;

  private static OpenWindows: { [key: string]: Electron.BrowserWindow | null } = {};

  static registerWindow(key: 'createProgram' | 'editProgram', win: Electron.BrowserWindow) {
    if (NicoliveClient.OpenWindows[key]) {
      throw new Error(`NicoliveClient.registerWindow: Window already exists: ${key}`);
    }
    NicoliveClient.OpenWindows[key] = win;
    win.on('close', () => {
      NicoliveClient.OpenWindows[key] = null;
    });
  }
  static closeOpenWindows() {
    for (const key in NicoliveClient.OpenWindows) {
      const win = NicoliveClient.OpenWindows[key];
      if (win) {
        win.close();
      }
    }
  }

  /**
   *
   * @param options niconicoSession: ニコニコのセッションIDを外挿する場合に与える
   */
  constructor(
    private options: {
      niconicoSession?: string;
    } = {},
  ) {}

  static isProgramPage(url: string): boolean {
    return /^https?:\/\/live2?\.nicovideo\.jp\/watch\/lv\d+/.test(url);
  }

  static isMyPage(url: string): boolean {
    const urlObj = new URL(url);
    return (
      /^https?:$/.test(urlObj.protocol) &&
      /^live2?\.nicovideo\.jp$/.test(urlObj.hostname) &&
      /^\/my$/.test(urlObj.pathname)
    );
  }

  static isAllowedURL(url: string): boolean {
    return /^https?:\/\/live2?.nicovideo.jp\//.test(url);
  }

  private static createRequest(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    requestInit: RequestInit,
  ): RequestInit {
    return {
      method,
      mode: 'cors',
      credentials: 'include',
      ...requestInit,
    };
  }

  static async wrapResult<ResultType>(res: Response): Promise<WrappedResult<ResultType>> {
    const body = await res.text();
    let obj: any = null;
    try {
      obj = JSON.parse(body);
    } catch (e) {
      // bodyがJSONになってない異常失敗

      // breadcrumbsに載るようにログ
      console.warn('non-json body', body);
      return {
        ok: false,
        value: e as Error,
      };
    }

    // 正常成功
    if (res.ok) {
      return {
        ok: true,
        value: obj.data as ResultType,
      };
    }

    // 正常失敗
    return {
      ok: false,
      value: obj as CommonErrorResponse,
    };
  }

  static async wrapFetchError(err: Error): Promise<FailedResult> {
    return {
      ok: false,
      value: err,
    };
  }

  /**
   * ニコニコのセッションを読みだし
   * rendererのdocument.cookieからはローカル扱いになって読めないので、mainプロセスで取る
   */
  private async fetchSession(): Promise<string> {
    if (this.options.niconicoSession) {
      return this.options.niconicoSession;
    }

    const { session } = remote.getCurrentWebContents();
    return new Promise((resolve, reject) => {
      session.cookies.get({ url: 'https://.nicovideo.jp', name: 'user_session' }).then(cookies => {
        if (cookies.length < 1) return reject(new NotLoggedInError());
        resolve(cookies[0].value);
      });
    });
  }

  private async requestAPI<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    options: RequestInit = {},
  ): Promise<WrappedResult<T>> {
    const headers: HeadersInit = {};
    // renderer process だと cookieが取れないので、main process で取ってきて付ける
    if (process.type === 'renderer') {
      headers['X-Niconico-Session'] = await this.fetchSession();
    }
    const requestInit = NicoliveClient.createRequest(method, {
      ...options,
      headers: { ...headers, ...options.headers },
    });
    try {
      const resp = await fetch(url, requestInit);
      return NicoliveClient.wrapResult<T>(resp);
    } catch (err) {
      return NicoliveClient.wrapFetchError(err as Error);
    }
  }

  static jsonBody<T>(body: T, extraHeaders: HeadersInit = {}): RequestInit {
    return {
      headers: {
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    };
  }

  /** ユーザごとの番組スケジュールを取得 */
  async fetchProgramSchedules(): Promise<WrappedResult<ProgramSchedules['data']>> {
    return this.requestAPI<ProgramSchedules['data']>(
      'GET',
      `${NicoliveClient.live2BaseURL}/unama/tool/v1/program_schedules`,
    );
  }

  /** 番組情報を取得 */
  async fetchProgram(programID: string): Promise<WrappedResult<ProgramInfo['data']>> {
    return this.requestAPI<ProgramInfo['data']>(
      'GET',
      `${NicoliveClient.live2BaseURL}/watch/${programID}/programinfo`,
    );
  }

  /** 番組を開始 */
  async startProgram(programID: string): Promise<WrappedResult<Segment['data']>> {
    return this.requestAPI<Segment['data']>(
      'PUT',
      `${NicoliveClient.live2BaseURL}/watch/${programID}/segment`,
      NicoliveClient.jsonBody({ state: 'on_air' }),
    );
  }

  /** 番組を終了 */
  async endProgram(programID: string): Promise<WrappedResult<Segment['data']>> {
    return this.requestAPI<Segment['data']>(
      'PUT',
      `${NicoliveClient.live2BaseURL}/watch/${programID}/segment`,
      NicoliveClient.jsonBody({ state: 'end' }),
    );
  }

  /** 番組を延長 */
  async extendProgram(
    programID: string,
    minutes: number = 30,
  ): Promise<WrappedResult<Extension['data']>> {
    return this.requestAPI<Extension['data']>(
      'POST',
      `${NicoliveClient.live2BaseURL}/watch/${programID}/extension`,
      NicoliveClient.jsonBody({ minutes }),
    );
  }

  /** 運営コメントを送信 */
  async sendOperatorComment(
    programID: string,
    { text, isPermCommand }: { text: string; isPermCommand?: boolean },
  ): Promise<WrappedResult<void>> {
    return this.requestAPI<void>(
      'PUT',
      `${NicoliveClient.live2BaseURL}/watch/${programID}/operator_comment`,
      NicoliveClient.jsonBody({ text, isPermCommand }),
    );
  }

  /** 統計情報（視聴者とコメント数）を取得 */
  async fetchStatistics(programID: string): Promise<WrappedResult<Statistics['data']>> {
    return this.requestAPI<Statistics['data']>(
      'GET',
      `${NicoliveClient.live2BaseURL}/watch/${programID}/statistics`,
    );
  }

  // 関心が別だが他の場所におく程の理由もないのでここにおく
  /**
   * ニコニ広告ptとギフトptを取得
   * 放送開始前は404になる
   **/
  async fetchNicoadStatistics(programID: string): Promise<WrappedResult<NicoadStatistics['data']>> {
    return this.requestAPI<NicoadStatistics['data']>(
      'GET',
      `${NicoliveClient.nicoadBaseURL}/v1/live/statusarea/${programID}`,
    );
  }

  async fetchFilters(programID: string): Promise<WrappedResult<Filters['data']>> {
    return this.requestAPI<Filters['data']>(
      'GET',
      `${NicoliveClient.live2BaseURL}/unama/tool/v2/programs/${programID}/ssng`,
    );
  }

  async addFilters(
    programID: string,
    records: AddFilterRecord[],
  ): Promise<WrappedResult<AddFilterResult['data']>> {
    if (records.length !== 1) {
      throw new Error('addFilters: records.length must be 1');
    }
    return this.requestAPI<AddFilterResult['data']>(
      'POST',
      `${NicoliveClient.live2BaseURL}/unama/tool/v2/programs/${programID}/ssng/create`,
      NicoliveClient.jsonBody(records[0]),
    );
  }

  async deleteFilters(
    programID: string,
    ids: FilterRecord['id'][],
    idsByModerator: FilterRecord['id'][],
  ): Promise<WrappedResult<void>> {
    return this.requestAPI<void>(
      'DELETE',
      `${NicoliveClient.live2BaseURL}/unama/tool/v2/programs/${programID}/ssng`,
      NicoliveClient.jsonBody({ id: ids, idByModerator: idsByModerator }),
    );
  }

  // 関心が別だが他の場所におく程の理由もないのでここにおく
  /** ユーザーアイコンを取得 */
  static getUserIconURL(userId: string, hash: string): string {
    const dir = Math.floor(Number(userId) / 10000);
    const url = `${NicoliveClient.userIconBaseURL}${dir}/${userId}.jpg?${hash}`;
    return url;
  }
  static defaultUserIconURL = `${NicoliveClient.userIconBaseURL}defaults/blank.jpg`;

  // 関心が別だが他の場所におく程の理由もないのでここにおく
  /*
   * 放送可能なユーザー番組IDを取得する
   * 放送可能な番組がない場合はundefinedを返す
   */
  async fetchOnairUserProgram(): Promise<OnairUserProgramData> {
    const url = `${NicoliveClient.live2BaseURL}/unama/tool/v2/onairs/user`;
    const headers = new Headers();
    const userSession = await this.fetchSession();
    headers.append('X-niconico-session', userSession);
    const request = new Request(url, { headers });
    return await fetch(request)
      .then(handleErrors)
      .then(response => response.json())
      .then(json => json.data);
  }

  /**
   * 放送可能なチャンネル番組IDを取得する
   * @param channelId チャンネルID(例： ch12345)
   */
  async fetchOnairChannelProgram(
    channelId: string,
  ): Promise<WrappedResult<OnairChannelProgramData>> {
    return this.requestAPI<OnairChannelProgramData>(
      'GET',
      `${NicoliveClient.live2BaseURL}/unama/tool/v2/onairs/channels/${channelId}`,
    );
  }

  /**
   * 放送可能なチャンネル一覧を取得する
   */
  async fetchOnairChannels(): Promise<WrappedResult<OnairChannelData[]>> {
    return this.requestAPI<OnairChannelData[]>(
      'GET',
      `${NicoliveClient.live2BaseURL}/unama/tool/v2/onairs/channels`,
    );
  }

  /**
   * 指定番組IDのストリーム情報を取得する
   * @param programId 番組ID(例： lv12345)
   */
  async fetchBroadcastStream(programId: string): Promise<BroadcastStreamData> {
    const url = `${NicoliveClient.live2BaseURL}/unama/api/v2/programs/${programId}/broadcast_stream`;
    const headers = new Headers();
    const userSession = await this.fetchSession();
    headers.append('X-niconico-session', userSession);
    const request = new Request(url, { headers });
    return fetch(request)
      .then(handleErrors)
      .then(response => response.json())
      .then(json => json.data);
  }

  async fetchMaxQuality(programId: string): Promise<Quality> {
    const fallback: Quality = { bitrate: 192, height: 288, fps: 30 } as const;
    const programInformation = await this.fetchProgram(programId);
    if (!isOk(programInformation)) {
      return fallback;
    }

    return parseMaxQuality(programInformation.value.streamSetting.maxQuality, fallback);
  }

  /** 番組作成画面を開いて結果を返す */
  async createProgram(): Promise<CreateResult> {
    const win = new BrowserWindow({
      width: 1200,
      height: 900,
      webPreferences: {
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
      },
    });
    NicoliveClient.registerWindow('createProgram', win);
    win.removeMenu();
    Sentry.addBreadcrumb({
      category: 'createProgram.open',
    });
    return new Promise<CreateResult>((resolve, _reject) => {
      addClipboardMenu(win);
      win.on('closed', () => resolve(CreateResult.OTHER));
      win.webContents.on('did-navigate', (_event, url) => {
        Sentry.addBreadcrumb({
          category: 'createProgram.did-navigate',
          message: url,
        });
        if (NicoliveClient.isProgramPage(url)) {
          resolve(CreateResult.CREATED);
          win.close();
        } else if (NicoliveClient.isMyPage(url)) {
          resolve(CreateResult.RESERVED);
          win.close();
        } else if (!NicoliveClient.isAllowedURL(url)) {
          Sentry.withScope(scope => {
            scope.setLevel('warning');
            scope.setTag('url', url);
            scope.setFingerprint(['createProgram', 'did-navigate', url]);
            Sentry.captureMessage('createProgram did-navigate to unexpected URL');
          });
          resolve(CreateResult.OTHER);
          remote.shell.openExternal(url);
          win.close();
        }
      });
      ipcRenderer.send('window-preventLogout', win.id);
      ipcRenderer.send('window-preventNewWindow', win.id);
      const url = 'https://live.nicovideo.jp/create';
      win.loadURL(url)?.catch(error => {
        if (error instanceof Error) {
          Sentry.withScope(scope => {
            scope.setLevel('warning');
            scope.setExtra('url', url);
            scope.setFingerprint(['createProgram', 'loadURL', url]);
            Sentry.captureException(error);
          });
        }
      });
    }).then(result => {
      Sentry.addBreadcrumb({
        category: 'createProgram.close',
        message: result,
      });
      return result;
    });
  }

  private editProgramWindow: Electron.BrowserWindow = null;
  private editProgramId = '';

  /** 番組編集画面を開いて結果を返す */
  async editProgram(programID: string): Promise<EditResult> {
    if (this.editProgramWindow) {
      if (this.editProgramId === programID) {
        this.editProgramWindow.focus();
        return EditResult.OTHER;
      }
      this.editProgramWindow.close();
    }
    const win = new BrowserWindow({
      width: 1200,
      height: 900,
      webPreferences: {
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
      },
    });
    NicoliveClient.registerWindow('editProgram', win);
    win.removeMenu();
    this.editProgramWindow = win;
    this.editProgramId = programID;
    Sentry.addBreadcrumb({
      category: 'editProgram.open',
      message: programID,
    });

    return new Promise<EditResult>((resolve, _reject) => {
      addClipboardMenu(win);
      win.on('closed', () => {
        this.editProgramWindow = null;
        this.editProgramId = '';
        resolve(EditResult.OTHER);
      });
      win.webContents.on('did-navigate', (_event, url) => {
        if (NicoliveClient.isProgramPage(url) || NicoliveClient.isMyPage(url)) {
          resolve(EditResult.EDITED);
          win.close();
        } else if (!NicoliveClient.isAllowedURL(url)) {
          Sentry.withScope(scope => {
            scope.setLevel('warning');
            scope.setTag('url', url);
            scope.setTag('programID', programID);
            scope.setFingerprint(['editProgram', 'did-navigate', url]);
            Sentry.captureMessage('editProgram did-navigate to unexpected URL');
          });
          resolve(EditResult.OTHER);
          remote.shell.openExternal(url);
          win.close();
        }
      });
      ipcRenderer.send('window-preventLogout', win.id);
      ipcRenderer.send('window-preventNewWindow', win.id);
      const url = `https://live.nicovideo.jp/edit/${programID}`;
      win.loadURL(url)?.catch(error => {
        if (error instanceof Error) {
          Sentry.withScope(scope => {
            scope.setLevel('warning');
            scope.setExtra('url', url);
            scope.setTag('programID', programID);
            scope.setFingerprint(['editProgram', 'loadURL', url]);
            Sentry.captureException(error);
          });
        }
      });
    }).then(result => {
      Sentry.addBreadcrumb({
        category: 'editProgram.close',
        message: result,
      });
      return result;
    });
  }

  // 関心が別だが他の場所におく程の理由もないのでここにおく
  /**
   * ユーザーの好みタグを取得する
   * @param userId
   * @returns
   */
  async fetchKonomiTags(userId: string): Promise<KonomiTag[]> {
    const res = await fetch(
      `${NicoliveClient.live2ApiBaseURL}/api/v1/konomiTags/GetFollowing`,
      NicoliveClient.createRequest(
        'POST',
        NicoliveClient.jsonBody(
          { follower_id: { value: userId, type: 'USER' } },
          { 'x-service-id': 'n-air-app' },
        ),
      ),
    );
    if (res.ok) {
      const json = (await res.json()) as KonomiTags;
      return json.konomi_tags;
    }
    throw new Error(`fetchKonomiTags failed: ${res.status} ${res.statusText}`);
  }

  static userFollowEndpoint(userId: string): string {
    return `${NicoliveClient.userFollowBaseURL}/v1/user/followees/niconico-users/${userId}.json`;
  }

  /**
   * ユーザーのフォロー状態を取得する
   * @param userId 対象ユーザーID
   * @returns フォロー中ならtrue
   */
  async fetchUserFollow(userId: string): Promise<boolean> {
    const res = await fetch(
      NicoliveClient.userFollowEndpoint(userId),
      NicoliveClient.createRequest('GET', {
        headers: NicoliveClient.FrontendIdHeader,
      }),
    );
    if (res.ok) {
      const json = await res.json();
      console.info('fetchUserFollow', json);
      if (isValidUserFollowStatusResponse(json)) {
        return json.data.following;
      }
    }
    throw new Error(`fetchUserFollow failed: ${res.status} ${res.statusText}`);
  }

  private prepareUserFollowApi() {
    const session = remote.session;
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: [NicoliveClient.userFollowEndpoint('*')] },
      (details, callback) => {
        details.requestHeaders['Origin'] = null;
        callback({ cancel: false, requestHeaders: details.requestHeaders });
      },
    );
  }
  /**
   * ユーザーをフォローする
   * @param userId 対象ユーザーID
   */
  async followUser(userId: string): Promise<void> {
    this.prepareUserFollowApi();
    const res = await fetch(
      NicoliveClient.userFollowEndpoint(userId),
      NicoliveClient.createRequest('POST', {
        headers: {
          ...NicoliveClient.FrontendIdHeader,
          'X-Request-With': 'N Air',
        },
      }),
    );
    if (!res.ok) {
      throw new Error(`followUser failed: ${res.status} ${res.statusText}`);
    }
  }

  /**
   * ユーザーのフォローを解除する
   * @param userId 対象ユーザーID
   */
  async unFollowUser(userId: string): Promise<void> {
    this.prepareUserFollowApi();
    const res = await fetch(
      NicoliveClient.userFollowEndpoint(userId),
      NicoliveClient.createRequest('DELETE', {
        headers: {
          ...NicoliveClient.FrontendIdHeader,
          'X-Request-With': 'N Air',
        },
      }),
    );
    if (!res.ok) {
      console.info('unFollowUser', userId, res, await res.json());
      throw new Error(`unFollowUser failed: ${res.status} ${res.statusText}`);
    }
  }

  async fetchModerators(): Promise<WrappedResult<Moderator[]>> {
    return this.requestAPI<Moderator[]>(
      'GET',
      `${NicoliveClient.live2BaseURL}/unama/api/v2/broadcasters/moderators`,
    );
  }

  /**
   * 配信者の設定のモデレーターを追加する
   * @param userId
   * @returns
   */
  async addModerator(userId: string): Promise<WrappedResult<AddModerator>> {
    return this.requestAPI<AddModerator>(
      'POST',
      `${NicoliveClient.live2BaseURL}/unama/api/v2/broadcasters/moderators`,
      NicoliveClient.jsonBody({ userId: parseInt(userId, 10) }, NicoliveClient.FrontendIdHeader),
    );
  }
  async removeModerator(userId: string): Promise<WrappedResult<void>> {
    return this.requestAPI<void>(
      'DELETE',
      `${NicoliveClient.live2BaseURL}/unama/api/v2/broadcasters/moderators?userId=${userId}`,
      {
        headers: NicoliveClient.FrontendIdHeader,
      },
    );
  }

  async fetchSupporters(
    {
      limit,
      offset,
    }: {
      limit?: number;
      offset?: number;
    } = { limit: 1000, offset: 0 },
  ): Promise<WrappedResult<Supporters['data']>> {
    return this.requestAPI<Supporters['data']>(
      'GET',
      `${NicoliveClient.live2ApiBaseURL}/api/v1/broadcaster/supporters?limit=${limit}&offset=${offset}`,
    );
  }
}
