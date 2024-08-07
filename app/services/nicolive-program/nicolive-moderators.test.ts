import { dwango } from '@n-air-app/nicolive-comment-protobuf';
import { Subject } from 'rxjs';
import { ObserveType, jest_fn } from 'util/jest_fn';
import { sleep } from 'util/sleep';
import { createSetupFunction } from 'util/test-setup';
import { NdgrClient } from './NdgrClient';
import type { NicoliveClient } from './NicoliveClient';
import { Moderator } from './ResponseTypes';
import { NicoliveProgramService } from './nicolive-program';

type NicoliveModeratorsService = import('./nicolive-moderators').NicoliveModeratorsService;

const setup = createSetupFunction({
  state: {
    NicoliveProgramService: {
      programID: 'lv1',
    },
  },
  injectee: {
    NicoliveProgramService: {
      updated: {
        subscribe() {},
      },
    },
  },
});

jest.mock('services/nicolive-program/nicolive-program', () => ({ NicoliveProgramService: {} }));
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

function initNicoliveProgramService() {
  const stateChange = new Subject<Partial<NicoliveProgramService['state']>>();
  setup({ injectee: { NicoliveProgramService: { stateChange } } });
  return stateChange;
}

function doMockNicoliveClient() {
  const fetchModerators = jest_fn<NicoliveClient['fetchModerators']>().mockReturnValue(
    Promise.resolve({ ok: true, value: [] }),
  );
  jest.doMock('./NicoliveClient', () => ({
    ...(jest.requireActual('./NicoliveClient') as {}),
    NicoliveClient: class NicoliveClient {
      fetchModerators = fetchModerators;
    },
  }));
  return {
    fetchModerators,
  };
}

function doMockNdgrClient() {
  const messages: NdgrClient['messages'] = new Subject();
  const ndgrConstructor = jest.fn<void, ConstructorParameters<typeof NdgrClient>>();
  const connect = jest_fn<NdgrClient['connect']>().mockReturnValue(Promise.resolve());
  const dispose = jest_fn<NdgrClient['dispose']>();
  jest.doMock('./NdgrClient', () => {
    return {
      ...(jest.requireActual('./NdgrClient') as {}),
      NdgrClient: class NdgrClient {
        messages = messages;
        constructor(url: string, label?: string) {
          ndgrConstructor(url, label);
        }
        connect = connect;
        dispose = dispose;
      },
    };
  });
  return {
    messages,
    ndgrConstructor,
    connect,
    dispose,
  };
}

function prepare() {
  const { fetchModerators } = doMockNicoliveClient();
  const { messages, ndgrConstructor, connect } = doMockNdgrClient();

  const stateChange = initNicoliveProgramService();

  const { NicoliveModeratorsService } = require('./nicolive-moderators');
  const instance = NicoliveModeratorsService.instance as NicoliveModeratorsService;

  const refreshObserver = jest.fn<void, [ObserveType<typeof instance.refreshObserver>]>();
  instance.refreshObserver.subscribe({ next: refreshObserver });

  return {
    fetchModerators,
    messages,
    ndgrConstructor,
    connect,
    stateChange,
    instance,
    refreshObserver,
  };
}

describe('NicoliveModeratorsService', () => {
  it('should fetch moderators and start connection to ndgr when current program has changed', async () => {
    const { fetchModerators, connect, stateChange } = prepare();

    expect(fetchModerators).toHaveBeenCalledTimes(0);
    expect(connect).toHaveBeenCalledTimes(0);
    const next: ObserveType<typeof stateChange> = {
      viewUri: 'https://example.com',
      moderatorViewUri: 'https://example.com',
    };
    stateChange.next(next);
    await sleep(0);
    expect(fetchModerators).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);

    stateChange.next(next); // no change
    await sleep(0);
    expect(fetchModerators).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
  });
});

describe('connectModeratorStream', () => {
  it('should connect to ndgr and start receiving messages', async () => {
    const { connect, messages, ndgrConstructor, instance } = prepare();

    expect(connect).toHaveBeenCalledTimes(0);
    expect(messages.observers).toHaveLength(0);
    await instance.connectModeratorStream('https://example.com');
    await sleep(0);
    expect(ndgrConstructor).toHaveBeenCalledTimes(1);
    expect(ndgrConstructor).toHaveBeenCalledWith('https://example.com', 'moderator');
    expect(connect).toHaveBeenCalledTimes(1);
    expect(messages.observers).toHaveLength(1);
  });

  test.each<[string, dwango.nicolive.chat.data.atoms.IModeratorUpdated, string[], string[]]>([
    [
      'moderatorUpdated.ADD',
      {
        operation: dwango.nicolive.chat.data.atoms.ModeratorUpdated.ModeratorOperation.ADD,
        operator: { userId: 123, nickname: 'test' },
      },
      [],
      ['123'],
    ],
    [
      'moderatorUpdated.DELETE',
      {
        operation: dwango.nicolive.chat.data.atoms.ModeratorUpdated.ModeratorOperation.DELETE,
        operator: { userId: 123, nickname: 'test' },
      },
      ['123'],
      [],
    ],
  ])(`should update moderatorsCache on %s`, async (_, moderatorUpdated, initial, expected) => {
    const { instance, messages } = prepare();

    await instance.connectModeratorStream('https://example.com');
    await sleep(0);

    instance.state.moderatorsCache = initial;

    messages.next(
      new dwango.nicolive.chat.service.edge.ChunkedMessage({ message: { moderatorUpdated } }),
    );
    await sleep(0);

    expect(instance.state.moderatorsCache).toEqual(expected);
  });

  type EventType = ObserveType<NicoliveModeratorsService['refreshObserver']>;

  test.each<[string, dwango.nicolive.chat.data.atoms.ISSNGUpdated, EventType]>([
    [
      'SSNGUpdated.ADD',
      {
        operation: dwango.nicolive.chat.data.atoms.SSNGUpdated.SSNGOperation.ADD,
        ssngId: 1,
        operator: {
          nickname: 'test',
          userId: 123,
        },
        type: dwango.nicolive.chat.data.atoms.SSNGUpdated.SSNGType.USER,
        source: '123',
        updatedAt: { seconds: 0, nanos: 0 },
      },
      {
        event: 'addSSNG',
        record: {
          id: 1,
          type: 'user',
          body: '123',
          createdAt: '1970-01-01T00:00:00.000Z',
          userId: 123,
          userName: 'test',
        },
      },
    ],
    [
      'SSNGUpdated.DELETE',
      {
        operation: dwango.nicolive.chat.data.atoms.SSNGUpdated.SSNGOperation.DELETE,
        ssngId: 1,
        operator: {
          nickname: 'test',
          userId: 123,
        },
        type: dwango.nicolive.chat.data.atoms.SSNGUpdated.SSNGType.USER,
        source: '123',
        updatedAt: { seconds: 0, nanos: 0 },
      },
      {
        event: 'removeSSNG',
        record: {
          ssngId: 1,
          userName: 'test',
          userId: 123,
        },
      },
    ],
  ])(`should notify on refreshObserver on %s`, async (_, ssngUpdated, event) => {
    const { instance, messages, refreshObserver } = prepare();

    await instance.connectModeratorStream('https://example.com');
    await sleep(0);

    messages.next(
      new dwango.nicolive.chat.service.edge.ChunkedMessage({ message: { ssngUpdated } }),
    );
    await sleep(0);

    expect(refreshObserver).toHaveBeenCalledWith(event);
  });
});

describe('fetchModerators', () => {
  it('should fetch moderators and update moderatorsCache and notify on refreshObserver', async () => {
    const { refreshObserver, fetchModerators, instance } = prepare();
    fetchModerators.mockReturnValueOnce(
      Promise.resolve({
        ok: true,
        value: [
          {
            userId: 123,
            nickname: 'test',
            iconUrl: 'https://example.com',
            createdAt: '1970-01-01T00:00:00.000Z',
            isValid: true,
          } as Moderator,
        ],
      }),
    );

    expect(instance.state.moderatorsCache).toEqual([]);
    await instance.fetchModerators();
    expect(fetchModerators).toHaveBeenCalledTimes(1);
    expect(instance.state.moderatorsCache).toEqual(['123']);
    expect(refreshObserver).toHaveBeenCalledWith<[ObserveType<typeof instance.refreshObserver>]>({
      event: 'refreshModerators',
    });
  });
});

describe('isModerator', () => {
  const moderators = ['123'];
  test.each([
    ['123', true],
    ['456', false],
  ])(`isModerator(%s) should return %s`, (userId, expected) => {
    const { instance } = prepare();
    instance.state.moderatorsCache = moderators;
    expect(instance.isModerator(userId)).toBe(expected);
  });
});
