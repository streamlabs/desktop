import HttpRelation from './httpRelation';
import * as fetchMock from 'fetch-mock';
import { WrappedChat } from './WrappedChat';
import { HttpRelationState } from './state';

describe('HttpRelation', () => {
  afterEach(() => {
    fetchMock.restore();
  });

  const mockChat: WrappedChat = {
    value: {
      id: '123',
      content: 'Hello, world!',
      user_id: 'user123',
      name: 'name',
      anonymity: 0,
      premium: 1,
    },
    type: 'operator',
    seqId: 0,
  };

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
  ])(`sendChat with %s %s %s`, async (method, url, body, expectedUrl, expectedBody) => {
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

    await HttpRelation.sendChat(mockChat, mockState);
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
    }
  });
});
