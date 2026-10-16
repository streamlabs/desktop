import { test, useWebdriver, withYouTubeRateLimitWarning } from '../../helpers/webdriver';
import { focusMain, focusWindow, getClient } from '../../helpers/modules/core';
import type { ApiClient } from '../../helpers/api-client';

const core = require('../../helpers/modules/core') as typeof import('../../helpers/modules/core');
const api = require('../../helpers/api-client') as typeof import('../../helpers/api-client');
const {
  waitForStreamStart,
} = require('../../helpers/modules/streaming') as typeof import('../../helpers/modules/streaming');

// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test(
  'YouTube account rate limits produce a warning without failing the test log check',
  withYouTubeRateLimitWarning(async t => {
    const error = {
      type: 'YOUTUBE_CREATE_BROADCAST_FAILED',
      platform: 'youtube',
      reason: 'userRequestsExceedRateLimit',
      details: 'Synthetic YouTube account rate limit',
    };
    await focusWindow('worker');
    // Exercise real renderer logging without reserving an account or making a platform request.
    await getClient().execute((failure: any) => {
      console.error(
        'Failed YouTube API Request',
        '\nRequest Info:',
        { method: 'POST', url: 'https://example.invalid/liveBroadcasts' },
        '\nError:',
        { errors: [{ reason: failure.reason }] },
      );
      console.error('Error setting platform settings', failure);
      console.error('Error running beforeGoLive for platform youtube\n', failure);
      console.error('Error setting up platform', 'youtube', failure.type, failure);
    }, error);

    const originalUseMainWindow = core.useMainWindow;
    const originalSelectButton = core.selectButton;
    const originalGetApiClient = api.getApiClient;
    core.useMainWindow = async callback => callback();
    core.selectButton = async () =>
      (({
        waitForClickable: async () => {
          throw new Error('Synthetic startup timeout');
        },
      } as unknown) as WebdriverIO.Element);
    api.getApiClient = async () =>
      (({
        getResource: () => ({ getModel: () => ({ info: { error }, status: {} }) }),
      } as unknown) as ApiClient);
    try {
      await waitForStreamStart();
      t.fail('Live-stream assertions must not run after the account rate limit');
    } finally {
      core.useMainWindow = originalUseMainWindow;
      core.selectButton = originalSelectButton;
      api.getApiClient = originalGetApiClient;
      await focusMain();
    }
  }),
);
