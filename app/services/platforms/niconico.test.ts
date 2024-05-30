import { createSetupFunction } from 'util/test-setup';

const setup = createSetupFunction({
  injectee: {
    HostsService: {},
    SettingsService: {},
    UserService: {},
    StreamingService: {
      streamingStatusChange: {
        subscribe() {},
      },
    },
    WindowsService: {},
  },
});

jest.mock('services/core/stateful-service');
jest.mock('services/core/injector');
jest.mock('services/streaming', () => ({}));
jest.mock('services/user', () => ({}));
jest.mock('services/settings', () => ({}));
jest.mock('services/windows', () => ({}));
jest.mock('services/i18n', () => ({
  $t: (x: any) => x,
}));
jest.mock('util/sleep', () => ({
  sleep: () => jest.requireActual('util/sleep').sleep(0),
}));
jest.mock('util/menus/Menu', () => ({}));
jest.mock('services/sources');
jest.mock('services/i18n', () => ({
  $t: (x: any) => x,
}));

beforeEach(() => {
  jest.resetModules();
});

test('get instance', () => {
  setup();
  const { NiconicoService } = require('./niconico');
  expect(NiconicoService.instance).toBeInstanceOf(NiconicoService);
});

test('setupStreamSettingsでストリーム情報がとれた場合', async () => {
  const updatePlatformChannelId = jest.fn();
  const getSettingsFormData = jest.fn();
  const setSettings = jest.fn();
  const showWindow = jest.fn();

  getSettingsFormData.mockReturnValue([
    {
      nameSubCategory: 'Untitled',
      parameters: [
        { name: 'service', value: '' },
        { name: 'server', value: '' },
        { name: 'key', value: '' },
      ],
    },
  ]);

  const injectee = {
    UserService: {
      updatePlatformChannelId,
    },
    SettingsService: {
      getSettingsFormData,
      setSettings,
    },
    WindowsService: {
      showWindow,
    },
  };

  setup({ injectee });
  const { NiconicoService } = require('./niconico');
  const { instance } = NiconicoService;

  instance.client.fetchBroadcastStream = jest.fn((programId: string) =>
    Promise.resolve({
      url: 'url1',
      name: 'key1',
    }),
  );
  instance.client.fetchMaxQuality = jest.fn((programId: string) =>
    Promise.resolve({
      bitrate: 6000,
      height: 720,
      fps: 30,
    }),
  );

  const result = await instance.setupStreamSettings('lv12345');
  expect(result).toEqual({
    url: 'url1',
    key: 'key1',
    quality: {
      bitrate: 6000,
      height: 720,
      fps: 30,
    },
  });

  expect(setSettings).toHaveBeenCalledTimes(1);
  expect(setSettings.mock.calls[0]).toMatchSnapshot();
});

test('setupStreamSettingsで番組取得にリトライで成功する場合', async () => {
  const updatePlatformChannelId = jest.fn();
  const getSettingsFormData = jest.fn();
  const setSettings = jest.fn();

  getSettingsFormData.mockReturnValue([
    {
      nameSubCategory: 'Untitled',
      parameters: [
        { name: 'service', value: '' },
        { name: 'server', value: '' },
        { name: 'key', value: '' },
      ],
    },
  ]);

  const injectee = {
    UserService: { updatePlatformChannelId },
    SettingsService: { getSettingsFormData, setSettings },
  };

  setup({ injectee });
  const { NiconicoService } = require('./niconico');
  const { instance } = NiconicoService;

  instance.client.fetchBroadcastStream = jest.fn((programId: string) =>
    Promise.resolve({
      url: 'url1',
      name: 'key1',
    }),
  );
  instance.client.fetchMaxQuality = jest.fn((programId: string) =>
    Promise.resolve({
      bitrate: 6000,
      height: 720,
      fps: 30,
    }),
  );

  const result = await instance.setupStreamSettings();
  expect(result).toEqual({
    url: 'url1',
    key: 'key1',
    quality: {
      bitrate: 6000,
      height: 720,
      fps: 30,
    },
  });
  expect(setSettings).toHaveBeenCalledTimes(1);
  expect(setSettings.mock.calls[0]).toMatchSnapshot();
});
