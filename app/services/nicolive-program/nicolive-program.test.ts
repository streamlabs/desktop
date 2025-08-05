import { jest_fn } from 'util/jest_fn';
import { createSetupFunction } from 'util/test-setup';
import { MAX_PROGRAM_DURATION_SECONDS } from './nicolive-constants';
import { calcServerClockOffsetSec, type NicoliveClient } from './NicoliveClient';
import { ProgramInfo } from './ResponseTypes';

import type {
  INicoliveProgramState,
  NicoliveProgramService as NicoliveProgramServiceType,
  Schedule,
} from './nicolive-program';

const rooms: ProgramInfo['data']['rooms'] = [{ viewUri: 'https://example.com/lv1' }];

const schedules: Dictionary<Schedule> = {
  ch: {
    nicoliveProgramId: 'lv1',
    socialGroupId: 'ch1',
    status: 'onAir',
    testBeginAt: 0,
    onAirBeginAt: 100,
    onAirEndAt: 150,
  },
  onAir: {
    nicoliveProgramId: 'lv1',
    socialGroupId: 'co1',
    status: 'onAir',
    testBeginAt: 0,
    onAirBeginAt: 100,
    onAirEndAt: 150,
  },
  test: {
    nicoliveProgramId: 'lv1',
    socialGroupId: 'co1',
    status: 'test',
    testBeginAt: 0,
    onAirBeginAt: 100,
    onAirEndAt: 150,
  },
  end: {
    nicoliveProgramId: 'lv1',
    socialGroupId: 'co1',
    status: 'end',
    testBeginAt: 0,
    onAirBeginAt: 100,
    onAirEndAt: 150,
  },
  reserved1: {
    nicoliveProgramId: 'lv1',
    socialGroupId: 'co1',
    status: 'reserved',
    testBeginAt: 0,
    onAirBeginAt: 150,
    onAirEndAt: 200,
  },
  reserved2: {
    nicoliveProgramId: 'lv1',
    socialGroupId: 'co1',
    status: 'reserved',
    testBeginAt: 0,
    onAirBeginAt: 250,
    onAirEndAt: 300,
  },
};

const programs: Dictionary<Partial<ProgramInfo['data']>> = {
  test: {
    status: schedules.test.status,
    title: '番組タイトル',
    description: '番組詳細情報',
    beginAt: schedules.test.onAirBeginAt,
    endAt: schedules.test.onAirEndAt,
    vposBaseAt: schedules.test.onAirBeginAt,
    isMemberOnly: true,
    rooms,
  },
  onAir: {
    status: schedules.onAir.status,
    title: '番組タイトル',
    description: '番組詳細情報',
    beginAt: schedules.onAir.onAirBeginAt,
    endAt: schedules.onAir.onAirEndAt,
    vposBaseAt: schedules.onAir.onAirBeginAt,
    isMemberOnly: true,
    rooms,
  },
};

// fetchProgramPassword でパスワードが設定されていない番組のエラー値
const PROGRAM_PASSWORD_NOT_SET = {
  meta: { status: 404, errorCode: 'NOT_PASSWORD_PROGRAM' },
} as const;

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
  BrowserWindow: jest.fn().mockName('BrowserWindow'),
}));

beforeEach(() => {
  jest.doMock('services/core/stateful-service');
  jest.doMock('services/core/injector');
});

afterEach(() => {
  jest.resetModules();
});

function setupInstance(options: { mockSetState: boolean } = { mockSetState: false }) {
  const NicoliveProgramService = require('./nicolive-program')
    .NicoliveProgramService as typeof NicoliveProgramServiceType;
  const instance = NicoliveProgramService.instance as NicoliveProgramServiceType;
  const setState = jest.fn().mockName('setState');
  if (options.mockSetState) {
    (instance as any).setState = setState; // private method
  }

  return { NicoliveProgramService, instance, setState };
}

test('get instance', () => {
  setup();
  const { NicoliveProgramService } = setupInstance();
  expect(NicoliveProgramService.instance).toBeInstanceOf(NicoliveProgramService);
});

test('isProgramExtendable', () => {
  setup();
  const { NicoliveProgramService } = setupInstance();
  const { isProgramExtendable } = NicoliveProgramService;
  const initialState = NicoliveProgramService.initialState;

  const SAFE_TIME = MAX_PROGRAM_DURATION_SECONDS - 30 * 60;
  expect(
    isProgramExtendable({ ...initialState, status: 'reserved', startTime: 0, endTime: SAFE_TIME }),
  ).toBe(false);
  expect(
    isProgramExtendable({ ...initialState, status: 'test', startTime: 0, endTime: SAFE_TIME }),
  ).toBe(false);
  expect(
    isProgramExtendable({ ...initialState, status: 'onAir', startTime: 0, endTime: SAFE_TIME }),
  ).toBe(true);
  expect(
    isProgramExtendable({ ...initialState, status: 'end', startTime: 0, endTime: SAFE_TIME }),
  ).toBe(false);
  expect(
    isProgramExtendable({
      ...initialState,
      status: 'onAir',
      startTime: 0,
      endTime: MAX_PROGRAM_DURATION_SECONDS,
    }),
  ).toBe(false);
});

test('findSuitableProgram', () => {
  setup();
  const { NicoliveProgramService } = setupInstance();
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
  ['CREATED', 2],
  ['RESERVED', 0],
  ['OTHER', 0],
])('createProgram with %s', async (result: string, fetchProgramCalled: number) => {
  setup();
  const { instance } = setupInstance();

  let resolved: (value: string) => void;
  const promise = new Promise<string>(r => {
    resolved = r;
  });
  instance.client.createProgram = jest
    .fn()
    .mockName('client.createProgram')
    .mockResolvedValue(promise);
  instance.fetchProgram = jest.fn().mockName('fetchProgram');

  // 二重に呼べることを確認
  const firstCall = instance.createProgram();
  const secondCall = instance.createProgram();
  resolved(result);
  await expect(firstCall).resolves.toBe(result);
  await expect(secondCall).resolves.toBe(result);
  expect(instance.client.createProgram).toHaveBeenCalledTimes(2);
  expect(instance.fetchProgram).toHaveBeenCalledTimes(fetchProgramCalled);
});

test.each([
  ['EDITED', 1],
  ['OTHER', 0],
])('editProgram with %s', async (result: string, refreshProgramCalled: number) => {
  setup();
  const { instance } = setupInstance();

  instance.client.editProgram = jest.fn().mockName('editProgram').mockResolvedValue(result);
  instance.refreshProgram = jest.fn().mockName('refreshProgram');

  await expect(instance.editProgram()).resolves.toBe(result);
  expect(instance.client.editProgram).toHaveBeenCalledTimes(1);
  expect(instance.refreshProgram).toHaveBeenCalledTimes(refreshProgramCalled);
});

test('fetchProgramで結果が空ならエラー', async () => {
  setup();
  const { instance, setState } = setupInstance({ mockSetState: true });

  instance.client.fetchProgramSchedules = jest
    .fn()
    .mockName('fetchProgramSchedules')
    .mockResolvedValue({ ok: true, value: [] });

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
  expect(setState).toHaveBeenCalledTimes(3);
  expect(setState.mock.calls).toMatchInlineSnapshot(`
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
  const { instance, setState } = setupInstance({ mockSetState: true });

  instance.client.fetchProgramSchedules = jest
    .fn()
    .mockResolvedValue({ ok: true, value: [schedules.test] });
  instance.client.fetchProgram = jest
    .fn()
    .mockName('fetchProgram')
    .mockResolvedValue({ ok: true, value: programs.test });
  instance.client.fetchProgramPassword = jest
    .fn()
    .mockName('fetchProgramPassword')
    .mockResolvedValue({
      ok: false,
      value: PROGRAM_PASSWORD_NOT_SET,
    });

  await expect(instance.fetchProgram()).resolves.toBeUndefined();
  expect(instance.client.fetchProgramSchedules).toHaveBeenCalledTimes(1);
  expect(instance.client.fetchProgram).toHaveBeenCalledTimes(1);
  expect(setState.mock.calls).toMatchInlineSnapshot(`
    [
      [
        {
          "isFetching": true,
        },
      ],
      [
        {
          "description": "番組詳細情報",
          "endTime": 150,
          "isMemberOnly": true,
          "programID": "lv1",
          "serverClockOffsetSec": 0,
          "startTime": 100,
          "status": "test",
          "title": "番組タイトル",
          "viewUri": "https://example.com/lv1",
          "vposBaseTime": 100,
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
  const { instance, setState } = setupInstance({ mockSetState: true });

  instance.client.fetchProgramSchedules = jest
    .fn()
    .mockResolvedValue({ ok: true, value: [schedules.onAir] });
  instance.client.fetchProgram = jest
    .fn()
    .mockName('fetchProgram')
    .mockResolvedValue({ ok: true, value: programs.onAir });
  instance.client.fetchProgramPassword = jest
    .fn()
    .mockName('fetchProgramPassword')
    .mockResolvedValue({
      ok: true,
      value: { password: 'password' },
    });

  // TODO: StatefulServiceのモックをVue非依存にする

  await expect(instance.fetchProgram()).resolves.toBeUndefined();
  expect(instance.client.fetchProgramSchedules).toHaveBeenCalledTimes(1);
  expect(instance.client.fetchProgram).toHaveBeenCalledTimes(1);
  expect(setState.mock.calls).toMatchInlineSnapshot(`
    [
      [
        {
          "isFetching": true,
        },
      ],
      [
        {
          "description": "番組詳細情報",
          "endTime": 150,
          "isMemberOnly": true,
          "password": "password",
          "programID": "lv1",
          "serverClockOffsetSec": 0,
          "startTime": 100,
          "status": "onAir",
          "title": "番組タイトル",
          "viewUri": "https://example.com/lv1",
          "vposBaseTime": 100,
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
  const { instance, setState } = setupInstance({ mockSetState: true });
  const value = { meta: { status: 404 } };

  instance.client.fetchProgramSchedules = jest
    .fn()
    .mockResolvedValue({ ok: true, value: [schedules.onAir] });
  instance.client.fetchProgram = jest.fn().mockName('fetchProgram').mockResolvedValue({
    ok: false,
    value,
  });

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
  expect(setState).toHaveBeenCalledTimes(2);
});

test('fetchProgramでコミュ情報がエラーでも番組があったら先に進む', async () => {
  setup();
  const { instance, setState } = setupInstance({ mockSetState: true });

  instance.client.fetchProgramSchedules = jest
    .fn()
    .mockResolvedValue({ ok: true, value: [schedules.onAir] });
  instance.client.fetchProgram = jest.fn().mockName('fetchProgram').mockResolvedValue({
    ok: true,
    value: programs.onAir,
  });
  instance.client.fetchProgramPassword = jest
    .fn()
    .mockName('fetchProgramPassword')
    .mockResolvedValue({
      ok: false,
      value: PROGRAM_PASSWORD_NOT_SET,
    });

  await expect(instance.fetchProgram()).resolves.toBeUndefined();
  expect(instance.client.fetchProgramSchedules).toHaveBeenCalledTimes(1);
  expect(instance.client.fetchProgram).toHaveBeenCalledTimes(1);
  expect(setState.mock.calls).toMatchInlineSnapshot(`
    [
      [
        {
          "isFetching": true,
        },
      ],
      [
        {
          "description": "番組詳細情報",
          "endTime": 150,
          "isMemberOnly": true,
          "programID": "lv1",
          "serverClockOffsetSec": 0,
          "startTime": 100,
          "status": "onAir",
          "title": "番組タイトル",
          "viewUri": "https://example.com/lv1",
          "vposBaseTime": 100,
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
  const { instance, setState } = setupInstance({ mockSetState: true });

  instance.client.fetchProgram = jest
    .fn()
    .mockName('fetchProgram')
    .mockResolvedValue({ ok: true, value: programs.onAir });

  await expect(instance.refreshProgram()).resolves.toBeUndefined();
  expect(instance.client.fetchProgram).toHaveBeenCalledTimes(1);
  expect(instance.client.fetchProgram).toHaveBeenCalledWith('lv1');
  expect(setState).toHaveBeenCalledTimes(1);
  expect(setState.mock.calls[0]).toMatchInlineSnapshot(`
    [
      {
        "description": "番組詳細情報",
        "endTime": 150,
        "isMemberOnly": true,
        "serverClockOffsetSec": 0,
        "startTime": 100,
        "status": "onAir",
        "title": "番組タイトル",
        "viewUri": "https://example.com/lv1",
      },
    ]
  `);
});

test('refreshProgram:失敗', async () => {
  setup();
  const { instance, setState } = setupInstance({ mockSetState: true });
  const value = { meta: { status: 500 } };

  instance.client.fetchProgram = jest
    .fn()
    .mockName('fetchProgram')
    .mockResolvedValue({ ok: false, value });

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
  expect(setState).not.toHaveBeenCalled();
});

test('endProgram:成功', async () => {
  setup();
  const { instance, setState } = setupInstance({ mockSetState: true });

  instance.client.endProgram = jest
    .fn()
    .mockName('endProgram')
    .mockResolvedValue({ ok: true, value: { end_time: 125 } });

  await expect(instance.endProgram()).resolves.toBeUndefined();
  expect(instance.client.endProgram).toHaveBeenCalledTimes(1);
  expect(instance.client.endProgram).toHaveBeenCalledWith('lv1');
  expect(setState).toHaveBeenCalledTimes(3);
  expect(setState.mock.calls).toMatchInlineSnapshot(`
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
  const { instance, setState } = setupInstance({ mockSetState: true });

  const value = { meta: { status: 500 } };
  instance.client.endProgram = jest
    .fn()
    .mockName('endProgram')
    .mockResolvedValue({ ok: false, value });

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
  expect(setState).toHaveBeenCalledTimes(2);
});

test('extendProgram:成功', async () => {
  setup();
  const { instance, setState } = setupInstance({ mockSetState: true });

  instance.client.extendProgram = jest
    .fn()
    .mockResolvedValue({ ok: true, value: { end_time: 125 } });

  await expect(instance.extendProgram()).resolves.toBeUndefined();
  expect(instance.client.extendProgram).toHaveBeenCalledTimes(1);
  expect(instance.client.extendProgram).toHaveBeenCalledWith('lv1');
  expect(setState).toHaveBeenCalledTimes(3);
  expect(setState.mock.calls).toMatchInlineSnapshot(`
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
  const { instance, setState } = setupInstance({ mockSetState: true });

  const value = { meta: { status: 500 } };
  instance.client.extendProgram = jest
    .fn()
    .mockName('extendProgram')
    .mockResolvedValue({ ok: false, value });

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
  expect(setState).toHaveBeenCalledTimes(2);
});

describe('refreshStatisticsPolling', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const suites: {
    name: string;
    prev: Partial<INicoliveProgramState> | null;
    next: Partial<INicoliveProgramState> | null;
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
      jest.spyOn(window, 'setInterval').mockImplementation(jest.fn().mockName('setInterval'));
      jest.spyOn(window, 'clearInterval').mockImplementation(jest.fn().mockName('clearInterval'));

      setup();
      const { instance } = setupInstance();
      const state = instance.state;

      instance.updateStatistics = jest.fn().mockName('updateStatistics');

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
  const { instance, setState } = setupInstance({ mockSetState: true });

  instance.client.fetchStatistics = jest
    .fn()
    .mockResolvedValue({ ok: true, value: { watchCount: 123, commentCount: 456 } });
  instance.client.fetchNicoadStatistics = jest
    .fn()
    .mockResolvedValue({ ok: true, value: { totalAdPoint: 175, totalGiftPoint: 345 } });

  await expect(instance.updateStatistics('lv1')).resolves.toBeInstanceOf(Array);
  expect(instance.client.fetchStatistics).toHaveBeenCalledTimes(1);
  expect(instance.client.fetchStatistics).toHaveBeenCalledWith('lv1');
  expect(instance.client.fetchNicoadStatistics).toHaveBeenCalledTimes(1);
  expect(instance.client.fetchNicoadStatistics).toHaveBeenCalledWith('lv1');
  expect(setState).toHaveBeenCalledTimes(2);
  expect(setState.mock.calls).toMatchInlineSnapshot(`
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
  const { instance, setState } = setupInstance({ mockSetState: true });

  instance.client.fetchStatistics = jest
    .fn()
    .mockResolvedValue({ ok: false, value: { meta: { status: 500 } } });
  instance.client.fetchNicoadStatistics = jest
    .fn()
    .mockResolvedValue({ ok: false, value: { meta: { status: 500 } } });

  await expect(instance.updateStatistics('lv1')).resolves.toBeInstanceOf(Array);
  expect(instance.client.fetchStatistics).toHaveBeenCalledTimes(1);
  expect(instance.client.fetchStatistics).toHaveBeenCalledWith('lv1');
  expect(instance.client.fetchNicoadStatistics).toHaveBeenCalledTimes(1);
  expect(instance.client.fetchNicoadStatistics).toHaveBeenCalledWith('lv1');
  expect(setState).not.toHaveBeenCalled();
});

describe('refreshProgramStatusTimer', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const suites: {
    name: string;
    prev: Partial<INicoliveProgramState> | null;
    next: Partial<INicoliveProgramState> | null;
    result: 'REFRESH' | 'STOP' | 'NOOP';
  }[] = [
    {
      name: '初期状態から予約状態の番組を開くとタイマーを更新する',
      prev: null,
      next: { status: 'reserved', programID: 'lv1', startTime: 200, endTime: 300 },
      result: 'REFRESH',
    },
    {
      name: '初期状態からテスト状態の番組を開くとタイマーを更新する',
      prev: null,
      next: { status: 'test', programID: 'lv1', startTime: 200, endTime: 300 },
      result: 'REFRESH',
    },
    {
      name: '初期状態から放送中状態の番組を開くとタイマーを更新する',
      prev: null,
      next: { status: 'onAir', programID: 'lv1', startTime: 200, endTime: 300 },
      result: 'REFRESH',
    },
    {
      name: '初期状態から終了状態の番組を開くとタイマーは止まったまま',
      prev: null,
      next: { status: 'end', programID: 'lv1', startTime: 200, endTime: 300 },
      result: 'NOOP',
    },
    {
      name: '終了状態から予約状態になったらタイマーを更新する',
      prev: { status: 'end', programID: 'lv0', startTime: 20, endTime: 30 },
      next: { status: 'reserved', programID: 'lv1', startTime: 200, endTime: 300 },
      result: 'REFRESH',
    },
    {
      name: '予約状態なら毎回タイマーを更新する(30分前境界超え対策)',
      prev: { status: 'reserved', programID: 'lv1', startTime: 30 * 60 - 1, endTime: 300 },
      next: { status: 'reserved', programID: 'lv1', startTime: 30 * 60 - 1, endTime: 300 },
      result: 'REFRESH',
    },
    {
      name: '予約状態から放送中状態になったらタイマーを更新する',
      prev: { status: 'reserved', programID: 'lv1', startTime: 200, endTime: 300 },
      next: { status: 'onAir', programID: 'lv1', startTime: 200, endTime: 300 },
      result: 'REFRESH',
    },
    {
      name: 'テスト状態から放送中状態になったらタイマーを更新する',
      prev: { status: 'test', programID: 'lv1', startTime: 200, endTime: 300 },
      next: { status: 'onAir', programID: 'lv1', startTime: 200, endTime: 300 },
      result: 'REFRESH',
    },
    {
      name: 'テスト状態から終了状態になったらタイマーを止める',
      prev: { status: 'onAir', programID: 'lv1', startTime: 200, endTime: 300 },
      next: { status: 'end', programID: 'lv1', startTime: 200, endTime: 300 },
      result: 'STOP',
    },
    {
      name: '放送中に終了時間が変わったらタイマーを更新する',
      prev: { status: 'onAir', programID: 'lv1', startTime: 200, endTime: 300 },
      next: { status: 'onAir', programID: 'lv1', startTime: 200, endTime: 350 },
      result: 'REFRESH',
    },
    {
      name: '何も変わらなければ何もしない',
      prev: { status: 'onAir', programID: 'lv1', startTime: 200, endTime: 300 },
      next: { status: 'onAir', programID: 'lv1', startTime: 200, endTime: 300 },
      result: 'NOOP',
    },
    // 以下、N Air外部で状態を操作した場合に壊れないことを保証したい
    {
      name: '予約状態から別番組の予約状態になったらタイマーを更新する',
      prev: { status: 'reserved', programID: 'lv1', startTime: 200, endTime: 300 },
      next: { status: 'reserved', programID: 'lv2', startTime: 500, endTime: 600 },
      result: 'REFRESH',
    },
    {
      name: 'テスト状態から別番組のテスト状態になったらタイマーを更新する',
      prev: { status: 'test', programID: 'lv1', startTime: 200, endTime: 300 },
      next: { status: 'test', programID: 'lv2', startTime: 500, endTime: 600 },
      result: 'REFRESH',
    },
    {
      name: '放送中状態から別番組の放送中状態になったらタイマーを更新する',
      prev: { status: 'onAir', programID: 'lv1', startTime: 200, endTime: 300 },
      next: { status: 'onAir', programID: 'lv2', startTime: 500, endTime: 600 },
      result: 'REFRESH',
    },
    {
      name: '終了状態から別番組の終了状態になってもタイマーは止まったまま',
      prev: { status: 'end', programID: 'lv1', startTime: 200, endTime: 300 },
      next: { status: 'end', programID: 'lv2', startTime: 500, endTime: 600 },
      result: 'NOOP',
    },
  ];

  for (const suite of suites) {
    test(suite.name, () => {
      setup();
      const { instance } = setupInstance();

      jest.spyOn(window, 'setTimeout').mockImplementation(jest.fn().mockName('setTimeout'));
      jest.spyOn(window, 'clearTimeout').mockImplementation(jest.fn().mockName('clearTimeout'));
      jest.spyOn(Date, 'now').mockImplementation(jest.fn().mockName('now').mockReturnValue(50));

      instance.updateStatistics = jest.fn().mockName('updateStatistics');
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
    prev: Partial<INicoliveProgramState> | null;
    next: Partial<INicoliveProgramState> | null;
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
      const { instance } = setupInstance();

      jest.spyOn(window, 'setTimeout').mockImplementation(jest.fn().mockName('setTimeout'));
      jest.spyOn(window, 'clearTimeout').mockImplementation(jest.fn().mockName('clearTimeout'));
      jest.spyOn(Date, 'now').mockImplementation(
        jest
          .fn()
          .mockName('now')
          .mockReturnValue(suite.now * 1000),
      );

      instance.client.extendProgram = jest.fn().mockName('extendProgram');
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

test('serverClockOffsetSec に基づいて correctedNowMs が計算される', async () => {
  setup();
  const { instance } = setupInstance();

  const SERVER_NOW = 0;
  const OFFSET = 5; // clientが5秒進んでいる
  const CLIENT_NOW = SERVER_NOW + OFFSET * 1000;
  jest.spyOn(Date, 'now').mockImplementation(jest.fn().mockName('now').mockReturnValue(CLIENT_NOW));
  jest.spyOn(window, 'setTimeout').mockImplementation(jest.fn().mockName('setTimeout'));
  jest.spyOn(window, 'clearTimeout').mockImplementation(jest.fn().mockName('clearTimeout'));

  instance.client.fetchProgram = jest_fn<NicoliveClient['fetchProgram']>().mockResolvedValue({
    ok: true,
    value: {
      status: 'end',
      rooms: [],
    } as ProgramInfo['data'],
    serverDateMs: SERVER_NOW,
  });
  expect(calcServerClockOffsetSec({ serverDateMs: SERVER_NOW }, CLIENT_NOW)).toBe(OFFSET);

  await instance.refreshProgram();
  expect(instance.client.fetchProgram).toHaveBeenCalledTimes(1);

  expect(instance.state.serverClockOffsetSec).toBe(OFFSET);
  expect(instance.correctedNowMs(CLIENT_NOW)).toBe(SERVER_NOW);
});
