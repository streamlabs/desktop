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
    },
    type: 'operator',
    seqId: 0,
  };

  test.each<['POST' | 'PUT' | 'GET', string, string, string, string]>([
    [
      'GET',
      '/api/sendChat?comment={comment}&isOwner={isOwner}&userId={userId}&name={name}',
      '',
      '/api/sendChat?comment=Hello%2C%20world!&isOwner=true&userId=user123&name=name',
      '',
    ],
    [
      'POST',
      '/api/sendChat',
      '{ "id": "{id}", "comment": "{comment}", "isOwner": "{isOwner}", "userId": "{userId}", "name": "{name}" }',
      '/api/sendChat',
      '{ "id": "123", "comment": "Hello, world!", "isOwner": "true", "userId": "user123", "name": "name" }',
    ],
    ['PUT', '/api/sendChat/{id}', '{comment}', '/api/sendChat/123', 'Hello, world!'],
  ])(`sendChat with %s method`, async (method, url, body, expectedUrl, expectedBody) => {
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

    expect(fetchMock.called(expectedUrl)).toBe(true);
    const [_, options] = fetchMock.lastCall(expectedUrl);
    expect(options.method).toBe(method);
    if (method !== 'GET') {
      const requestBody = options.body.toString();
      expect(requestBody).toEqual(expectedBody);
    }
  });
});
