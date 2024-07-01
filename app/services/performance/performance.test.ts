import { createSetupFunction } from 'util/test-setup';
const setup = createSetupFunction({
  injectee: {
    CustomizationService: {
      pollingPerformanceStatistics: true,
    },
  },
});

jest.mock('services/core/stateful-service');
jest.mock('services/core/injector');
jest.mock('services/settings', () => ({}));
jest.mock('services/customization', () => ({}));
jest.mock('../../../obs-api', () => ({
  NodeObs: {},
}));

beforeEach(() => {
  jest.resetModules();
});

test('get instance', () => {
  const { PerformanceService } = require('./performance');
  expect(PerformanceService.instance).toBeInstanceOf(PerformanceService);
});

test('update', () => {
  jest.doMock('@electron/remote', () => ({
    app: {
      getAppMetrics() {
        return [
          {
            cpu: {
              percentCPUUsage: 1,
            },
          },
          {
            cpu: {
              percentCPUUsage: 2,
            },
          },
        ];
      },
    },
  }));
  jest.doMock('../../../obs-api', () => ({
    NodeObs: {
      OBS_API_getPerformanceStatistics() {
        return { dummy: 'obs result', CPU: 0 };
      },
    },
  }));
  setup();

  const { PerformanceService } = require('./performance');
  const { instance } = PerformanceService;
  instance.SET_PERFORMANCE_STATS = jest.fn();
  instance.update();
  expect(instance.SET_PERFORMANCE_STATS).toHaveBeenNthCalledWith(1, {
    dummy: 'obs result',
    CPU: 3,
  });
});
