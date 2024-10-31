import * as fetchMock from 'fetch-mock';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createSetupFunction } from 'util/test-setup';
const xmlFeed = readFileSync(resolve(__dirname, './__fixtures__/feed.xml'), 'utf8');
const parsedFeed = require('./__fixtures__/parsedFeed.json');

jest.mock('services/core/stateful-service');
jest.mock('services/core/injector');
jest.mock('services/i18n', () => ({}));
jest.mock('services/hosts', () => ({}));
jest.mock('services/windows', () => ({}));
jest.mock('./state', () => ({}));

const ONE_DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const dummyURL = 'https://example.com';
const dummyValue = { value: 'dummy value' };
const dummyInformations = Array.from(Array(3), (_, i) => ({
  title: `title - ${i}`,
  url: `url - ${i}`,
  date: ONE_DAY_IN_MILLISECONDS * (i * 1),
}));

beforeEach(() => {
  // afterInitでフィードをGETするのでリクエストが飛ばないようにモックしておく
  fetchMock.get(dummyURL, xmlFeed);
});

// テスト側で上書きを許す
fetchMock.config.overwriteRoutes = true;

afterEach(() => {
  jest.resetModules();
  fetchMock.reset();
});

const setup = createSetupFunction({
  injectee: {
    HostsService: {
      niconicoNAirInformationsFeed: dummyURL,
    },
  },
});

test('get instance', () => {
  setup();
  const { InformationsService } = require('./informations');
  expect(InformationsService.instance).toBeInstanceOf(InformationsService);
});

test('fetchFeed(private):成功', async () => {
  setup();
  const m = require('./informations');

  // afterInitがupdateInformationsを呼ぶので、テストの安定のためにスキップ
  m.InformationsService.prototype.updateInformations = jest.fn();
  const instance = m.InformationsService.instance;
  expect(instance.updateInformations).toHaveBeenCalledTimes(1);

  (instance as any).SET_FETCHING = jest.fn();

  await expect((instance as any).fetchFeed()).resolves.toMatchSnapshot();
  expect((instance as any).SET_FETCHING).toHaveBeenCalledTimes(2);
  expect((instance as any).SET_FETCHING).toHaveBeenNthCalledWith(1, true);
  expect((instance as any).SET_FETCHING).toHaveBeenNthCalledWith(2, false);
});

test('fetchFeed(private):エラー系レスポンスで失敗', async () => {
  setup();
  const m = require('./informations');

  // afterInitがupdateInformationsを呼ぶので、テストの安定のためにスキップ
  m.InformationsService.prototype.updateInformations = jest.fn();
  const instance = m.InformationsService.instance;
  expect(instance.updateInformations).toHaveBeenCalledTimes(1);

  m.InformationsService.parseXml = jest.fn();

  fetchMock.get(dummyURL, { status: 404, body: dummyValue });
  (instance as any).SET_FETCHING = jest.fn();

  await expect((instance as any).fetchFeed()).rejects.toMatchObject({ status: 404 });
  expect(m.InformationsService.parseXml).not.toHaveBeenCalled();
  expect((instance as any).SET_FETCHING).toHaveBeenCalledTimes(2);
  expect((instance as any).SET_FETCHING).toHaveBeenNthCalledWith(1, true);
  expect((instance as any).SET_FETCHING).toHaveBeenNthCalledWith(2, false);
});

test('fetchFeed(private):パース失敗', async () => {
  setup();
  const m = require('./informations');

  // afterInitがupdateInformationsを呼ぶので、テストの安定のためにスキップ
  m.InformationsService.prototype.updateInformations = jest.fn();
  const instance = m.InformationsService.instance;
  expect(instance.updateInformations).toHaveBeenCalledTimes(1);

  m.InformationsService.parseXml = jest.fn().mockImplementation(() => {
    throw new Error('parse error');
  });

  (instance as any).SET_FETCHING = jest.fn();

  await expect((instance as any).fetchFeed()).rejects.toThrowError('parse error');
  expect((instance as any).SET_FETCHING).toHaveBeenCalledTimes(2);
  expect((instance as any).SET_FETCHING).toHaveBeenNthCalledWith(1, true);
  expect((instance as any).SET_FETCHING).toHaveBeenNthCalledWith(2, false);
});

test('updateInformations:成功', async () => {
  setup();
  const m = require('./informations');

  // afterInitがupdateInformationsを呼ぶので、テストの安定のためにスキップ
  // updateInformationsをテストしたいので、afterInitをスキップする
  m.InformationsService.prototype.afterInit = jest.fn();
  const instance = m.InformationsService.instance;
  expect(instance.afterInit).toHaveBeenCalledTimes(1);

  (instance as any).fetchFeed = jest.fn().mockResolvedValue(parsedFeed);
  (instance as any).SET_HAS_ERROR = jest.fn();
  (instance as any).SET_INFORMATIONS = jest.fn();

  await expect(instance.updateInformations()).resolves.toBeUndefined();
  expect((instance as any).SET_HAS_ERROR).toHaveBeenCalledTimes(1);
  expect((instance as any).SET_HAS_ERROR).toHaveBeenNthCalledWith(1, false);
  expect((instance as any).SET_INFORMATIONS).toHaveBeenCalledTimes(1);
  expect((instance as any).SET_INFORMATIONS.mock.calls[0]).toMatchSnapshot();
});

test('updateInformations:失敗', async () => {
  setup();
  const m = require('./informations');

  // afterInitがupdateInformationsを呼ぶので、テストの安定のためにスキップ
  // updateInformationsをテストしたいので、afterInitをスキップする
  m.InformationsService.prototype.afterInit = jest.fn();
  const instance = m.InformationsService.instance;
  expect(instance.afterInit).toHaveBeenCalledTimes(1);

  m.InformationsService.pluckItems = jest.fn();

  (instance as any).fetchFeed = jest.fn().mockRejectedValue(new Error('some error'));
  (instance as any).SET_HAS_ERROR = jest.fn();
  (instance as any).SET_INFORMATIONS = jest.fn();

  await expect(instance.updateInformations()).resolves.toBeUndefined();
  expect(m.InformationsService.pluckItems).not.toHaveBeenCalled();
  expect((instance as any).SET_HAS_ERROR).toHaveBeenCalledTimes(2);
  expect((instance as any).SET_HAS_ERROR).toHaveBeenNthCalledWith(1, false);
  expect((instance as any).SET_HAS_ERROR).toHaveBeenNthCalledWith(2, true);
  expect((instance as any).SET_INFORMATIONS).not.toHaveBeenCalled();
});

test('hasUnseenItem:あるとき', () => {
  setup({
    injectee: {
      InformationsStateService: {
        lastOpen: 1.5 * ONE_DAY_IN_MILLISECONDS,
      },
    },
    state: {
      InformationsService: {
        informations: dummyInformations,
      },
    },
  });
  const m = require('./informations');

  // afterInitがupdateInformationsを呼び出すのでスキップしておく
  m.InformationsService.prototype.updateInformations = jest.fn();
  const instance = m.InformationsService.instance;
  expect(instance.updateInformations).toHaveBeenCalledTimes(1);

  expect(instance.hasUnseenItem).toBe(true);
});

test('hasUnseenItem:ないとき', () => {
  setup({
    injectee: {
      InformationsStateService: {
        lastOpen: 4 * ONE_DAY_IN_MILLISECONDS,
      },
    },
    state: {
      InformationsService: {
        informations: dummyInformations,
      },
    },
  });
  const m = require('./informations');

  // afterInitがupdateInformationsを呼び出すのでスキップしておく
  m.InformationsService.prototype.updateInformations = jest.fn();
  const instance = m.InformationsService.instance;
  expect(instance.updateInformations).toHaveBeenCalledTimes(1);

  expect(instance.hasUnseenItem).toBe(false);
});

test('hasUnseenItem:取得中', () => {
  setup({
    state: {
      InformationsService: {
        fetching: true,
        informations: dummyInformations,
      },
    },
    injectee: {
      InformationsStateService: {
        lastOpen: 1.5 * ONE_DAY_IN_MILLISECONDS,
      },
    },
  });
  const m = require('./informations');

  // afterInitがupdateInformationsを呼び出すのでスキップしておく
  m.InformationsService.prototype.updateInformations = jest.fn();
  const instance = m.InformationsService.instance;
  expect(instance.updateInformations).toHaveBeenCalledTimes(1);

  expect(instance.hasUnseenItem).toBe(false);
});
