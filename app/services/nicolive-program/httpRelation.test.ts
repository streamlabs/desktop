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

  test.each([
    [
      'POST',
      '/api/sendChat',
      '{ "id": "{id}", "comment": "{comment}", "isOwner": "{isOwner}", "userId": "{userId}", "name": "{name}" }',
      '{ "id": "123", "comment": "Hello, world!", "isOwner": "true", "userId": "user123", "name": "name" }',
    ],
  ])(`sendChat with %s method`, async (method, url, body, expectedBody) => {
    const mockState: HttpRelationState = {
      method,
      url,
      body,
    };

    fetchMock.post('/api/sendChat', { status: 200, body: '' });

    await HttpRelation.sendChat(mockChat, mockState);

    expect(fetchMock.called('/api/sendChat')).toBe(true);
    const [_, options] = fetchMock.lastCall('/api/sendChat');
    expect(options.method).toBe(method);
    const requestBody = options.body.toString();

    expect(requestBody).toEqual(expectedBody);
  });
});
