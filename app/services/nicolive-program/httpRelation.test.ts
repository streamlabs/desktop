import * as fetchMock from 'fetch-mock';
import { NicoadMessage } from './ChatMessage';
import { AddComponent } from './ChatMessage/ChatComponentType';
import { WrappedChatWithComponent, WrappedMessageWithComponent } from './WrappedChat';
import { HttpRelation } from './httpRelation';
import { HttpRelationState } from './state';

describe('HttpRelation', () => {
  afterEach(() => {
    fetchMock.restore();
  });

  const makeChat: (content: string) => WrappedChatWithComponent = content =>
    AddComponent({
      value: {
        id: '123',
        content,
        user_id: 'user123',
        name: 'name',
        anonymity: 0,
        premium: 1,
      },
      type: 'operator',
      seqId: 0,
    });
  const msgChat = makeChat('Hello, world!');

  test.each<['POST' | 'PUT' | 'GET' | '', string, string, string, string]>([
    // test all parameters
    ...[
      ['id', '123'],
      ['comment', 'Hello, world!', 'Hello%2C%20world!'],
      ['isOwner', 'true'],
      ['userId', 'user123'],
      ['name', 'name'],
      ['isPremium', 'true'],
      ['isAnonymous', 'false'],
      ['type', msgChat.type],
      ['invalid', ''], // invalid parameter
    ].map(([key, value, queryValue]): ['POST', string, string, string, string] => [
      'POST',
      `/api/sendChat/{${key}}`,
      `{${key}}`,
      `/api/sendChat/${queryValue ?? value}`,
      value,
    ]),

    // test methods
    [
      'GET',
      '/api/sendChat?comment={comment}&userId={userId}',
      '',
      '/api/sendChat?comment=Hello%2C%20world!&userId=user123',
      '',
    ],
    [
      'POST',
      '/api/sendChat',
      '{ "comment": "{comment}", "userId": "{userId}" }',
      '/api/sendChat',
      '{ "comment": "Hello, world!", "userId": "user123" }',
    ],
    ['PUT', '/api/sendChat/{id}', '{comment}', '/api/sendChat/123', 'Hello, world!'],

    // test empty method
    ['', '/api/sendChat/{id}', '{comment}', '/api/sendChat/123', 'Hello, world!'],
  ])(
    `sendChat with %s %s body:%s -> %s body:%s`,
    async (method, url, body, expectedUrl, expectedBody) => {
      const mockState: HttpRelationState = {
        method,
        url,
        body,
      };

      switch (method) {
        case 'POST':
          fetchMock.post(expectedUrl, 200);
          break;
        case 'PUT':
          fetchMock.put(expectedUrl, 200);
          break;
        case 'GET':
          fetchMock.get(expectedUrl, 200);
          break;
      }

      const result = await HttpRelation.sendChat(msgChat, mockState);
      if (method === '') {
        expect(fetchMock.called()).toBe(false);
      } else {
        expect(fetchMock.called()).toBe(true);
        const [url, options] = fetchMock.lastCall();
        expect(url).toBe(expectedUrl);
        expect(options.method).toBe(method);
        if (method !== 'GET') {
          const requestBody = options.body.toString();
          expect(requestBody).toEqual(expectedBody);
        }
        expect(result).toEqual({ result: '' });
      }
    },
  );

  test('sendChat with mockNicoad', async () => {
    const msgNicoad: WrappedMessageWithComponent = AddComponent({
      seqId: 0,
      type: 'nicoad',
      value: {
        v1: {
          message: 'nicoad message',
        },
      } as NicoadMessage,
    });

    const mockState: HttpRelationState = {
      method: 'POST',
      url: '/api/sendNicoad',
      body: 'id={id} userId={userId} name={name} type={type} comment={comment}',
    };
    fetchMock.post(mockState.url, 200);
    await HttpRelation.sendChat(msgNicoad, mockState);
    expect(fetchMock.called()).toBe(true);
    const [url, options] = fetchMock.lastCall();
    expect(url).toBe(mockState.url);
    expect(options.method).toBe(mockState.method);
    expect(options.body.toString()).toEqual('id= userId= name= type=nicoad comment=nicoad message');
  });

  test('sendChat with empty message', async () => {
    const msgEmpty = makeChat('');

    const mockState: HttpRelationState = {
      method: 'POST',
      url: '/api/',
      body: '{type} {comment}',
    };
    fetchMock.post(mockState.url, 200);
    const result = await HttpRelation.sendChat(msgEmpty, mockState);
    expect(fetchMock.called()).toBe(false);
    expect(result).toEqual({ error: 'no-content' });
  });

  test('escape duble quote', async () => {
    const msgQuote = makeChat('Hello, "world"!');
    const mockState: HttpRelationState = {
      method: 'POST',
      url: '/api/',
      body: '"{comment}"',
    };
    fetchMock.post(mockState.url, 200);
    await HttpRelation.sendChat(msgQuote, mockState);
    expect(fetchMock.called()).toBe(true);
    const [url, options] = fetchMock.lastCall();
    expect(url).toBe(mockState.url);
    expect(options.method).toBe(mockState.method);
    expect(options.body.toString()).toEqual('"Hello, \\"world\\"!"');
  });
});
