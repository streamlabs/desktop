import { Subject } from 'rxjs';
import type { ObserveType } from 'util/jest_fn';
import { createSetupFunction } from 'util/test-setup';
import { MessageResponse } from './ChatMessage';
import type { IMessageServerClient } from './MessageServerClient';
import { NdgrFetchError } from './NdgrFetchError';
import { FilterRecord } from './ResponseTypes';
import { isWrappedChat, WrappedChatWithComponent } from './WrappedChat';
import { NicoliveModeratorsService } from './nicolive-moderators';

type NicoliveCommentViewerService =
  import('./nicolive-comment-viewer').NicoliveCommentViewerService;

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

test('接続先情報が来たら接続する', () => {
  const stateChange = new Subject();
  const clientSubject = new Subject<MessageResponse>();
  jest.doMock('./NdgrCommentReceiver', () => ({
    ...(jest.requireActual('./NdgrCommentReceiver') as {}),
    NdgrCommentReceiver: class NdgrCommentReceiver {
      connect() {
        return clientSubject;
      }
    },
  }));
  setup({ injectee: { NicoliveProgramService: { stateChange } } });

  const { NicoliveCommentViewerService } = require('./nicolive-comment-viewer');
  const instance = NicoliveCommentViewerService.instance as NicoliveCommentViewerService;

  expect(clientSubject.observers).toHaveLength(0);
  expect(stateChange.observers).toHaveLength(1);
  stateChange.next({ viewUri: 'https://example.com' });
  expect(clientSubject.observers).toHaveLength(1);
});

test('接続先情報が欠けていたら接続しない', () => {
  const stateChange = new Subject();
  const clientSubject = new Subject<MessageResponse>();
  jest.doMock('./NdgrCommentReceiver', () => ({
    NdgrCommentReceiver: class NdgrCommentReceiver {
      connect() {
        return clientSubject;
      }
    },
  }));
  setup({ injectee: { NicoliveProgramService: { stateChange } } });

  const { NicoliveCommentViewerService } = require('./nicolive-comment-viewer');
  const instance = NicoliveCommentViewerService.instance as NicoliveCommentViewerService;

  expect(clientSubject.observers).toHaveLength(0);
  expect(stateChange.observers).toHaveLength(1);
  stateChange.next({ viewUri: '' });
  expect(clientSubject.observers).toHaveLength(0);
});

test('status=endedが流れてきたらunsubscribeする', () => {
  const stateChange = new Subject();
  const clientSubject = new Subject<MessageResponse>();
  jest.doMock('./NdgrCommentReceiver', () => {
    return {
      ...(jest.requireActual('./NdgrCommentReceiver') as {}),
      NdgrCommentReceiver: class NdgrCommentReceiver {
        connect() {
          return clientSubject;
        }
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
  stateChange.next({ viewUri: 'https://example.com' });
  expect(clientSubject.observers).toHaveLength(1);
  expect(unsubscribe).toHaveBeenCalledTimes(1);

  clientSubject.next({ state: { state: 'ended' } });
  expect(unsubscribe).toHaveBeenCalledTimes(2);
});

const MODERATOR_ID = '123';
const NOT_MODERATOR_ID = '456';

function connectionSetup() {
  const stateChange = new Subject();
  const clientSubject = new Subject<MessageResponse>();
  const refreshObserver = new Subject<ObserveType<NicoliveModeratorsService['refreshObserver']>>();
  jest.doMock('./NdgrCommentReceiver', () => ({
    ...(jest.requireActual('./NdgrCommentReceiver') as {}),
    NdgrCommentReceiver: class NdgrCommentReceiver implements IMessageServerClient {
      connect() {
        return clientSubject;
      }
      close() {}
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

  stateChange.next({ viewUri: 'https://example.com' });

  return {
    instance,
    clientSubject,
    refreshObserver,
  };
}

test('chatメッセージはstateに保持する', () => {
  jest.spyOn(Date, 'now').mockImplementation(() => 1582175622000);
  const { instance, clientSubject } = connectionSetup();

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
    [
      {
        "component": "common",
        "seqId": 0,
        "type": "normal",
        "value": {
          "content": "yay",
        },
      },
      {
        "component": "common",
        "seqId": 1,
        "type": "normal",
        "value": {
          "content": "foo",
        },
      },
      {
        "component": "system",
        "seqId": 2,
        "type": "n-air-emulated",
        "value": {
          "content": "サーバーとの接続が終了しました",
          "date": 1582175622,
        },
      },
    ]
  `);
});

test('chatメッセージはstateに最新100件保持し、あふれた物がpopoutMessagesに残る', () => {
  jest.spyOn(Date, 'now').mockImplementation(() => 1582175622000);
  const { instance, clientSubject } = connectionSetup();

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
  expect(instance.state.messages[0].type).toEqual('normal');
  if (instance.state.messages[0].type === 'normal') {
    expect(instance.state.messages[0].value.content).toEqual(chats[overflow]);
  }
  const last = instance.state.messages[retainSize - numberOfSystemMessages - 1];
  expect(last.type).toEqual('normal');
  if (last.type === 'normal') {
    expect(last.value.content).toEqual(chats[chats.length - 1]);
  }
  expect(instance.state.popoutMessages.length).toEqual(overflow);
  expect(instance.state.popoutMessages[0].type).toEqual('normal');
  if (instance.state.popoutMessages[0].type === 'normal') {
    expect(instance.state.popoutMessages[0].value.content).toEqual(chats[0]);
  }
});

test('接続エラー時にメッセージを表示する', () => {
  jest.spyOn(Date, 'now').mockImplementation(() => 1582175622000);
  const { instance, clientSubject } = connectionSetup();

  const error = new Error('yay');

  clientSubject.error(error);

  // bufferTime tweaks
  clientSubject.complete();

  expect(instance.state.messages).toMatchInlineSnapshot(`
    [
      {
        "component": "system",
        "seqId": 0,
        "type": "n-air-emulated",
        "value": {
          "content": "エラーが発生しました: yay",
          "date": 1582175622,
        },
      },
      {
        "component": "system",
        "seqId": 1,
        "type": "n-air-emulated",
        "value": {
          "content": "サーバーとの接続が終了しました",
          "date": 1582175622,
        },
      },
    ]
  `);
});

test('スレッドの参加失敗時にメッセージを表示する', () => {
  jest.spyOn(Date, 'now').mockImplementation(() => 1582175622000);
  const { instance, clientSubject } = connectionSetup();

  const e = new NdgrFetchError(404, 'yay', 'test');
  expect(e instanceof NdgrFetchError).toBeTruthy();
  expect(e.name).toBe('NdgrFetchError');
  clientSubject.error(new NdgrFetchError(404, 'yay', 'test'));

  // bufferTime tweaks
  clientSubject.complete();

  expect(instance.state.messages).toMatchInlineSnapshot(`
    [
      {
        "component": "system",
        "seqId": 0,
        "type": "n-air-emulated",
        "value": {
          "content": "コメントの取得に失敗しました",
          "date": 1582175622,
        },
      },
      {
        "component": "system",
        "seqId": 1,
        "type": "n-air-emulated",
        "value": {
          "content": "サーバーとの接続が終了しました",
          "date": 1582175622,
        },
      },
    ]
  `);
});

test('モデレーターによるSSNG追加・削除がきたらシステムメッセージが追加される', async () => {
  const { clientSubject, instance, refreshObserver } = connectionSetup();

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
    const message = instance.state.messages[i];
    expect(message.type).toEqual('n-air-emulated');
    if (message.type === 'n-air-emulated') {
      expect(message.value.content).toEqual(test.message);
    }
  }
});

test('refreshModeratorsがきたらコメントのモデレーター情報を更新する', async () => {
  const { clientSubject, instance, refreshObserver } = connectionSetup();
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
  ] as WrappedChatWithComponent[];

  {
    const messages = instance.state.messages as WrappedChatWithComponent[];
    expect(messages[0].isModerator).toBeFalsy();
    expect(messages[1].isModerator).toBeTruthy();
  }

  refreshObserver.next({
    event: 'refreshModerators',
  });

  // bufferTime tweaks
  clientSubject.complete();

  {
    const messages = instance.state.messages as WrappedChatWithComponent[];
    expect(messages[0].isModerator).toBeTruthy();
    expect(messages[1].isModerator).toBeFalsy();
  }
});
