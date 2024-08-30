import { readFileSync } from 'fs';
import { createSetupFunction } from 'util/test-setup';

jest.mock('@electron/remote', () => ({
  app: {
    getAppPath() {
      return '.';
    },
  },
}));
jest.mock('services/core/stateful-service');
jest.mock('services/core/injector');
jest.mock('../../../obs-api', () => ({
  Global: {},
}));
jest.mock('services/app', () => ({}));
jest.mock('components/obs/inputs/ObsInput', () => ({}));

const setup = createSetupFunction({
  injectee: {
    FileManagerService: {
      read(filename: string) {
        return readFileSync(filename, 'utf-8');
      },
    },
  },
  state: {
    I18nService: {},
  },
});

test('get instance', () => {
  setup();
  const { I18nService } = require('./i18n');
  expect(I18nService.instance).toBeInstanceOf(I18nService);
});

test('load', async () => {
  setup();
  const { I18nService } = require('./i18n');
  const { instance } = I18nService;
  await instance.load();
  expect(instance.isLoaded).toBe(true);
  expect(typeof instance.state.locale).toBe('string');
  expect(instance.availableLocales).toMatchSnapshot();
});
