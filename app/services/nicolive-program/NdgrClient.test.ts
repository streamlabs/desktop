import { dwango } from '@n-air-app/nicolive-comment-protobuf';
import { Reader, Writer, util } from 'protobufjs/minimal';
import { jest_fn } from 'util/jest_fn';
import { NdgrClient } from './NdgrClient';

const ENTRY_URL = 'http://example.com/entry';
const MESSAGES_URL = 'http://example.com/messages';
const PREV_MESSAGES_URL = 'http://example.com/prev';
const BACKWARD1_MESSAGES_URL = 'http://example.com/backward1';
const BACKWARD2_MESSAGES_URL = 'http://example.com/backward2';
const NETWORK_ERROR_URL = 'http://example.com/network-error';
const HTTP_ERROR_URL = 'http://example.com/http-error';

// protobufjs は class 要素を objectに変換しようとすると toJSONメソッドが呼ばれるが、
// その変換ルールがデフォルトで Long と enum が Stringになってしまうので、Number に戻してアプリと挙動を合わせる
// (そうしないとエンコードしてデコードするときに元に戻らない)
util.toJSONOptions = { longs: Number, enums: Number, bytes: String };

const entries: dwango.nicolive.chat.service.edge.IChunkedEntry[] = [
  {
    backward: {
      segment: {
        uri: BACKWARD1_MESSAGES_URL,
      },
    },
  },
  {
    previous: {
      uri: PREV_MESSAGES_URL,
    },
  },
  {
    segment: {
      uri: MESSAGES_URL,
    },
  },
];

function moderatorUpdated(
  operation: dwango.nicolive.chat.data.atoms.ModeratorUpdated.ModeratorOperation,
  userId: number,
  nickname: string,
): dwango.nicolive.chat.data.INicoliveMessage {
  return {
    moderatorUpdated: {
      operation,
      operator: {
        userId,
        nickname,
      },
    },
  };
}
function moderatorAdd(
  userId: number,
  nickname: string,
): dwango.nicolive.chat.data.INicoliveMessage {
  return moderatorUpdated(
    dwango.nicolive.chat.data.atoms.ModeratorUpdated.ModeratorOperation.ADD,
    userId,
    nickname,
  );
}

function moderatorDelete(
  userId: number,
  nickname: string,
): dwango.nicolive.chat.data.INicoliveMessage {
  return moderatorUpdated(
    dwango.nicolive.chat.data.atoms.ModeratorUpdated.ModeratorOperation.DELETE,
    userId,
    nickname,
  );
}

const backwardMessages = [
  [moderatorAdd(1, 'backward[0][0]'), moderatorAdd(2, 'backward[0][1]')],
  [moderatorAdd(1, 'backward[1][0]'), moderatorAdd(2, 'backward[1][1]')],
];

const prevMessages = [moderatorAdd(3, 'prev')];

const messages = [moderatorAdd(1, 'test'), moderatorDelete(2, 'test2')];

function packedSegmentResponse(
  packedSegment: dwango.nicolive.chat.service.edge.IPackedSegment,
  headers: Headers,
): Response {
  const writer = new Writer();
  dwango.nicolive.chat.service.edge.PackedSegment.encode(packedSegment, writer);
  return new Response(writer.finish(), {
    headers,
  });
}

function encodeMessages<T>(encoder: (message: T) => Writer, messages: T[]): Uint8Array {
  return messages
    .map(message => {
      const writer = encoder(message);
      return writer.finish();
    })
    .reduce((a, b) => new Uint8Array([...a, ...b]), new Uint8Array([]));
}

describe('ChunkedEntry', () => {
  test('EncodeDelimited して DecodeDelimited すると元のオブジェクトに戻る', () => {
    const buf = encodeMessages(
      msg => dwango.nicolive.chat.service.edge.ChunkedEntry.encodeDelimited(msg),
      entries,
    );

    const reader = Reader.create(buf);
    for (let i = 0; i < entries.length; i++) {
      const decoded = dwango.nicolive.chat.service.edge.ChunkedEntry.decodeDelimited(reader);
      expect(decoded).toEqual(entries[i]);
    }
  });
});

describe('NdgrClient', () => {
  // Date.now() を固定する
  const now = Date.now();
  jest.spyOn(Date, 'now').mockReturnValue(now);

  const withTimestamp = (url: string) => `${url}?at=now`;
  const ENTRY_URL_WITH_TIMESTAMP = withTimestamp(ENTRY_URL);
  const NETWORK_ERROR_URL_WITH_TIMESTAMP = withTimestamp(NETWORK_ERROR_URL);
  const HTTP_ERROR_URL_WITH_TIMESTAMP = withTimestamp(HTTP_ERROR_URL);

  const fetchMock = jest_fn<typeof fetch>()
    .mockName('fetch')
    .mockImplementation((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (typeof input === 'string') {
        const headers = new Headers();
        headers.append('Content-Type', 'application/octet-stream');
        switch (input) {
          case ENTRY_URL_WITH_TIMESTAMP: {
            return Promise.resolve(
              new Response(
                encodeMessages(
                  msg => dwango.nicolive.chat.service.edge.ChunkedEntry.encodeDelimited(msg),
                  entries,
                ),
                { headers },
              ),
            );
          }

          case BACKWARD1_MESSAGES_URL:
            return Promise.resolve(
              packedSegmentResponse(
                {
                  messages: backwardMessages[1].map(msg => ({ message: msg })),
                  next: { uri: BACKWARD2_MESSAGES_URL },
                },
                headers,
              ),
            );
          case BACKWARD2_MESSAGES_URL:
            return Promise.resolve(
              packedSegmentResponse(
                {
                  messages: backwardMessages[0].map(msg => ({ message: msg })),
                },
                headers,
              ),
            );

          case PREV_MESSAGES_URL:
            return Promise.resolve(
              new Response(
                encodeMessages(
                  msg => dwango.nicolive.chat.service.edge.ChunkedMessage.encodeDelimited(msg),
                  prevMessages.map(message => ({ message })),
                ),
                { headers },
              ),
            );

          case MESSAGES_URL:
            return Promise.resolve(
              new Response(
                encodeMessages(
                  msg => dwango.nicolive.chat.service.edge.ChunkedMessage.encodeDelimited(msg),
                  messages.map(message => ({ message })),
                ),
                { headers },
              ),
            );

          case NETWORK_ERROR_URL_WITH_TIMESTAMP:
            return Promise.reject(new TypeError('Network Error'));
          case HTTP_ERROR_URL_WITH_TIMESTAMP:
            return Promise.resolve(new Response('Not Found', { status: 404 }));
        }
      }
      return Promise.reject(new Error(`Unknown URL: ${input}`));
    });
  global.fetch = fetchMock;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should emit received messages', async () => {
    const target = new NdgrClient(ENTRY_URL);
    const onReceived = jest
      .fn<void, [dwango.nicolive.chat.service.edge.IChunkedMessage]>()
      .mockName('onReceived');
    const onCompleted = jest.fn<void, []>().mockName('onCompleted');
    target.messages.subscribe({
      next: msg => onReceived(msg.toJSON()), // class情報を落とすことで比較可能にする
      complete: onCompleted,
    });
    await target.connect();
    expect(fetchMock).toHaveBeenNthCalledWith(1, ENTRY_URL_WITH_TIMESTAMP);
    expect(fetchMock).toHaveBeenNthCalledWith(2, PREV_MESSAGES_URL);
    expect(fetchMock).toHaveBeenNthCalledWith(3, MESSAGES_URL);

    const expectedMessages = [...prevMessages, ...messages];
    expect(onReceived).toHaveBeenCalledTimes(expectedMessages.length);
    for (let i = 0; i < expectedMessages.length; i++) {
      expect(onReceived).toHaveBeenNthCalledWith(i + 1, { message: expectedMessages[i] });
    }
    target.dispose();
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it('should emit received messages with backwards', async () => {
    const target = new NdgrClient(ENTRY_URL);
    const onReceived = jest
      .fn<void, [dwango.nicolive.chat.service.edge.IChunkedMessage]>()
      .mockName('onReceived');
    const onCompleted = jest.fn<void, []>().mockName('onCompleted');
    target.messages.subscribe({
      next: msg => onReceived(msg.toJSON()), // class情報を落とすことで比較可能にする
      complete: onCompleted,
    });
    const WANT_BACKWARDS = 3;
    await target.connect('now', WANT_BACKWARDS);
    expect(fetchMock).toHaveBeenNthCalledWith(1, ENTRY_URL_WITH_TIMESTAMP);
    expect(fetchMock).toHaveBeenNthCalledWith(2, BACKWARD1_MESSAGES_URL);
    expect(fetchMock).toHaveBeenNthCalledWith(3, BACKWARD2_MESSAGES_URL);
    expect(fetchMock).toHaveBeenNthCalledWith(4, PREV_MESSAGES_URL);
    expect(fetchMock).toHaveBeenNthCalledWith(5, MESSAGES_URL);

    const RAW_BACKWARDS_LEN = backwardMessages.flat().length;
    const backwards = backwardMessages
      .flat()
      .slice(Math.max(0, RAW_BACKWARDS_LEN - WANT_BACKWARDS));
    const expectedMessages = [...backwards, ...prevMessages, ...messages];
    expect(onReceived).toHaveBeenCalledTimes(expectedMessages.length);
    for (let i = 0; i < expectedMessages.length; i++) {
      expect(onReceived).toHaveBeenNthCalledWith(i + 1, { message: expectedMessages[i] });
    }
    target.dispose();
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it('should throw an NdgrFetchError when fetch throws an errors', async () => {
    expect.assertions(1);
    const target = new NdgrClient(NETWORK_ERROR_URL);
    await expect(target.connect()).rejects.toThrow(
      `Failed to fetch(${NETWORK_ERROR_URL_WITH_TIMESTAMP}): TypeError: Network Error`,
    );
  });

  it('should throw an NdgrFetchError when fetch returns a failed response', async () => {
    expect.assertions(1);
    const target = new NdgrClient(HTTP_ERROR_URL);
    await expect(target.connect()).rejects.toThrow(
      `Failed to fetch(${HTTP_ERROR_URL_WITH_TIMESTAMP}): 404`,
    );
  });
});
