import * as FakeTimers from '@sinonjs/fake-timers';
import { Subject } from 'rxjs';
import { jest_fn, type ObserveType } from 'util/jest_fn';
import { sleep } from 'util/sleep';
import { createSetupFunction } from 'util/test-setup';
import { MessageResponse } from './ChatMessage';
import type { IMessageServerClient } from './MessageServerClient';
import { NdgrFetchError } from './NdgrFetchError';
import { FilterRecord } from './ResponseTypes';
import {
  isWrappedChat,
  WrappedChatWithComponent,
  WrappedMessage,
  WrappedMessageWithComponent,
} from './WrappedChat';
import { NicoliveModeratorsService } from './nicolive-moderators';
import type { HttpRelationState, NicoliveProgramStateService } from './state';
import { getDisplayText } from './ChatMessage/displaytext';
import { AddComponent } from './ChatMessage/ChatComponentType';
import { Speech } from './nicolive-comment-synthesizer';

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
    NicoliveProgramStateService: {
      state: {
        httpRelation: {
          method: '',
        },
      } as NicoliveProgramStateService['state'],
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
jest.mock('services/nicolive-program/state', () => ({
  NicoliveProgramStateService: {},
}));

const sendChatMock = jest_fn<
  (chat: WrappedMessageWithComponent, state: HttpRelationState) => Promise<Object>
>()
  .mockName('HttpRelation.sendChat')
  .mockResolvedValue({ result: '' });
jest.mock('services/nicolive-program/httpRelation', () => ({
  HttpRelation: {
    sendChat: sendChatMock,
  },
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
  expect(stateChange.observers).toHaveLength(2);
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
  expect(stateChange.observers).toHaveLength(2);
  stateChange.next({ viewUri: '' });
  expect(clientSubject.observers).toHaveLength(0);
});

test('status=endedが流れてきたらunsubscribeし、refreshProgramも呼ぶ', () => {
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
  const refreshProgram = jest.fn().mockName('refreshProgram');
  setup({ injectee: { NicoliveProgramService: { stateChange, refreshProgram } } });

  const { NicoliveCommentViewerService } = require('./nicolive-comment-viewer');
  const instance = NicoliveCommentViewerService.instance as NicoliveCommentViewerService;
  const unsubscribe = jest.fn();
  (instance as any).unsubscribe = unsubscribe;

  expect(clientSubject.observers).toHaveLength(0);
  expect(unsubscribe).toHaveBeenCalledTimes(0);
  stateChange.next({ viewUri: 'https://example.com' });
  expect(clientSubject.observers).toHaveLength(1);
  expect(unsubscribe).toHaveBeenCalledTimes(1);

  expect(refreshProgram).toHaveBeenCalledTimes(0);

  clientSubject.next({ state: { state: 'ended' } });
  expect(unsubscribe).toHaveBeenCalledTimes(2);

  // ended が来たら refreshProgramも呼ばれる
  expect(refreshProgram).toHaveBeenCalledTimes(1);
});

const MODERATOR_ID = '123';
const NOT_MODERATOR_ID = '456';

const NG_WORD = 'abc';

function connectionSetup(options: { speechEnabled?: boolean; httpRelationEnabled?: boolean } = {}) {
  const stateChange = new Subject();
  const clientSubject = new Subject<MessageResponse>();
  const refreshObserver = new Subject<ObserveType<NicoliveModeratorsService['refreshObserver']>>();
  const moderatorsStateChange = new Subject<
    ObserveType<NicoliveModeratorsService['stateChange']>
  >();
  const queueToSpeech = jest_fn<(speech: Speech) => void>().mockName('queueToSpeech');

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
        stateChange: moderatorsStateChange,
        isModerator: (userId: string) => {
          return userId === MODERATOR_ID;
        },
      },
      NicoliveCommentFilterService: {
        addFilterCache: () => {},
        findFilterCache: () => ({ type: 'word', body: NG_WORD } as FilterRecord),
        deleteFiltersCache: () => {},
        applyFilter: (msg: WrappedMessage) => {
          return { ...msg, filtered: isWrappedChat(msg) && msg.value.content === NG_WORD };
        },
      },
      NicoliveCommentLocalFilterService: {
        filterFn: (msg: WrappedMessage) => (isWrappedChat(msg) ? msg.value.content !== 'NG' : true),
      },
      NicoliveCommentSynthesizerService: {
        makeSpeech: (chat: WrappedMessage): Speech => ({
          text: getDisplayText(AddComponent(chat)),
          synthesizer: 'nVoice',
          rate: 1,
        }),
        queueToSpeech,
        enabled: !!options.speechEnabled,
      },
      NicoliveProgramStateService: {
        state: {
          httpRelation: {
            method: options.httpRelationEnabled ? 'POST' : '',
          },
        } as NicoliveProgramStateService['state'],
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
    moderatorsStateChange,
    queueToSpeech,
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

test('接続エラー時にメッセージを表示する', async () => {
  jest.spyOn(Date, 'now').mockImplementation(() => 1582175622000);
  const { instance, clientSubject } = connectionSetup();
  await sleep(0);

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

test('スレッドの参加失敗時にメッセージを表示する', async () => {
  jest.spyOn(Date, 'now').mockImplementation(() => 1582175622000);
  const { instance, clientSubject } = connectionSetup();
  await sleep(0);

  const e = new NdgrFetchError(404, 'yay', 'test', 'head');
  expect(e instanceof NdgrFetchError).toBeTruthy();
  expect(e.name).toBe('NdgrFetchError');
  clientSubject.error(new NdgrFetchError(404, 'yay', 'test', 'head'));

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
          body: NG_WORD,
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

test('moderator.stateChange がきたらコメントのモデレーター情報を更新する', async () => {
  const { clientSubject, instance, moderatorsStateChange } = connectionSetup();
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
  ] as WrappedChatWithComponent[];
  instance.state.pinnedMessage = {
    component: 'common',
    isModerator: true,
    seqId: 2,
    type: 'normal',
    value: {
      content: 'yay',
      user_id: NOT_MODERATOR_ID,
    },
  };

  {
    const messages = instance.state.messages as WrappedChatWithComponent[];
    expect(messages[0].isModerator).toBeFalsy();
    expect(messages[1].isModerator).toBeTruthy();
    expect(instance.state.pinnedMessage?.isModerator).toBeTruthy();
  }

  moderatorsStateChange.next({
    moderatorsCache: [MODERATOR_ID],
    viewUri: 'https://example.com',
  });

  // bufferTime tweaks
  clientSubject.complete();

  {
    const messages = instance.state.messages as WrappedChatWithComponent[];
    expect(messages[0].isModerator).toBeTruthy();
    expect(messages[1].isModerator).toBeFalsy();
  }
  expect(instance.state.pinnedMessage?.isModerator).toBeFalsy();
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
    expect(update).toHaveBeenCalledTimes(0);
    instance.startUpdateSupporters(INTERVAL, closer);

    expect(update).toHaveBeenCalledTimes(1);
    closer.next();
  });

  test('サポーター情報を定期的に更新する', async () => {
    const { instance, update } = prepare();
    instance.startUpdateSupporters(INTERVAL, closer);
    expect(update).toHaveBeenCalledTimes(1);

    clock.tick(INTERVAL);
    expect(update).toHaveBeenCalledTimes(2);

    clock.tick(INTERVAL);
    expect(update).toHaveBeenCalledTimes(3);

    closer.next();
    // 止めた後は進まなくなる
    clock.tick(INTERVAL);
    expect(update).toHaveBeenCalledTimes(3);
  });
});

test('NGにかかるコメントは読み上げない', async () => {
  const { clientSubject, queueToSpeech } = connectionSetup({ speechEnabled: true });
  const NOW_SEC = 600;
  jest.spyOn(Date, 'now').mockImplementation(() => NOW_SEC * 1000);

  ['OK', 'NG'].forEach(content => {
    clientSubject.next({
      chat: {
        content,
        date: NOW_SEC,
      },
    });
  });

  // bufferTime tweaks
  clientSubject.complete();

  expect(queueToSpeech.mock.calls.map(([speech]) => speech.text)).toEqual([
    'OK',
    'サーバーとの接続が終了しました',
  ]);
});

test('コメント読み上げ時に古いコメントは読み上げない', async () => {
  const { clientSubject, queueToSpeech } = connectionSetup({ speechEnabled: true });
  const DROP_THRESHOLD_SEC = 60;
  const NOW_SEC = 600;

  jest.spyOn(Date, 'now').mockImplementation(() => NOW_SEC * 1000);

  clientSubject.next({
    chat: {
      content: 'old',
      date: NOW_SEC - DROP_THRESHOLD_SEC,
    },
  });
  clientSubject.next({
    chat: {
      content: 'new',
      date: NOW_SEC - DROP_THRESHOLD_SEC + 1,
    },
  });

  // bufferTime tweaks
  clientSubject.complete();

  expect(queueToSpeech.mock.calls.map(([speech]) => speech.text)).toEqual([
    'new',
    'サーバーとの接続が終了しました',
  ]);
});

test('HTTP連携: コメント送信', async () => {
  const { clientSubject } = connectionSetup({ httpRelationEnabled: true });
  const NOW_SEC = 600;
  const DROP_THRESHOLD_SEC = 60;

  jest.spyOn(Date, 'now').mockImplementation(() => NOW_SEC * 1000);

  [
    { date: NOW_SEC - DROP_THRESHOLD_SEC, comment: 'old' },
    { date: NOW_SEC - DROP_THRESHOLD_SEC + 1, comment: 'new' },
  ].forEach(({ date, comment }) =>
    [comment, 'NG', NG_WORD].forEach(content => {
      clientSubject.next({
        chat: {
          content,
          date,
          user_id: '1', // anything not empty
        },
      });
    }),
  );

  // bufferTime tweaks
  clientSubject.complete();

  expect(
    sendChatMock.mock.calls.map(([msg]) => (isWrappedChat(msg) ? msg.value.content : 'not chat')),
  ).toEqual(['new', 'サーバーとの接続が終了しました']);
});

test('NGワードにかかるコメントが来たら ##このコメントは表示されません## になる', async () => {
  const { clientSubject, instance } = connectionSetup();
  await sleep(0);

  clientSubject.next({
    chat: {
      content: NG_WORD,
      user_id: '123', // anything not empty
    },
  });

  // bufferTime tweaks
  clientSubject.complete();

  expect(instance.state.messages.length).toEqual(2);
  expect(getDisplayText(instance.state.messages[0])).toEqual('##このコメントは表示されません##');
});
