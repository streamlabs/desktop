import * as fetchMock from 'fetch-mock';

jest.mock('services/i18n', () => ({
  $t: (x: any) => x,
}));
jest.mock('util/menus/Menu', () => ({}));
jest.mock('@electron/remote', () => ({
  BrowserWindow: jest.fn(),
}));
import type { MainProcessFetchResponse } from 'util/fetchViaMainProcess';
const fetchViaMainProcess = jest
  .fn<Promise<MainProcessFetchResponse>, [string, RequestInit]>()
  .mockName('fetchViaMainProcess');
jest.mock('util/fetchViaMainProcess', () => ({
  fetchViaMainProcess,
}));

import { NicoliveClient, parseMaxQuality } from './NicoliveClient';

afterEach(() => {
  fetchMock.reset();
  fetchViaMainProcess.mockReset();
});

describe('parseMaxQuality', () => {
  const fallback = { bitrate: 192, height: 288, fps: 30 };
  test.each([
    ['6Mbps720p', 6000, 720, 30],
    ['2Mbps450p', 2000, 450, 30],
    ['1Mbps450p', 1000, 450, 30],
    ['384kbps288p', 384, 288, 30],
    ['192kbps288p', 192, 288, 30],
    ['8Mbps1080p60fps', 8000, 1080, 60],
    ['invalid', fallback.bitrate, fallback.height, fallback.fps],
  ])(`%s => %d kbps, %d x %d`, (maxQuality, bitrate, height, fps) => {
    expect(parseMaxQuality(maxQuality, fallback)).toEqual({
      bitrate,
      height,
      fps,
    });
  });
});

test('constructor', () => {
  const client = new NicoliveClient();
  expect(client).toBeInstanceOf(NicoliveClient);
});

// 実際には叩かないのでなんでもよい
const programID = 'lv1';
const userID = 2;

const dummyURL = 'https://example.com';

const nicoliveWeb = 'https://live.nicovideo.jp';

const dummyBody = {
  meta: {
    status: 200,
    errorCode: 'OK',
  },
  data: 'dummy body',
};

const dummyErrorBody = {
  meta: {
    status: 404,
    errorCode: 'NOT_FOUND',
  },
};

test('wrapResultはレスポンスのdataを取り出す', async () => {
  fetchMock.get(dummyURL, dummyBody);
  const res = await fetch(dummyURL);

  await expect(NicoliveClient.wrapResult(res)).resolves.toEqual({
    ok: true,
    value: dummyBody.data,
  });
  expect(fetchMock.done()).toBe(true);
});

test('wrapResultは結果が200でないときレスポンス全体を返す', async () => {
  fetchMock.get(dummyURL, { body: dummyErrorBody, status: 404 });
  const res = await fetch(dummyURL);

  await expect(NicoliveClient.wrapResult(res)).resolves.toEqual({
    ok: false,
    value: dummyErrorBody,
  });
  expect(fetchMock.done()).toBe(true);
});

test('wrapResultはbodyがJSONでなければSyntaxErrorをwrapして返す', async () => {
  fetchMock.get(dummyURL, 'invalid json');
  const res = await fetch(dummyURL);

  await expect(NicoliveClient.wrapResult(res)).resolves.toMatchInlineSnapshot(`
    {
      "ok": false,
      "value": [SyntaxError: Unexpected token 'i', "invalid json" is not valid JSON],
    }
  `);
  expect(fetchMock.done()).toBe(true);
});

interface Suite {
  name: keyof NicoliveClient;
  method: 'get' | 'post' | 'put' | 'delete';
  base: string;
  path: string;
  args: any[];
}
const suites: Suite[] = [
  {
    name: 'fetchProgramSchedules',
    base: NicoliveClient.live2BaseURL,
    method: 'get',
    path: '/unama/tool/v1/program_schedules',
    args: [],
  },
  {
    name: 'fetchProgram',
    method: 'get',
    base: NicoliveClient.live2BaseURL,
    path: `/watch/${programID}/programinfo`,
    args: [programID],
  },
  {
    name: 'startProgram',
    method: 'put',
    base: NicoliveClient.live2BaseURL,
    path: `/watch/${programID}/segment`,
    args: [programID],
  },
  {
    name: 'endProgram',
    method: 'put',
    base: NicoliveClient.live2BaseURL,
    path: `/watch/${programID}/segment`,
    args: [programID],
  },
  {
    name: 'extendProgram',
    method: 'post',
    base: NicoliveClient.live2BaseURL,
    path: `/watch/${programID}/extension`,
    args: [programID],
  },
  {
    name: 'sendOperatorComment',
    method: 'put',
    base: NicoliveClient.live2BaseURL,
    path: `/watch/${programID}/operator_comment`,
    args: [programID, { text: 'comment text', isPermanent: true }],
  },
  {
    name: 'fetchStatistics',
    method: 'get',
    base: NicoliveClient.live2BaseURL,
    path: `/watch/${programID}/statistics`,
    args: [programID],
  },
  {
    name: 'fetchNicoadStatistics',
    method: 'get',
    base: NicoliveClient.nicoadBaseURL,
    path: `/v1/live/statusarea/${programID}`,
    args: [programID],
  },
  {
    name: 'fetchModerators',
    method: 'get',
    base: NicoliveClient.live2BaseURL,
    path: `/unama/api/v2/broadcasters/moderators`,
    args: [],
  },
  {
    name: 'addModerator',
    method: 'post',
    base: NicoliveClient.live2BaseURL,
    path: `/unama/api/v2/broadcasters/moderators`,
    args: [userID],
  },
  {
    name: 'removeModerator',
    method: 'delete',
    base: NicoliveClient.live2BaseURL,
    path: `/unama/api/v2/broadcasters/moderators?userId=${userID}`,
    args: [userID],
  },
  {
    name: 'fetchSupporters',
    method: 'get',
    base: NicoliveClient.live2ApiBaseURL,
    path: `/api/v1/broadcaster/supporters?limit=1000&offset=0`,
    args: [],
  },
];

suites.forEach((suite: Suite) => {
  test(`dataを取り出して返す - ${suite.name}`, async () => {
    // niconicoSession を与えないと、実行時の main process の cookieから取ろうとして失敗するので差し替える
    const client = new NicoliveClient({
      niconicoSession: 'dummy',
    });

    fetchMock[suite.method](suite.base + suite.path, dummyBody);
    // @ts-expect-error 引数の型
    const result = await client[suite.name](...suite.args);

    expect(result).toEqual({ ok: true, value: dummyBody.data });
    expect(fetchMock.done()).toBe(true);
  });
});

function setupMock() {
  class BrowserWindow {
    url: string = '';
    webContentsCallbacks: any[] = [];
    callbacks: any[] = [];

    webContents = {
      on: (_event: string, callback: (ev: any, url: string) => any) => {
        this.webContentsCallbacks.push(callback);
      },
    };
    on(event: string, callback: (evt: any) => any) {
      this.callbacks.push(callback);
    }
    loadURL(url: string) {
      this.url = url;
      for (const cb of this.webContentsCallbacks) {
        cb({ preventDefault() {} }, url);
      }
    }
    close = jest.fn().mockImplementation(() => {
      for (const cb of this.callbacks) {
        // 雑
        cb(null);
      }
    });
    removeMenu = jest.fn();
    options: any;
    constructor(options: any) {
      this.options = options;
      wrapper.browserWindow = this;
    }
  }

  const openExternal = jest.fn();
  let wrapper: {
    browserWindow: BrowserWindow;
    openExternal: jest.Mock;
  } = {
    browserWindow: null,
    openExternal,
  };
  jest.doMock('@electron/remote', () => ({
    BrowserWindow,
    shell: {
      openExternal,
    },
  }));
  jest.doMock('electron', () => ({
    ipcRenderer: {
      send() {},
    },
  }));

  return wrapper;
}

describe('webviews', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('createProgramで removeMenuが呼ばれる', async () => {
    const mock = setupMock();

    const { NicoliveClient } = require('./NicoliveClient');
    const client = new NicoliveClient();

    // don't await
    const result = expect(client.createProgram()).resolves.toBe('CREATED');
    mock.browserWindow.loadURL(`${nicoliveWeb}/watch/${programID}`);
    await result;
    expect(mock.browserWindow.removeMenu).toHaveBeenCalled();
  });

  test('createProgramで番組ページへ遷移すると番組を作成したことになる', async () => {
    const mock = setupMock();

    const { NicoliveClient } = require('./NicoliveClient');
    const client = new NicoliveClient();

    // don't await
    const result = expect(client.createProgram()).resolves.toBe('CREATED');
    mock.browserWindow.loadURL(`${nicoliveWeb}/watch/${programID}`);

    await result;
    expect(mock.browserWindow.close).toHaveBeenCalled();
  });

  test('createProgramでマイページに遷移すると番組を予約したことになる', async () => {
    const mock = setupMock();

    const { NicoliveClient } = require('./NicoliveClient');
    const client = new NicoliveClient();

    // don't await
    const result = expect(client.createProgram()).resolves.toBe('RESERVED');
    mock.browserWindow.loadURL(`${nicoliveWeb}/my`);

    await result;
    expect(mock.browserWindow.close).toHaveBeenCalled();
  });

  test('createProgramでニコ生外に出ると既定のブラウザで開いてwebviewは閉じる', async () => {
    const openExternal = jest.fn();
    const mock = setupMock();

    const { NicoliveClient } = require('./NicoliveClient');
    const client = new NicoliveClient();

    // don't await
    const result = expect(client.createProgram()).resolves.toBe('OTHER');
    mock.browserWindow.loadURL('https://example.com');

    await result;
    expect(mock.browserWindow.close).toHaveBeenCalled();
    expect(mock.openExternal).toHaveBeenCalledWith('https://example.com');
  });

  test('createProgramで何もせず画面を閉じても結果が返る', async () => {
    const mock = setupMock();

    const { NicoliveClient } = require('./NicoliveClient');
    const client = new NicoliveClient();

    // don't await
    const result = expect(client.createProgram()).resolves.toBe('OTHER');
    mock.browserWindow.close();

    await result;
    expect(mock.browserWindow.close).toHaveBeenCalled();
  });

  test('editProgramでremoveMenuが呼ばれる', async () => {
    const mock = setupMock();

    const { NicoliveClient } = require('./NicoliveClient');
    const client = new NicoliveClient();

    const result = expect(client.editProgram(programID)).resolves.toBe('EDITED');
    mock.browserWindow.loadURL(`${nicoliveWeb}/watch/${programID}`);
    await result;
    expect(mock.browserWindow.removeMenu).toHaveBeenCalled();
  });

  test('editProgramで番組ページへ遷移すると番組を作成したことになる', async () => {
    const mock = setupMock();

    const { NicoliveClient } = require('./NicoliveClient');
    const client = new NicoliveClient();

    // don't await
    const result = expect(client.editProgram(programID)).resolves.toBe('EDITED');
    mock.browserWindow.loadURL(`${nicoliveWeb}/watch/${programID}`);

    await result;
    expect(mock.browserWindow.close).toHaveBeenCalled();
  });

  test('editProgramでマイページに遷移すると番組を予約したことになる', async () => {
    const mock = setupMock();

    const { NicoliveClient } = require('./NicoliveClient');
    const client = new NicoliveClient();

    // don't await
    const result = expect(client.editProgram(programID)).resolves.toBe('EDITED');
    mock.browserWindow.loadURL(`${nicoliveWeb}/my`);

    await result;
    expect(mock.browserWindow.close).toHaveBeenCalled();
  });

  test('editProgramでニコ生外に出ると既定のブラウザで開いてwebviewは閉じる', async () => {
    const mock = setupMock();

    const { NicoliveClient } = require('./NicoliveClient');
    const client = new NicoliveClient();

    // don't await
    const result = expect(client.editProgram(programID)).resolves.toBe('OTHER');
    mock.browserWindow.loadURL('https://example.com');

    await result;
    expect(mock.browserWindow.close).toHaveBeenCalled();
    expect(mock.openExternal).toHaveBeenCalledWith('https://example.com');
  });

  test('editProgramで何もせず画面を閉じても結果が返る', async () => {
    const mock = setupMock();

    const { NicoliveClient } = require('./NicoliveClient');
    const client = new NicoliveClient();

    // don't await
    const result = expect(client.editProgram(programID)).resolves.toBe('OTHER');
    mock.browserWindow.close();

    await result;
    expect(mock.browserWindow.close).toHaveBeenCalled();
  });
});

describe('NicoliveClient.wrapResult', () => {
  const headers: [string, string][] = [['Date', 'Tue, 01 Jan 2019 00:00:00 GMT']];
  const serverDateMs = new Date('2019-01-01T00:00:00Z').valueOf();

  test.each<[string, boolean, string | null, MainProcessFetchResponse | Response]>(
    (
      [
        [200, '{"data": "ok"}', 'ok'],
        [204, null, null],
        [404, '"not found"', 'not found'],
      ] as [number, string, string | null][]
    ).flatMap(([status, text, expect]) =>
      [false, true].map<[string, boolean, string | null, MainProcessFetchResponse | Response]>(
        viaMainProcess => {
          const ok = status < 400;
          return [
            `status:${status} viaMainProcess:${viaMainProcess}`,
            ok,
            expect,
            viaMainProcess
              ? {
                  ok,
                  headers,
                  status,
                  text,
                }
              : new Response(text, { status, headers }),
          ];
        },
      ),
    ),
  )('%p ok:%p expect:%p', async (_label, ok, value, response) => {
    const res = await NicoliveClient.wrapResult<string>(response);
    console.log(res);
    expect(res).toEqual({
      ok,
      ...(ok ? { serverDateMs } : {}),
      value,
    });
  });
});

describe('NicoliveClient.deleteComment', () => {
  setupMock();
  const error = new Error('error');

  test.each<[boolean, string | Error, Promise<MainProcessFetchResponse>]>([
    [
      true,
      null,
      Promise.resolve<MainProcessFetchResponse>({ ok: true, headers: [], status: 204, text: '' }),
    ],
    [
      false,
      'not found',
      Promise.resolve<MainProcessFetchResponse>({
        ok: false,
        headers: [],
        status: 404,
        text: '"not found"',
      }),
    ],
    [false, error, Promise.reject(error)],
  ])('ok:%p expect value:%v', async (ok, value, response) => {
    fetchViaMainProcess.mockResolvedValueOnce(response);

    const client = new NicoliveClient({ niconicoSession: 'dummy' });
    {
      const res = client.deleteComment('lv1', '1');
      await expect(res).resolves.toEqual({ ok, serverDateMs: undefined, value });
      expect(fetchViaMainProcess).toHaveBeenCalledWith(expect.anything(), expect.anything());
    }
  });
});

// TODO add test for konomiTags, userFollow APIs
