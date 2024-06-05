import * as FakeTimers from '@sinonjs/fake-timers';
import { Subject } from 'rxjs';
import { jest_fn, type ObserveType } from 'util/jest_fn';
import { sleep } from 'util/sleep';
import { createSetupFunction } from 'util/test-setup';
import type { MessageResponse } from './MessageServerClient';
import { FilterRecord } from './ResponseTypes';
import { NicoliveModeratorsService } from './nicolive-moderators';

type NicoliveCommentViewerService =
  import('./nicolive-comment-viewer').NicoliveCommentViewerService;
type NicoliveSupportersService = import('./nicolive-supporters').NicoliveSupportersService;

const setup = createSetupFunction({
  injectee: {
    NicoliveCommentFilterService: {
      stateChange: new Subject(),
      isBroadcastersFilter: () => false,
    },
    NicoliveCommentLocalFilterService: {
      filterFn: () => true,
    },
    NicoliveCommentSynthesizerService: {
      stateChange: new Subject(),
      available: false,
    },
    NicoliveModeratorsService: {
      stateChange: new Subject(),
      refreshObserver: new Subject(),
      isModerator: () => false,
      disconnectNdgr() {},
    },
    NicoliveSupportersService: {
      update: () => Promise.resolve([]),
    },
    CustomizationService: {
      state: {
        compactModeNewComment: true,
      },
    },
    NicoliveProgramService: {
      hidePlaceholder() {},
    },
  },
});

jest.mock('services/nicolive-program/nicolive-program', () => ({
  NicoliveProgramService: {},
}));
jest.mock('services/nicolive-program/nicolive-comment-filter', () => ({
  NicoliveCommentFilterService: {},
}));
jest.mock('services/nicolive-program/nicolive-comment-local-filter', () => ({
  NicoliveCommentLocalFilterService: {},
}));
jest.mock('services/nicolive-program/nicolive-comment-synthesizer', () => ({
  NicoliveCommentSynthesizerService: {},
}));
jest.mock('services/nicolive-program/nicolive-moderators', () => ({
  NicoliveModeratorsService: {},
}));
jest.mock('services/nicolive-program/nicolive-supporters', () => ({
  NicoliveSupportersService: {},
}));
jest.mock('services/windows', () => ({
  WindowsService: {},
}));
jest.mock('services/customization', () => ({
  CustomizationService: {},
}));

beforeEach(() => {
  jest.doMock('services/core/stateful-service');
  jest.doMock('services/core/injector');
});

afterEach(() => {
  jest.resetModules();
});

test('接続先情報が来たら接続する', async () => {
  const stateChange = new Subject();
  const clientSubject = new Subject();
  jest.doMock('./MessageServerClient', () => ({
    ...(jest.requireActual('./MessageServerClient') as {}),
    MessageServerClient: class MessageServerClient {
      connect() {
        return clientSubject;
      }
      requestLatestMessages() {}
    },
  }));
  setup({ injectee: { NicoliveProgramService: { stateChange } } });

  const { NicoliveCommentViewerService } = require('./nicolive-comment-viewer');
  const instance = NicoliveCommentViewerService.instance as NicoliveCommentViewerService;

  expect(clientSubject.observers).toHaveLength(0);
  expect(stateChange.observers).toHaveLength(1);
  stateChange.next({ roomURL: 'https://example.com', roomThreadID: '175622' });
  await sleep(0);
  expect(clientSubject.observers).toHaveLength(2);
});

test('接続先情報が欠けていたら接続しない', () => {
  const stateChange = new Subject();
  const clientSubject = new Subject();
  jest.doMock('./MessageServerClient', () => ({
    MessageServerClient: class MessageServerClient {
      connect() {
        return clientSubject;
      }
      requestLatestMessages() {}
    },
  }));
  setup({ injectee: { NicoliveProgramService: { stateChange } } });

  const { NicoliveCommentViewerService } = require('./nicolive-comment-viewer');
  const instance = NicoliveCommentViewerService.instance as NicoliveCommentViewerService;

  expect(clientSubject.observers).toHaveLength(0);
  expect(stateChange.observers).toHaveLength(1);
  stateChange.next({ roomURL: 'https://example.com' });
  expect(clientSubject.observers).toHaveLength(0);
});

test('/disconnectが流れてきたらunsubscribeする', async () => {
  const stateChange = new Subject();
  const clientSubject = new Subject();
  jest.doMock('./MessageServerClient', () => {
    return {
      ...(jest.requireActual('./MessageServerClient') as {}),
      MessageServerClient: class MessageServerClient {
        connect() {
          return clientSubject;
        }
        requestLatestMessages() {}
      },
    };
  });
  jest.spyOn(window, 'setTimeout').mockImplementation(callback => callback() as any);
  setup({ injectee: { NicoliveProgramService: { stateChange } } });

  const { NicoliveCommentViewerService } = require('./nicolive-comment-viewer');
  const instance = NicoliveCommentViewerService.instance as NicoliveCommentViewerService;
  const unsubscribe = jest.fn();
  (instance as any).unsubscribe = unsubscribe;

  expect(clientSubject.observers).toHaveLength(0);
  expect(unsubscribe).toHaveBeenCalledTimes(0);
  stateChange.next({ roomURL: 'https://example.com', roomThreadID: '175622' });
  await sleep(0);
  expect(clientSubject.observers).toHaveLength(2);
  expect(unsubscribe).toHaveBeenCalledTimes(1);

  // 通常コメントではunsubscribeしない
  clientSubject.next({ chat: { premium: 1, content: '/disconnect' } });
  expect(unsubscribe).toHaveBeenCalledTimes(1);

  clientSubject.next({ chat: { premium: 2, content: '/disconnect' } });
  expect(unsubscribe).toHaveBeenCalledTimes(2);
});

const MODERATOR_ID = '123';
const NOT_MODERATOR_ID = '456';

function connectionSetup() {
  const stateChange = new Subject();
  const clientSubject = new Subject<MessageResponse>();
  const refreshObserver = new Subject<ObserveType<NicoliveModeratorsService['refreshObserver']>>();
  jest.doMock('./MessageServerClient', () => ({
    ...(jest.requireActual('./MessageServerClient') as {}),
    MessageServerClient: class MessageServerClient {
      connect() {
        return clientSubject;
      }
      requestLatestMessages() {}
    },
  }));
  setup({
    injectee: {
      NicoliveProgramService: {
        stateChange,
        stateService: {
          state: {},
        },
        checkNameplateHint: () => {},
      },
      NicoliveModeratorsService: {
        refreshObserver,
        isModerator: (userId: string) => {
          return userId === '123';
        },
      },
      NicoliveCommentFilterService: {
        addFilterCache: () => {},
        findFilterCache: () => ({ type: 'word', body: 'abc' } as FilterRecord),
        deleteFiltersCache: () => {},
      },
    },
  });

  const { NicoliveCommentViewerService } = require('./nicolive-comment-viewer');
  const instance = NicoliveCommentViewerService.instance as NicoliveCommentViewerService;

  stateChange.next({ roomURL: 'https://example.com', roomThreadID: '175622' });

  return {
    instance,
    clientSubject,
    refreshObserver,
  };
}

test('chatメッセージはstateに保持する', async () => {
  jest.spyOn(Date, 'now').mockImplementation(() => 1582175622000);
  const { instance, clientSubject } = connectionSetup();
  await sleep(0);

  clientSubject.next({
    chat: {
      content: 'yay',
    },
  });
  clientSubject.next({
    chat: {
      content: 'foo',
    },
  });

  // bufferTime tweaks
  clientSubject.complete();
  expect(clientSubject.hasError).toBeFalsy();
  expect(clientSubject.thrownError).toBeNull();

  expect(instance.state.messages).toMatchInlineSnapshot(`
    Array [
      Object {
        "component": "common",
        "seqId": 0,
        "type": "normal",
        "value": Object {
          "content": "yay",
        },
      },
      Object {
        "component": "common",
        "seqId": 1,
        "type": "normal",
        "value": Object {
          "content": "foo",
        },
      },
      Object {
        "component": "system",
        "seqId": 2,
        "type": "n-air-emulated",
        "value": Object {
          "content": "サーバーとの接続が終了しました",
          "date": 1582175622,
        },
      },
    ]
  `);
});

test('chatメッセージはstateに最新100件保持し、あふれた物がpopoutMessagesに残る', async () => {
  jest.spyOn(Date, 'now').mockImplementation(() => 1582175622000);
  const { instance, clientSubject } = connectionSetup();
  await sleep(0);

  const retainSize = 100;
  const numberOfSystemMessages = 1; // "サーバーとの接続が終了しました";

  const overflow = 2; // あふれ保持の順序確認用に2以上必要
  const chats = Array(retainSize - numberOfSystemMessages + overflow)
    .fill(0)
    .map((v, i) => `#${i}`);

  for (const chat of chats) {
    clientSubject.next({
      chat: {
        content: chat,
      },
    });
  }

  // bufferTime tweaks
  clientSubject.complete();

  expect(instance.state.messages.length).toEqual(retainSize);
  expect(instance.state.messages[0].value.content).toEqual(chats[overflow]);
  expect(instance.state.messages[retainSize - numberOfSystemMessages - 1].value.content).toEqual(
    chats[chats.length - 1],
  );
  expect(instance.state.popoutMessages.length).toEqual(overflow);
  expect(instance.state.popoutMessages[0].value.content).toEqual(chats[0]);
});

test('接続エラー時にメッセージを表示する', async () => {
  jest.spyOn(Date, 'now').mockImplementation(() => 1582175622000);
  const { instance, clientSubject } = connectionSetup();
  await sleep(0);

  const error = new Error('yay');

  clientSubject.error(error);

  // bufferTime tweaks
  clientSubject.complete();

  expect(instance.state.messages).toMatchInlineSnapshot(`
                          Array [
                            Object {
                              "component": "system",
                              "seqId": 0,
                              "type": "n-air-emulated",
                              "value": Object {
                                "content": "エラーが発生しました: yay",
                                "date": 1582175622,
                              },
                            },
                            Object {
                              "component": "system",
                              "seqId": 1,
                              "type": "n-air-emulated",
                              "value": Object {
                                "content": "サーバーとの接続が終了しました",
                                "date": 1582175622,
                              },
                            },
                          ]
                `);
});

test('スレッドの参加失敗時にメッセージを表示する', async () => {
  jest.spyOn(Date, 'now').mockImplementation(() => 1582175622000);
  const { instance, clientSubject } = connectionSetup();
  await sleep(0);

  clientSubject.next({
    thread: {
      resultcode: 1,
    },
  });

  // bufferTime tweaks
  clientSubject.complete();

  expect(instance.state.messages).toMatchInlineSnapshot(`
        Array [
          Object {
            "component": "system",
            "seqId": 0,
            "type": "n-air-emulated",
            "value": Object {
              "content": "コメントの取得に失敗しました",
              "date": 1582175622,
            },
          },
          Object {
            "component": "system",
            "seqId": 1,
            "type": "n-air-emulated",
            "value": Object {
              "content": "サーバーとの接続が終了しました",
              "date": 1582175622,
            },
          },
        ]
    `);
});

test('スレッドからの追い出し発生時にメッセージを表示する', async () => {
  jest.spyOn(Date, 'now').mockImplementation(() => 1582175622000);
  const { instance, clientSubject } = connectionSetup();
  await sleep(0);

  clientSubject.next({
    leave_thread: {},
  });

  // bufferTime tweaks
  clientSubject.complete();

  expect(instance.state.messages).toMatchInlineSnapshot(`
        Array [
          Object {
            "component": "system",
            "seqId": 0,
            "type": "n-air-emulated",
            "value": Object {
              "content": "コメントの取得に失敗しました",
              "date": 1582175622,
            },
          },
          Object {
            "component": "system",
            "seqId": 1,
            "type": "n-air-emulated",
            "value": Object {
              "content": "サーバーとの接続が終了しました",
              "date": 1582175622,
            },
          },
        ]
    `);
});

test('モデレーターによるSSNG追加・削除がきたらシステムメッセージが追加される', async () => {
  const { clientSubject, instance, refreshObserver } = connectionSetup();
  await sleep(0);

  const tests: {
    event: ObserveType<NicoliveModeratorsService['refreshObserver']>;
    message: string;
  }[] = [
    {
      event: {
        event: 'addSSNG',
        record: {
          id: 1,
          type: 'word',
          body: 'abc',
          userId: parseInt(MODERATOR_ID, 10),
          userName: 'test',
        },
      },
      message: 'test さんがコメントを配信からブロックしました',
    },
    {
      event: {
        event: 'removeSSNG',
        record: {
          ssngId: 1,
          userId: parseInt(MODERATOR_ID, 10),
          userName: 'test',
        },
      },
      message: 'test さんがコメントのブロックを取り消しました',
    },
    {
      event: {
        event: 'addSSNG',
        record: {
          id: 1,
          type: 'user',
          body: '456',
          userId: parseInt(MODERATOR_ID, 10),
          userName: 'test',
        },
      },
      message: 'test さんがユーザーを配信からブロックしました',
    },
    {
      event: {
        event: 'addSSNG',
        record: {
          id: 1,
          type: 'command',
          body: 'shita',
          userId: parseInt(MODERATOR_ID, 10),
          userName: 'test',
        },
      },
      message: 'test さんがコマンドを配信からブロックしました',
    },
  ];

  for (const test of tests) {
    refreshObserver.next(test.event);
  }

  // bufferTime tweaks
  clientSubject.complete();

  expect(instance.state.messages.length).toEqual(tests.length + 1);
  for (const [i, test] of tests.entries()) {
    expect(instance.state.messages[i].value.content).toEqual(test.message);
  }
});

test('refreshModeratorsがきたらコメントのモデレーター情報を更新する', async () => {
  const { clientSubject, instance, refreshObserver } = connectionSetup();
  await sleep(0);
  instance.state.messages = [
    {
      component: 'common',
      isModerator: false,
      seqId: 0,
      type: 'normal',
      value: {
        content: 'yay',
        user_id: MODERATOR_ID,
      },
    },
    {
      component: 'common',
      isModerator: true,
      seqId: 1,
      type: 'normal',
      value: {
        content: 'yay',
        user_id: NOT_MODERATOR_ID,
      },
    },
  ];
  expect(instance.state.messages[0].isModerator).toBeFalsy();
  expect(instance.state.messages[1].isModerator).toBeTruthy();

  refreshObserver.next({
    event: 'refreshModerators',
  });

  // bufferTime tweaks
  clientSubject.complete();

  expect(instance.state.messages[0].isModerator).toBeTruthy();
  expect(instance.state.messages[1].isModerator).toBeFalsy();
});

describe('startUpdateSupporters', () => {
  // jest-runner/electron では jestのfakeTimersが使えないのでsinonのfakeTimersを使う
  let clock: FakeTimers.InstalledClock;
  beforeEach(() => {
    clock = FakeTimers.install();
  });
  afterEach(() => {
    clock.uninstall();
  });

  const INTERVAL = 100;
  const closer = new Subject();

  function prepare() {
    const update = jest_fn<NicoliveSupportersService['update']>();
    setup({
      injectee: {
        NicoliveSupportersService: { update },
        NicoliveProgramService: { stateChange: new Subject() },
      },
    });

    const { NicoliveCommentViewerService } = require('./nicolive-comment-viewer');
    const instance = NicoliveCommentViewerService.instance as NicoliveCommentViewerService;
    return { instance, update };
  }

  test('最初は即時にサポーター情報を更新する', async () => {
    const { instance, update } = prepare();
    expect(update).toBeCalledTimes(0);
    instance.startUpdateSupporters(INTERVAL, closer);

    expect(update).toBeCalledTimes(1);
    closer.next();
  });

  test('サポーター情報を定期的に更新する', async () => {
    const { instance, update } = prepare();
    instance.startUpdateSupporters(INTERVAL, closer);
    expect(update).toBeCalledTimes(1);

    clock.tick(INTERVAL);
    expect(update).toBeCalledTimes(2);

    clock.tick(INTERVAL);
    expect(update).toBeCalledTimes(3);

    closer.next();
    // 止めた後は進まなくなる
    clock.tick(INTERVAL);
    expect(update).toBeCalledTimes(3);
  });
});
