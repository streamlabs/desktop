import { jest_fn } from 'util/jest_fn';
import { createSetupFunction } from 'util/test-setup';
import type { NicoliveClient } from './NicoliveClient';
type NicoliveSupportersService = import('./nicolive-supporters').NicoliveSupportersService;

const setup = createSetupFunction({
  state: {},
  injectee: {
    NicoliveProgramService: {},
  },
});

jest.mock('util/menus/Menu', () => ({}));

beforeEach(() => {
  jest.doMock('services/core/stateful-service');
  jest.doMock('services/core/injector');
});

afterEach(() => {
  jest.resetModules();
});

function prepare() {
  setup();

  const fetchSupporters = jest_fn<NicoliveClient['fetchSupporters']>();
  jest.doMock('./NicoliveClient', () => ({
    ...(jest.requireActual('./NicoliveClient') as {}),
    NicoliveClient: class NicoliveClient {
      fetchSupporters = fetchSupporters;
    },
  }));

  const openErrorDialogFromFailure = jest.fn();
  jest.doMock('./NicoliveFailure', () => ({
    ...(jest.requireActual('./NicoliveFailure') as {}),
    openErrorDialogFromFailure,
  }));

  const { NicoliveSupportersService } = require('./nicolive-supporters');
  const instance = NicoliveSupportersService.instance as NicoliveSupportersService;
  return {
    instance,
    fetchSupporters,
    openErrorDialogFromFailure,
  };
}

describe('update', () => {
  it('updates the state when updated successfully', async () => {
    const { instance, fetchSupporters } = prepare();
    fetchSupporters.mockResolvedValue({
      ok: true,
      value: {
        supporterIds: ['1', '2', '3'],
        totalCount: 3,
      },
    });

    // 事前状態
    expect(instance.state.supporterIds).toEqual([]);

    const supporterIds = await instance.update();
    expect(fetchSupporters).toBeCalledTimes(1);
    expect(supporterIds).toEqual(['1', '2', '3']);

    // 事後状態
    expect(instance.state.supporterIds).toEqual(['1', '2', '3']);
  });

  it('shows an error dialog when an error occurs', async () => {
    const { instance, fetchSupporters, openErrorDialogFromFailure } = prepare();
    fetchSupporters.mockResolvedValue({
      ok: false,
      value: {
        meta: {
          status: 400,
          errorCode: 'error_code',
        },
      },
    });
    await instance.update();
    expect(fetchSupporters).toBeCalledTimes(1);
    expect(instance.state.supporterIds).toEqual([]);

    expect(openErrorDialogFromFailure).toBeCalledWith(
      expect.objectContaining({
        additionalMessage: 'error_code',
        errorCode: 'error_code',
        method: 'fetchSupporters',
        reason: '400',
        type: 'http_error',
      }),
    );
  });
});
