import { createSetupFunction } from 'util/test-setup';
import { WrappedResult } from './NicoliveClient';
import { Community } from './ResponseTypes';
import { MAX_PROGRAM_DURATION_SECONDS } from './nicolive-constants';

type NicoliveProgramService = import('./nicolive-program').NicoliveProgramService;

const rooms = [{ id: 0, name: 'arena', webSocketUri: 'https://example.com/lv1', threadId: 'hoge' }];

const schedules = {
  ch: {
    nicoliveProgramId: 'lv1',
    socialGroupId: 'ch1',
    status: 'onAir',
    vposBaseAt: 50,
    onAirBeginAt: 100,
    onAirEndAt: 150,
    rooms,
  },
  onAir: {
    nicoliveProgramId: 'lv1',
    socialGroupId: 'co1',
    status: 'onAir',
    vposBaseAt: 50,
    onAirBeginAt: 100,
    onAirEndAt: 150,
    rooms,
  },
  test: {
    nicoliveProgramId: 'lv1',
    socialGroupId: 'co1',
    status: 'test',
    vposBaseAt: 50,
    onAirBeginAt: 100,
    onAirEndAt: 150,
    rooms,
  },
  end: {
    nicoliveProgramId: 'lv1',
    socialGroupId: 'co1',
    status: 'end',
    vposBaseAt: 50,
    onAirBeginAt: 100,
    onAirEndAt: 150,
    rooms,
  },
  reserved1: {
    nicoliveProgramId: 'lv1',
    socialGroupId: 'co1',
    status: 'reserved',
    vposBaseAt: 50,
    onAirBeginAt: 150,
    onAirEndAt: 200,
    rooms,
  },
  reserved2: {
    nicoliveProgramId: 'lv1',
    socialGroupId: 'co1',
    status: 'reserved',
    vposBaseAt: 50,
    onAirBeginAt: 250,
    onAirEndAt: 300,
    rooms,
  },
};

const programs = {
  test: {
    status: schedules.test.status,
    title: '番組タイトル',
    description: '番組詳細情報',
    beginAt: schedules.test.onAirBeginAt,
    endAt: schedules.test.onAirEndAt,
    vposBaseAt: schedules.test.vposBaseAt,
    isMemberOnly: true,
    rooms,
  },
  onAir: {
    status: schedules.onAir.status,
    title: '番組タイトル',
    description: '番組詳細情報',
    beginAt: schedules.onAir.onAirBeginAt,
    endAt: schedules.onAir.onAirEndAt,
    vposBaseAt: schedules.onAir.vposBaseAt,
    isMemberOnly: true,
    rooms,
  },
};

const setup = createSetupFunction({
  state: {
    NicoliveProgramService: {
      programID: 'lv1',
    },
  },
  injectee: {
    NicoliveProgramStateService: {
      updated: {
        subscribe() {},
      },
    },
    UserService: {
      userLoginState: {
        subscribe() {},
      },
      isLoggedIn: () => true,
    },
    CustomizationService: {
      settingsChanged: {
        subscribe() {},
      },
      state: {},
    },
  },
});

jest.mock('services/user', () => ({ UserService: {} }));
jest.mock('services/nicolive-program/state', () => ({ NicoliveProgramStateService: {} }));
jest.mock('services/i18n', () => ({
  $t: (x: any) => x,
}));
jest.mock('util/menus/Menu', () => ({}));
jest.mock('@electron/remote', () => ({
  BrowserWindow: jest.fn(),
}));

beforeEach(() => {
  jest.doMock('services/core/stateful-service');
  jest.doMock('services/core/injector');
});

afterEach(() => {
  jest.resetModules();
});

test('get instance', () => {
  setup();
  const { NicoliveProgramService } = require('./nicolive-program');
  expect(NicoliveProgramService.instance).toBeInstanceOf(NicoliveProgramService);
});

test('isProgramExtendable', () => {
  setup();
  const { NicoliveProgramService } = require('./nicolive-program');
  const { isProgramExtendable } = NicoliveProgramService;

  const SAFE_TIME = MAX_PROGRAM_DURATION_SECONDS - 30 * 60;
  expect(isProgramExtendable({ status: 'reserved', startTime: 0, endTime: SAFE_TIME })).toBe(false);
  expect(isProgramExtendable({ status: 'test', startTime: 0, endTime: SAFE_TIME })).toBe(false);
  expect(isProgramExtendable({ status: 'onAir', startTime: 0, endTime: SAFE_TIME })).toBe(true);
  expect(isProgramExtendable({ status: 'end', startTime: 0, endTime: SAFE_TIME })).toBe(false);
  expect(
    isProgramExtendable({ status: 'onAir', startTime: 0, endTime: MAX_PROGRAM_DURATION_SECONDS }),
  ).toBe(false);
});

test('findSuitableProgram', () => {
  setup();
  const { NicoliveProgramService } = require('./nicolive-program');
  const { findSuitableProgram } = NicoliveProgramService;

  const { ch, reserved1, reserved2, test, onAir, end } = schedules;

  expect(findSuitableProgram([])).toBeNull();
  expect(findSuitableProgram([ch])).toBeNull();
  expect(findSuitableProgram([end])).toBeNull();
  expect(findSuitableProgram([ch, test])).toBe(test);
  expect(findSuitableProgram([ch, onAir])).toBe(onAir);
  expect(findSuitableProgram([ch, reserved1])).toBe(reserved1);
  expect(findSuitableProgram([ch, reserved1, test])).toBe(test);
  expect(findSuitableProgram([ch, reserved1, onAir])).toBe(onAir);
  expect(findSuitableProgram([reserved1, reserved2])).toBe(reserved1);
  expect(findSuitableProgram([reserved2, reserved1])).toBe(reserved1);
  expect(findSuitableProgram([reserved2])).toBe(reserved2);
});

test.each([
  ['CREATED', 1],
  ['RESERVED', 0],
  ['OTHER', 0],
])('createProgram with %s', async (result: string, fetchProgramCalled: number) => {
  setup();
  const { NicoliveProgramService } = require('./nicolive-program');
  const instance = NicoliveProgramService.instance as NicoliveProgramService;

  instance.client.createProgram = jest.fn().mockResolvedValue(result);
  instance.fetchProgram = jest.fn();

  await expect(instance.createProgram()).resolves.toBe(result);
  expect(instance.client.createProgram).toHaveBeenCalledTimes(1);
  expect(instance.fetchProgram).toHaveBeenCalledTimes(fetchProgramCalled);
});

test.each([
  ['EDITED', 1],
  ['OTHER', 0],
])('editProgram with %s', async (result: string, refreshProgramCalled: number) => {
  setup();
  const m = require('./nicolive-program');
  const instance = m.NicoliveProgramService.instance as NicoliveProgramService;

  instance.client.editProgram = jest.fn().mockResolvedValue(result);
  instance.refreshProgram = jest.fn();

  await expect(instance.editProgram()).resolves.toBe(result);
  expect(instance.client.editProgram).toHaveBeenCalledTimes(1);
  expect(instance.refreshProgram).toHaveBeenCalledTimes(refreshProgramCalled);
});

test('fetchProgramで結果が空ならエラー', async () => {
  setup();
  const { NicoliveProgramService } = require('./nicolive-program');
  const instance = NicoliveProgramService.instance as NicoliveProgramService;

  instance.client.fetchProgramSchedules = jest.fn().mockResolvedValue({ ok: true, value: [] });
  (instance as any).setState = jest.fn();

  await expect(instance.fetchProgram()).rejects.toMatchInlineSnapshot(`
                              NicoliveFailure {
                                "additionalMessage": "",
                                "errorCode": "",
                                "method": "fetchProgram",
                                "reason": "no_suitable_program",
                                "type": "logic",
                              }
                        `);
  expect(instance.client.fetchProgramSchedules).toHaveBeenCalledTimes(1);
  expect((instance as any).setState).toHaveBeenCalledTimes(3);
  expect((instance as any).setState.mock.calls).toMatchInlineSnapshot(`
    [
      [
        {
          "isFetching": true,
        },
      ],
      [
        {
          "status": "end",
        },
      ],
      [
        {
          "isFetching": false,
        },
      ],
    ]
  `);
});

test('fetchProgram:testのときはshowPlaceholderをtrueにする', async () => {
  setup();
  const { NicoliveProgramService } = require('./nicolive-program');
  const instance = NicoliveProgramService.instance as NicoliveProgramService;

  instance.client.fetchProgramSchedules = jest
    .fn()
    .mockResolvedValue({ ok: true, value: [schedules.test] });
  instance.client.fetchProgram = jest.fn().mockResolvedValue({ ok: true, value: programs.test });
  instance.client.fetchCommunity = jest.fn().mockResolvedValue({
    ok: true,
    value: { name: 'community.name', icon: { url: { size_64x64: 'symbol url' } } },
  } as WrappedResult<Community>);

  (instance as any).setState = jest.fn();

  await expect(instance.fetchProgram()).resolves.toBeUndefined();
  expect(instance.client.fetchProgramSchedules).toHaveBeenCalledTimes(1);
  expect(instance.client.fetchProgram).toHaveBeenCalledTimes(1);
  expect(instance.client.fetchCommunity).toHaveBeenCalledTimes(1);
  expect((instance as any).setState.mock.calls).toMatchInlineSnapshot(`
    [
      [
        {
          "isFetching": true,
        },
      ],
      [
        {
          "communityID": "co1",
          "communityName": "community.name",
          "communitySymbol": "symbol url",
          "description": "番組詳細情報",
          "endTime": 150,
          "isMemberOnly": true,
          "programID": "lv1",
          "roomThreadID": "hoge",
          "roomURL": "https://example.com/lv1",
          "startTime": 100,
          "status": "test",
          "title": "番組タイトル",
          "vposBaseTime": 50,
        },
      ],
      [
        {
          "showPlaceholder": true,
        },
      ],
      [
        {
          "isFetching": false,
        },
      ],
    ]
  `);
});

test('fetchProgram:成功', async () => {
  setup();
  const { NicoliveProgramService } = require('./nicolive-program');
  const instance = NicoliveProgramService.instance as NicoliveProgramService;

  instance.client.fetchProgramSchedules = jest
    .fn()
    .mockResolvedValue({ ok: true, value: [schedules.onAir] });
  instance.client.fetchProgram = jest.fn().mockResolvedValue({ ok: true, value: programs.onAir });
  instance.client.fetchCommunity = jest.fn().mockResolvedValue({
    ok: true,
    value: { name: 'community.name', icon: { url: { size_64x64: 'symbol url' } } },
  } as WrappedResult<Community>);

  // TODO: StatefulServiceのモックをVue非依存にする
  (instance as any).setState = jest.fn();

  await expect(instance.fetchProgram()).resolves.toBeUndefined();
  expect(instance.client.fetchProgramSchedules).toHaveBeenCalledTimes(1);
  expect(instance.client.fetchProgram).toHaveBeenCalledTimes(1);
  expect(instance.client.fetchCommunity).toHaveBeenCalledTimes(1);
  expect((instance as any).setState.mock.calls).toMatchInlineSnapshot(`
    [
      [
        {
          "isFetching": true,
        },
      ],
      [
        {
          "communityID": "co1",
          "communityName": "community.name",
          "communitySymbol": "symbol url",
          "description": "番組詳細情報",
          "endTime": 150,
          "isMemberOnly": true,
          "programID": "lv1",
          "roomThreadID": "hoge",
          "roomURL": "https://example.com/lv1",
          "startTime": 100,
          "status": "onAir",
          "title": "番組タイトル",
          "vposBaseTime": 50,
        },
      ],
      [
        {
          "isFetching": false,
        },
      ],
    ]
  `);
});

test('fetchProgramで番組があったが取りに行ったらエラー', async () => {
  setup();
  const { NicoliveProgramService } = require('./nicolive-program');
  const instance = NicoliveProgramService.instance as NicoliveProgramService;
  const value = { meta: { status: 404 } };

  instance.client.fetchProgramSchedules = jest
    .fn()
    .mockResolvedValue({ ok: true, value: [schedules.onAir] });
  instance.client.fetchProgram = jest.fn().mockResolvedValue({
    ok: false,
    value,
  });
  instance.client.fetchCommunity = jest.fn().mockResolvedValue({
    ok: true,
    value: { name: 'community.name', thumbnailUrl: { small: 'symbol url' } },
  });

  (instance as any).setState = jest.fn();

  await expect(instance.fetchProgram()).rejects.toMatchInlineSnapshot(`
                              NicoliveFailure {
                                "additionalMessage": "",
                                "errorCode": "",
                                "method": "fetchProgram",
                                "reason": "404",
                                "type": "http_error",
                              }
                        `);
  expect(instance.client.fetchProgramSchedules).toHaveBeenCalledTimes(1);
  expect(instance.client.fetchProgram).toHaveBeenCalledTimes(1);
  expect(instance.client.fetchCommunity).toHaveBeenCalledTimes(1);
  expect((instance as any).setState).toHaveBeenCalledTimes(2);
});

test('fetchProgramでコミュ情報がエラーでも番組があったら先に進む', async () => {
  setup();
  const { NicoliveProgramService } = require('./nicolive-program');
  const instance = NicoliveProgramService.instance as NicoliveProgramService;
  const value = { meta: { status: 404 } };

  instance.client.fetchProgramSchedules = jest
    .fn()
    .mockResolvedValue({ ok: true, value: [schedules.onAir] });
  instance.client.fetchProgram = jest.fn().mockResolvedValue({
    ok: true,
    value: programs.onAir,
  });
  instance.client.fetchCommunity = jest.fn().mockResolvedValue({ ok: false, value });

  (instance as any).setState = jest.fn();

  await expect(instance.fetchProgram()).resolves.toBeUndefined();
  expect(instance.client.fetchProgramSchedules).toHaveBeenCalledTimes(1);
  expect(instance.client.fetchProgram).toHaveBeenCalledTimes(1);
  expect(instance.client.fetchCommunity).toHaveBeenCalledTimes(1);
  expect((instance as any).setState.mock.calls).toMatchInlineSnapshot(`
    [
      [
        {
          "isFetching": true,
        },
      ],
      [
        {
          "communityID": "co1",
          "communityName": "(コミュニティの取得に失敗しました)",
          "communitySymbol": "",
          "description": "番組詳細情報",
          "endTime": 150,
          "isMemberOnly": true,
          "programID": "lv1",
          "roomThreadID": "hoge",
          "roomURL": "https://example.com/lv1",
          "startTime": 100,
          "status": "onAir",
          "title": "番組タイトル",
          "vposBaseTime": 50,
        },
      ],
      [
        {
          "isFetching": false,
        },
      ],
    ]
  `);
});

test('refreshProgram:成功', async () => {
  setup();
  const m = require('./nicolive-program');
  const instance = m.NicoliveProgramService.instance as NicoliveProgramService;

  instance.client.fetchProgram = jest.fn().mockResolvedValue({ ok: true, value: programs.onAir });

  (instance as any).setState = jest.fn();

  await expect(instance.refreshProgram()).resolves.toBeUndefined();
  expect(instance.client.fetchProgram).toHaveBeenCalledTimes(1);
  expect(instance.client.fetchProgram).toHaveBeenCalledWith('lv1');
  expect((instance as any).setState).toHaveBeenCalledTimes(1);
  expect((instance as any).setState.mock.calls[0]).toMatchInlineSnapshot(`
    [
      {
        "description": "番組詳細情報",
        "endTime": 150,
        "isMemberOnly": true,
        "roomThreadID": "hoge",
        "roomURL": "https://example.com/lv1",
        "startTime": 100,
        "status": "onAir",
        "title": "番組タイトル",
      },
    ]
  `);
});

test('refreshProgram:失敗', async () => {
  setup();
  const m = require('./nicolive-program');
  const instance = m.NicoliveProgramService.instance as NicoliveProgramService;
  const value = { meta: { status: 500 } };

  instance.client.fetchProgram = jest.fn().mockResolvedValue({ ok: false, value });

  (instance as any).setState = jest.fn();

  await expect(instance.refreshProgram()).rejects.toMatchInlineSnapshot(`
                              NicoliveFailure {
                                "additionalMessage": "",
                                "errorCode": "",
                                "method": "fetchProgram",
                                "reason": "500",
                                "type": "http_error",
                              }
                        `);
  expect(instance.client.fetchProgram).toHaveBeenCalledTimes(1);
  expect(instance.client.fetchProgram).toHaveBeenCalledWith('lv1');
  expect((instance as any).setState).not.toHaveBeenCalled();
});

test('endProgram:成功', async () => {
  setup();
  const m = require('./nicolive-program');
  const instance = m.NicoliveProgramService.instance as NicoliveProgramService;

  instance.client.endProgram = jest.fn().mockResolvedValue({ ok: true, value: { end_time: 125 } });
  (instance as any).setState = jest.fn();

  await expect(instance.endProgram()).resolves.toBeUndefined();
  expect(instance.client.endProgram).toHaveBeenCalledTimes(1);
  expect(instance.client.endProgram).toHaveBeenCalledWith('lv1');
  expect((instance as any).setState).toHaveBeenCalledTimes(3);
  expect((instance as any).setState.mock.calls).toMatchInlineSnapshot(`
    [
      [
        {
          "isEnding": true,
        },
      ],
      [
        {
          "endTime": 125,
          "status": "end",
        },
      ],
      [
        {
          "isEnding": false,
        },
      ],
    ]
  `);
});

test('endProgram:失敗', async () => {
  setup();
  const m = require('./nicolive-program');
  const instance = m.NicoliveProgramService.instance as NicoliveProgramService;

  const value = { meta: { status: 500 } };
  instance.client.endProgram = jest.fn().mockResolvedValue({ ok: false, value });
  (instance as any).setState = jest.fn();

  await expect(instance.endProgram()).rejects.toMatchInlineSnapshot(`
                              NicoliveFailure {
                                "additionalMessage": "",
                                "errorCode": "",
                                "method": "endProgram",
                                "reason": "500",
                                "type": "http_error",
                              }
                        `);
  expect(instance.client.endProgram).toHaveBeenCalledTimes(1);
  expect(instance.client.endProgram).toHaveBeenCalledWith('lv1');
  expect((instance as any).setState).toHaveBeenCalledTimes(2);
});

test('extendProgram:成功', async () => {
  setup();
  const m = require('./nicolive-program');
  const instance = m.NicoliveProgramService.instance as NicoliveProgramService;

  instance.client.extendProgram = jest
    .fn()
    .mockResolvedValue({ ok: true, value: { end_time: 125 } });
  (instance as any).setState = jest.fn();

  await expect(instance.extendProgram()).resolves.toBeUndefined();
  expect(instance.client.extendProgram).toHaveBeenCalledTimes(1);
  expect(instance.client.extendProgram).toHaveBeenCalledWith('lv1');
  expect((instance as any).setState).toHaveBeenCalledTimes(3);
  expect((instance as any).setState.mock.calls).toMatchInlineSnapshot(`
    [
      [
        {
          "isExtending": true,
        },
      ],
      [
        {
          "endTime": 125,
        },
      ],
      [
        {
          "isExtending": false,
        },
      ],
    ]
  `);
});

test('extendProgram:失敗', async () => {
  setup();
  const m = require('./nicolive-program');
  const instance = m.NicoliveProgramService.instance as NicoliveProgramService;

  const value = { meta: { status: 500 } };
  instance.client.extendProgram = jest.fn().mockResolvedValue({ ok: false, value });
  (instance as any).setState = jest.fn();

  await expect(instance.extendProgram()).rejects.toMatchInlineSnapshot(`
                              NicoliveFailure {
                                "additionalMessage": "",
                                "errorCode": "",
                                "method": "extendProgram",
                                "reason": "500",
                                "type": "http_error",
                              }
                        `);
  expect(instance.client.extendProgram).toHaveBeenCalledTimes(1);
  expect(instance.client.extendProgram).toHaveBeenCalledWith('lv1');
  expect((instance as any).setState).toHaveBeenCalledTimes(2);
});

describe('refreshStatisticsPolling', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const suites: {
    name: string;
    prev: any;
    next: any;
    result: 'REFRESH' | 'STOP' | 'NOOP';
  }[] = [
    {
      name: '初期状態から予約状態の番組を開くとタイマーは止まったまま',
      prev: null,
      next: { status: 'reserved', programID: 'lv1' },
      result: 'NOOP',
    },
    {
      name: '初期状態からテスト状態の番組を開くとタイマーは止まったまま',
      prev: null,
      next: { status: 'test', programID: 'lv1' },
      result: 'NOOP',
    },
    {
      name: '初期状態から放送中状態の番組を開くとタイマーを更新する',
      prev: null,
      next: { status: 'onAir', programID: 'lv1' },
      result: 'REFRESH',
    },
    {
      name: '初期状態から終了状態の番組を開くとタイマーは止まったまま',
      prev: null,
      next: { status: 'end', programID: 'lv1' },
      result: 'NOOP',
    },
    {
      name: '予約状態から放送中状態になったらタイマーを更新する',
      prev: { status: 'reserved', programID: 'lv1' },
      next: { status: 'onAir', programID: 'lv1' },
      result: 'REFRESH',
    },
    {
      name: 'テスト状態から放送中状態になったらタイマーを更新する',
      prev: { status: 'test', programID: 'lv1' },
      next: { status: 'onAir', programID: 'lv1' },
      result: 'REFRESH',
    },
    {
      name: 'テスト状態から終了状態になったらタイマーを止める',
      prev: { status: 'onAir', programID: 'lv1' },
      next: { status: 'end', programID: 'lv1' },
      result: 'STOP',
    },
    {
      name: '放送中状態から別番組の予約状態になったらタイマーを止める',
      prev: { status: 'onAir', programID: 'lv1' },
      next: { status: 'reserved', programID: 'lv2' },
      result: 'STOP',
    },
    {
      name: '放送中状態から別番組の放送中状態になったらタイマーを止める',
      prev: { status: 'onAir', programID: 'lv1' },
      next: { status: 'test', programID: 'lv2' },
      result: 'STOP',
    },
    {
      name: '放送中状態から別番組の放送中状態になったらタイマーを更新する',
      prev: { status: 'onAir', programID: 'lv1' },
      next: { status: 'onAir', programID: 'lv2' },
      result: 'REFRESH',
    },
    {
      name: '放送中状態から別番組の終了状態になったらタイマーを止める',
      prev: { status: 'onAir', programID: 'lv1' },
      next: { status: 'end', programID: 'lv2' },
      result: 'STOP',
    },
  ];

  for (const suite of suites) {
    test(suite.name, () => {
      jest.spyOn(window, 'setInterval').mockImplementation(jest.fn());
      jest.spyOn(window, 'clearInterval').mockImplementation(jest.fn());

      setup();
      const { NicoliveProgramService } = require('./nicolive-program');
      const instance = NicoliveProgramService.instance as NicoliveProgramService;
      const state = instance.state;

      instance.updateStatistics = jest.fn();

      instance.refreshStatisticsPolling({ ...state, ...suite.prev }, { ...state, ...suite.next });
      switch (suite.result) {
        case 'REFRESH':
          expect(window.clearInterval).toHaveBeenCalledTimes(1);
          expect(window.clearInterval).toHaveBeenCalledWith(0);
          expect(window.setInterval).toHaveBeenCalledTimes(1);
          expect(window.setInterval).toHaveBeenCalledWith(
            expect.anything(),
            60 * 1000,
            suite.next.programID,
          );
          break;
        case 'STOP':
          expect(window.clearInterval).toHaveBeenCalledTimes(1);
          expect(window.clearInterval).toHaveBeenCalledWith(0);
          expect(window.setInterval).not.toHaveBeenCalled();
          break;
        case 'NOOP':
          break;
      }
    });
  }
});

test('updateStatistics', async () => {
  setup();
  const { NicoliveProgramService } = require('./nicolive-program');
  const instance = NicoliveProgramService.instance as NicoliveProgramService;

  instance.client.fetchStatistics = jest
    .fn()
    .mockResolvedValue({ ok: true, value: { watchCount: 123, commentCount: 456 } });
  instance.client.fetchNicoadStatistics = jest
    .fn()
    .mockResolvedValue({ ok: true, value: { totalAdPoint: 175, totalGiftPoint: 345 } });

  (instance as any).setState = jest.fn();

  await expect(instance.updateStatistics('lv1')).resolves.toBeInstanceOf(Array);
  expect(instance.client.fetchStatistics).toHaveBeenCalledTimes(1);
  expect(instance.client.fetchStatistics).toHaveBeenCalledWith('lv1');
  expect(instance.client.fetchNicoadStatistics).toHaveBeenCalledTimes(1);
  expect(instance.client.fetchNicoadStatistics).toHaveBeenCalledWith('lv1');
  expect((instance as any).setState).toHaveBeenCalledTimes(2);
  expect((instance as any).setState.mock.calls).toMatchInlineSnapshot(`
    [
      [
        {
          "comments": 456,
          "viewers": 123,
        },
      ],
      [
        {
          "adPoint": 175,
          "giftPoint": 345,
        },
      ],
    ]
  `);
});

test('updateStatistics:APIがエラーでも無視', async () => {
  setup();
  const { NicoliveProgramService } = require('./nicolive-program');
  const instance = NicoliveProgramService.instance as NicoliveProgramService;

  instance.client.fetchStatistics = jest
    .fn()
    .mockResolvedValue({ ok: false, value: { meta: { status: 500 } } });
  instance.client.fetchNicoadStatistics = jest
    .fn()
    .mockResolvedValue({ ok: false, value: { meta: { status: 500 } } });

  (instance as any).setState = jest.fn();

  await expect(instance.updateStatistics('lv1')).resolves.toBeInstanceOf(Array);
  expect(instance.client.fetchStatistics).toHaveBeenCalledTimes(1);
  expect(instance.client.fetchStatistics).toHaveBeenCalledWith('lv1');
  expect(instance.client.fetchNicoadStatistics).toHaveBeenCalledTimes(1);
  expect(instance.client.fetchNicoadStatistics).toHaveBeenCalledWith('lv1');
  expect((instance as any).setState).not.toHaveBeenCalled();
});

describe('refreshProgramStatusTimer', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const suites: {
    name: string;
    prev: any;
    next: any;
    result: 'REFRESH' | 'STOP' | 'NOOP';
  }[] = [
    {
      name: '初期状態から予約状態の番組を開くとタイマーを更新する',
      prev: null,
      next: {
        status: 'reserved',
        programID: 'lv1',
        testStartTime: 100,
        startTime: 200,
        endTime: 300,
      },
      result: 'REFRESH',
    },
    {
      name: '初期状態からテスト状態の番組を開くとタイマーを更新する',
      prev: null,
      next: { status: 'test', programID: 'lv1', testStartTime: 100, startTime: 200, endTime: 300 },
      result: 'REFRESH',
    },
    {
      name: '初期状態から放送中状態の番組を開くとタイマーを更新する',
      prev: null,
      next: { status: 'onAir', programID: 'lv1', testStartTime: 100, startTime: 200, endTime: 300 },
      result: 'REFRESH',
    },
    {
      name: '初期状態から終了状態の番組を開くとタイマーは止まったまま',
      prev: null,
      next: { status: 'end', programID: 'lv1', testStartTime: 100, startTime: 200, endTime: 300 },
      result: 'NOOP',
    },
    {
      name: '終了状態から予約状態になったらタイマーを更新する',
      prev: { status: 'end', programID: 'lv0', testStartTime: 10, startTime: 20, endTime: 30 },
      next: {
        status: 'reserved',
        programID: 'lv1',
        testStartTime: 100,
        startTime: 200,
        endTime: 300,
      },
      result: 'REFRESH',
    },
    {
      name: '予約状態なら毎回タイマーを更新する(30分前境界超え対策)',
      prev: {
        status: 'reserved',
        programID: 'lv1',
        testStartTime: 100,
        startTime: 30 * 60 - 1,
        endTime: 300,
      },
      next: {
        status: 'reserved',
        programID: 'lv1',
        testStartTime: 100,
        startTime: 30 * 60 - 1,
        endTime: 300,
      },
      result: 'REFRESH',
    },
    {
      name: '予約状態から放送中状態になったらタイマーを更新する',
      prev: {
        status: 'reserved',
        programID: 'lv1',
        testStartTime: 100,
        startTime: 200,
        endTime: 300,
      },
      next: { status: 'onAir', programID: 'lv1', testStartTime: 100, startTime: 200, endTime: 300 },
      result: 'REFRESH',
    },
    {
      name: 'テスト状態から放送中状態になったらタイマーを更新する',
      prev: { status: 'test', programID: 'lv1', testStartTime: 100, startTime: 200, endTime: 300 },
      next: { status: 'onAir', programID: 'lv1', testStartTime: 100, startTime: 200, endTime: 300 },
      result: 'REFRESH',
    },
    {
      name: 'テスト状態から終了状態になったらタイマーを止める',
      prev: { status: 'onAir', programID: 'lv1', testStartTime: 100, startTime: 200, endTime: 300 },
      next: { status: 'end', programID: 'lv1', testStartTime: 100, startTime: 200, endTime: 300 },
      result: 'STOP',
    },
    {
      name: '放送中に終了時間が変わったらタイマーを更新する',
      prev: { status: 'onAir', programID: 'lv1', testStartTime: 100, startTime: 200, endTime: 300 },
      next: { status: 'onAir', programID: 'lv1', testStartTime: 100, startTime: 200, endTime: 350 },
      result: 'REFRESH',
    },
    {
      name: '何も変わらなければ何もしない',
      prev: { status: 'onAir', programID: 'lv1', testStartTime: 100, startTime: 200, endTime: 300 },
      next: { status: 'onAir', programID: 'lv1', testStartTime: 100, startTime: 200, endTime: 300 },
      result: 'NOOP',
    },
    // 以下、N Air外部で状態を操作した場合に壊れないことを保証したい
    {
      name: '予約状態から別番組の予約状態になったらタイマーを更新する',
      prev: {
        status: 'reserved',
        programID: 'lv1',
        testStartTime: 100,
        startTime: 200,
        endTime: 300,
      },
      next: {
        status: 'reserved',
        programID: 'lv2',
        testStartTime: 400,
        startTime: 500,
        endTime: 600,
      },
      result: 'REFRESH',
    },
    {
      name: 'テスト状態から別番組のテスト状態になったらタイマーを更新する',
      prev: { status: 'test', programID: 'lv1', testStartTime: 100, startTime: 200, endTime: 300 },
      next: { status: 'test', programID: 'lv2', testStartTime: 400, startTime: 500, endTime: 600 },
      result: 'REFRESH',
    },
    {
      name: '放送中状態から別番組の放送中状態になったらタイマーを更新する',
      prev: { status: 'onAir', programID: 'lv1', testStartTime: 100, startTime: 200, endTime: 300 },
      next: { status: 'onAir', programID: 'lv2', testStartTime: 400, startTime: 500, endTime: 600 },
      result: 'REFRESH',
    },
    {
      name: '終了状態から別番組の終了状態になってもタイマーは止まったまま',
      prev: { status: 'end', programID: 'lv1', testStartTime: 100, startTime: 200, endTime: 300 },
      next: { status: 'end', programID: 'lv2', testStartTime: 400, startTime: 500, endTime: 600 },
      result: 'NOOP',
    },
  ];

  for (const suite of suites) {
    test(suite.name, () => {
      setup();
      const m = require('./nicolive-program');
      const instance = m.NicoliveProgramService.instance as NicoliveProgramService;

      jest.spyOn(window, 'setTimeout').mockImplementation(jest.fn());
      jest.spyOn(window, 'clearTimeout').mockImplementation(jest.fn());
      jest.spyOn(Date, 'now').mockImplementation(jest.fn().mockReturnValue(50));

      instance.updateStatistics = jest.fn();
      const state = instance.state;

      instance.refreshProgramStatusTimer({ ...state, ...suite.prev }, { ...state, ...suite.next });
      switch (suite.result) {
        case 'REFRESH':
          expect(window.clearTimeout).toHaveBeenCalledTimes(1);
          expect(window.clearTimeout).toHaveBeenCalledWith(0);
          expect(window.setTimeout).toHaveBeenCalledTimes(1);
          expect(window.setTimeout).toHaveBeenCalledWith(expect.anything(), expect.anything());
          break;
        case 'STOP':
          expect(window.clearTimeout).toHaveBeenCalledTimes(1);
          expect(window.clearTimeout).toHaveBeenCalledWith(0);
          expect(window.setTimeout).not.toHaveBeenCalled();
          break;
        case 'NOOP':
          break;
      }
    });
  }
});

describe('refreshAutoExtensionTimer', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const suites: {
    name: string;
    prev: any;
    next: any;
    now: number;
    result: 'IMMEDIATE' | 'WAIT' | 'NOOP' | 'CLEAR';
  }[] = [
    {
      name: '初期値から遷移して延長が有効なとき放送中番組を取得して終了5分前を切っていると即延長する',
      prev: null,
      next: {
        status: 'onAir',
        programID: 'lv1',
        startTime: 0,
        endTime: 30 * 60,
        autoExtensionEnabled: true,
      },
      now: 25 * 60,
      result: 'IMMEDIATE',
    },
    {
      name: '初期値から遷移して延長が無効なとき放送中番組を取得して終了5分前を切っていても何もしない',
      prev: null,
      next: {
        status: 'onAir',
        programID: 'lv1',
        startTime: 0,
        endTime: 30 * 60,
        autoExtensionEnabled: false,
      },
      now: 25 * 60,
      result: 'NOOP',
    },
    {
      name: '初期値から遷移して延長が有効なとき放送中番組を取得して終了5分前より前ならタイマーをセットする',
      prev: null,
      next: {
        status: 'onAir',
        programID: 'lv1',
        startTime: 0,
        endTime: 30 * 60,
        autoExtensionEnabled: true,
      },
      now: 24 * 60,
      result: 'WAIT',
    },
    {
      name: '初期値から遷移して延長が無効なとき放送中番組を取得して終了5分前より前で何もしない',
      prev: null,
      next: {
        status: 'onAir',
        programID: 'lv1',
        startTime: 0,
        endTime: 30 * 60,
        autoExtensionEnabled: false,
      },
      now: 24 * 60,
      result: 'NOOP',
    },
    {
      name: '初期値から遷移して延長が有効なとき放送中番組でないなら何もしない',
      prev: null,
      next: {
        status: 'test',
        programID: 'lv1',
        startTime: 0,
        endTime: 30 * 60,
        autoExtensionEnabled: true,
      },
      now: -30 * 60,
      result: 'NOOP',
    },
    {
      name: '初期値から遷移して延長が無効なとき放送中番組でないなら何もしない',
      prev: null,
      next: {
        status: 'test',
        programID: 'lv1',
        startTime: 0,
        endTime: 30 * 60,
        autoExtensionEnabled: false,
      },
      now: -30 * 60,
      result: 'NOOP',
    },
    {
      name: '延長完了したらタイマーをセットする',
      prev: {
        status: 'onAir',
        programID: 'lv1',
        startTime: 0,
        endTime: 30 * 60,
        autoExtensionEnabled: true,
      },
      next: {
        status: 'onAir',
        programID: 'lv1',
        startTime: 0,
        endTime: 60 * 60,
        autoExtensionEnabled: true,
      },
      now: 25 * 60,
      result: 'WAIT',
    },
    {
      name: '終了時刻が変わって延長上限に当たったらタイマーをクリアする',
      prev: {
        status: 'onAir',
        programID: 'lv1',
        startTime: 0,
        endTime: 330 * 60,
        autoExtensionEnabled: true,
      },
      next: {
        status: 'onAir',
        programID: 'lv1',
        startTime: 0,
        endTime: 360 * 60,
        autoExtensionEnabled: true,
      },
      now: 325 * 60,
      result: 'CLEAR',
    },
    {
      name: '放送開始したらタイマーをセットする',
      prev: {
        status: 'test',
        programID: 'lv1',
        startTime: 0,
        endTime: 30 * 60,
        autoExtensionEnabled: true,
      },
      next: {
        status: 'onAir',
        programID: 'lv1',
        startTime: 0,
        endTime: 30 * 60,
        autoExtensionEnabled: true,
      },
      now: 0,
      result: 'WAIT',
    },
    {
      name: '放送終了したらタイマーをクリアする',
      prev: {
        status: 'onAir',
        programID: 'lv1',
        startTime: 0,
        endTime: 30 * 60,
        autoExtensionEnabled: true,
      },
      next: {
        status: 'end',
        programID: 'lv1',
        startTime: 0,
        endTime: 30 * 60,
        autoExtensionEnabled: true,
      },
      now: 30 * 60,
      result: 'CLEAR',
    },
    {
      name: '自動延長を有効にしたらタイマーをセットする',
      prev: {
        status: 'onAir',
        programID: 'lv1',
        startTime: 0,
        endTime: 30 * 60,
        autoExtensionEnabled: false,
      },
      next: {
        status: 'onAir',
        programID: 'lv1',
        startTime: 0,
        endTime: 30 * 60,
        autoExtensionEnabled: true,
      },
      now: 24 * 60,
      result: 'WAIT',
    },
    {
      name: '自動延長を切ったらタイマーをクリアする',
      prev: {
        status: 'onAir',
        programID: 'lv1',
        startTime: 0,
        endTime: 30 * 60,
        autoExtensionEnabled: true,
      },
      next: {
        status: 'onAir',
        programID: 'lv1',
        startTime: 0,
        endTime: 30 * 60,
        autoExtensionEnabled: false,
      },
      now: 24 * 60,
      result: 'CLEAR',
    },
  ];

  for (const suite of suites) {
    test(suite.name, () => {
      setup();
      const m = require('./nicolive-program');
      const instance = m.NicoliveProgramService.instance as NicoliveProgramService;

      jest.spyOn(window, 'setTimeout').mockImplementation(jest.fn());
      jest.spyOn(window, 'clearTimeout').mockImplementation(jest.fn());
      jest.spyOn(Date, 'now').mockImplementation(jest.fn().mockReturnValue(suite.now * 1000));

      instance.client.extendProgram = jest.fn();
      const state = instance.state;

      instance.refreshAutoExtensionTimer({ ...state, ...suite.prev }, { ...state, ...suite.next });
      switch (suite.result) {
        case 'IMMEDIATE':
          expect(window.clearTimeout).toHaveBeenCalledTimes(1);
          expect(window.clearTimeout).toHaveBeenCalledWith(0);
          expect(window.setTimeout).not.toHaveBeenCalled();
          expect(instance.client.extendProgram).toHaveBeenCalledTimes(1);
          expect(instance.client.extendProgram).toHaveBeenCalledWith('lv1');
          break;
        case 'WAIT':
          expect(window.clearTimeout).toHaveBeenCalledTimes(1);
          expect(window.clearTimeout).toHaveBeenCalledWith(0);
          expect(window.setTimeout).toHaveBeenCalledTimes(1);
          expect(window.setTimeout).toHaveBeenCalledWith(expect.anything(), expect.anything());
          expect(instance.client.extendProgram).not.toHaveBeenCalled();
          break;
        case 'NOOP':
          expect(window.clearTimeout).not.toHaveBeenCalled();
          expect(window.setTimeout).not.toHaveBeenCalled();
          expect(instance.client.extendProgram).not.toHaveBeenCalled();
          break;
        case 'CLEAR':
          expect(window.clearTimeout).toHaveBeenCalledTimes(1);
          expect(window.clearTimeout).toHaveBeenCalledWith(0);
      }
    });
  }
});
