import { createSetupFunction } from 'util/test-setup';
import { Subject } from 'rxjs';
type NicoliveCommentFilterService =
  import('./nicolive-comment-filter').NicoliveCommentFilterService;

const setup = createSetupFunction({
  injectee: {
    NicoliveProgramService: {
      stateChange: new Subject(),
      state: {
        programID: 'lv175622',
      },
    },
  },
});

jest.mock('services/nicolive-program/nicolive-program', () => ({
  NicoliveProgramStateService: {},
}));

// NicoliveFailureが依存している
jest.mock('services/i18n', () => ({}));

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

test('fetchFilters/通常成功', async () => {
  setup();
  const { NicoliveCommentFilterService } = require('./nicolive-comment-filter');
  const instance = NicoliveCommentFilterService.instance as NicoliveCommentFilterService;

  const fetchFilters = jest
    .fn()
    .mockResolvedValue({ ok: true, value: [{ type: 'word', body: '810', id: 114514 }] });
  (instance as any).client.fetchFilters = fetchFilters;

  const UPDATE_FILTERS = jest.fn();
  (instance as any).UPDATE_FILTERS = UPDATE_FILTERS;

  await instance.fetchFilters();

  expect(UPDATE_FILTERS).toHaveBeenCalledTimes(1);
  expect(UPDATE_FILTERS).toHaveBeenCalledWith([{ type: 'word', body: '810', id: 114514 }]);
});

test('fetchFilters/失敗', async () => {
  setup();
  const { NicoliveCommentFilterService } = require('./nicolive-comment-filter');
  const instance = NicoliveCommentFilterService.instance as NicoliveCommentFilterService;

  const fetchFilters = jest.fn().mockResolvedValue({
    ok: false,
    value: { meta: { status: 400, errorCode: 'ERROR_CODE', errorMessage: 'simple description' } },
  });
  (instance as any).client.fetchFilters = fetchFilters;

  const UPDATE_FILTERS = jest.fn();
  (instance as any).UPDATE_FILTERS = UPDATE_FILTERS;

  await expect(instance.fetchFilters()).rejects.toMatchInlineSnapshot(`
          NicoliveFailure {
            "additionalMessage": "ERROR_CODE: simple description",
            "errorCode": "ERROR_CODE",
            "method": "fetchFilters",
            "reason": "400",
            "type": "http_error",
          }
        `);

  expect(UPDATE_FILTERS).toHaveBeenCalledTimes(0);
});

test('addFilters/通常成功', async () => {
  setup();
  const { NicoliveCommentFilterService } = require('./nicolive-comment-filter');
  const instance = NicoliveCommentFilterService.instance as NicoliveCommentFilterService;

  const addFilters = jest.fn().mockResolvedValue({ ok: true, value: { id: 114514 } });
  (instance as any).client.addFilters = addFilters;
  const fetchFilters = jest
    .fn()
    .mockResolvedValue({ ok: true, value: [{ type: 'word', body: '810', id: 114514 }] });
  (instance as any).client.fetchFilters = fetchFilters;

  const UPDATE_FILTERS = jest.fn();
  (instance as any).UPDATE_FILTERS = UPDATE_FILTERS;

  await instance.addFilter({ type: 'word', body: '810' });

  expect(UPDATE_FILTERS).toHaveBeenCalledTimes(1);
  expect(UPDATE_FILTERS).toHaveBeenCalledWith([{ type: 'word', body: '810', id: 114514 }]);
});

test('addFilters/既に追加済みのとき', async () => {
  setup();
  const { NicoliveCommentFilterService } = require('./nicolive-comment-filter');
  const instance = NicoliveCommentFilterService.instance as NicoliveCommentFilterService;

  const addFilters = jest.fn().mockResolvedValue({ ok: true, value: [] });
  (instance as any).client.addFilters = addFilters;

  instance.fetchFilters = jest.fn();

  const UPDATE_FILTERS = jest.fn();
  (instance as any).UPDATE_FILTERS = UPDATE_FILTERS;

  await instance.addFilter({ type: 'word', body: '810' });

  expect(instance.fetchFilters).toHaveBeenCalledTimes(1);
  // fetchFiltersが処理するのでここでは呼ばれない
  expect(UPDATE_FILTERS).toHaveBeenCalledTimes(0);
});

test('addFilters/失敗', async () => {
  setup();
  const { NicoliveCommentFilterService } = require('./nicolive-comment-filter');
  const instance = NicoliveCommentFilterService.instance as NicoliveCommentFilterService;

  const addFilters = jest.fn().mockResolvedValue({
    ok: false,
    value: { meta: { status: 400, errorCode: 'ERROR_CODE', errorMessage: 'simple description' } },
  });
  (instance as any).client.addFilters = addFilters;

  const UPDATE_FILTERS = jest.fn();
  (instance as any).UPDATE_FILTERS = UPDATE_FILTERS;

  await expect(instance.addFilter({ type: 'word', body: '810' })).rejects.toMatchInlineSnapshot(`
                    NicoliveFailure {
                      "additionalMessage": "ERROR_CODE: simple description",
                      "errorCode": "ERROR_CODE",
                      "method": "addFilters",
                      "reason": "400",
                      "type": "http_error",
                    }
                `);

  expect(UPDATE_FILTERS).toHaveBeenCalledTimes(0);
});

test('deleteFilters', async () => {
  setup();
  const { NicoliveCommentFilterService } = require('./nicolive-comment-filter');
  const instance = NicoliveCommentFilterService.instance as NicoliveCommentFilterService;
  instance.state.filters = [
    { type: 'word', body: '810', id: 114514 },
    { type: 'word', body: 'yay', id: 114515 },
  ];

  const deleteFilters = jest.fn().mockResolvedValue({ ok: true });
  (instance as any).client.deleteFilters = deleteFilters;

  const UPDATE_FILTERS = jest.fn();
  (instance as any).UPDATE_FILTERS = UPDATE_FILTERS;

  await instance.deleteFilters([114514]);

  expect(UPDATE_FILTERS).toHaveBeenCalledTimes(1);
  expect(UPDATE_FILTERS).toHaveBeenCalledWith([{ type: 'word', body: 'yay', id: 114515 }]);
});

test('deleteFilters/失敗', async () => {
  setup();
  const { NicoliveCommentFilterService } = require('./nicolive-comment-filter');
  const instance = NicoliveCommentFilterService.instance as NicoliveCommentFilterService;
  instance.state.filters = [
    { type: 'word', body: '810', id: 114514 },
    { type: 'word', body: 'yay', id: 114515 },
  ];

  const deleteFilters = jest.fn().mockResolvedValue({
    ok: false,
    value: { meta: { status: 400, errorCode: 'ERROR_CODE', errorMessage: 'simple description' } },
  });
  (instance as any).client.deleteFilters = deleteFilters;

  const UPDATE_FILTERS = jest.fn();
  (instance as any).UPDATE_FILTERS = UPDATE_FILTERS;

  await expect(instance.deleteFilters([114514])).rejects.toMatchInlineSnapshot(`
                    NicoliveFailure {
                      "additionalMessage": "ERROR_CODE: simple description",
                      "errorCode": "ERROR_CODE",
                      "method": "deleteFilters",
                      "reason": "400",
                      "type": "http_error",
                    }
                `);

  expect(UPDATE_FILTERS).toHaveBeenCalledTimes(0);
});

test('applyFilter', async () => {
  setup();
  const { NicoliveCommentFilterService } = require('./nicolive-comment-filter');
  const instance = NicoliveCommentFilterService.instance as NicoliveCommentFilterService;
  instance.state.filters = [
    { type: 'word', body: 'needle', id: 1 },
    { type: 'command', body: 'needle', id: 2 },
    { type: 'user', body: 'user needle', id: 3 },
  ];

  const chats = [
    { seqId: 0, type: 'normal', value: { content: 'content needle' } },
    { seqId: 1, type: 'normal', value: { user_id: 'user needle' } },
    { seqId: 2, type: 'normal', value: { mail: 'mail needle' } },
    { seqId: 3, type: 'operator', value: { content: 'content needle' } },
    { seqId: 4, type: 'operator', value: { user_id: 'user needle' } },
  ] as const;

  const after = chats.map(c => instance.applyFilter(c));

  expect(after[0].filtered).toBe(true);
  expect(after[1].filtered).toBe(true);
  expect(after[2].filtered).toBe(true);
  expect(after[3].filtered).toBeFalsy();
  expect(after[4].filtered).toBeFalsy();
});
