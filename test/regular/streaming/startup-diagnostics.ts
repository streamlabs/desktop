import test from 'ava';
import type { ApiClient } from '../../helpers/api-client';

const core = require('../../helpers/modules/core') as typeof import('../../helpers/modules/core');
const api = require('../../helpers/api-client') as typeof import('../../helpers/api-client');
const {
  waitForStreamStart,
} = require('../../helpers/modules/streaming') as typeof import('../../helpers/modules/streaming');

async function withStartupFixture(
  waitForClickable: () => Promise<void>,
  getModel: () => unknown,
  callback: (logs: unknown[][]) => Promise<void>,
) {
  const originalUseMainWindow = core.useMainWindow;
  const originalSelectButton = core.selectButton;
  const originalGetApiClient = api.getApiClient;
  const originalConsoleError = console.error;
  const logs: unknown[][] = [];
  core.useMainWindow = async callback => callback();
  core.selectButton = async () => ({ waitForClickable } as WebdriverIO.Element);
  api.getApiClient = async () => (({ getResource: () => ({ getModel }) } as unknown) as ApiClient);
  console.error = (...args: unknown[]) => logs.push(args);
  try {
    await callback(logs);
  } finally {
    core.useMainWindow = originalUseMainWindow;
    core.selectButton = originalSelectButton;
    api.getApiClient = originalGetApiClient;
    console.error = originalConsoleError;
  }
}

test.serial(
  'Stream startup failure logs the Go Live error and preserves the original exception',
  async t => {
    const startupError = new Error('End Stream did not become clickable');
    const checklist = { youtube: 'failed', startVideoTransmission: 'not-started' };
    const status = { horizontal: { streaming: 'offline' }, vertical: { streaming: 'offline' } };
    const error = {
      type: 'YOUTUBE_CREATE_BROADCAST_FAILED',
      message: 'Failed to create the YouTube broadcast',
      details: 'User Requests Exceed Rate Limit (User requests exceed the rate limit.)',
      platform: 'youtube',
      reason: 'userRequestsExceedRateLimit',
    };

    await withStartupFixture(
      async () => {
        throw startupError;
      },
      () => ({
        info: {
          lifecycle: 'runChecklist',
          checklist,
          error: { ...error, url: 'https://example.invalid/?token=private-token' },
          settings: { streamKey: 'private-stream-key', title: 'private title' },
        },
        status,
        token: 'private-token',
      }),
      async logs => {
        t.is(await t.throwsAsync(waitForStreamStart()), startupError);
        t.deepEqual(logs, [
          ['Go Live startup state:', { lifecycle: 'runChecklist', checklist, status, error }],
        ]);
        const serialized = JSON.stringify(logs);
        for (const secret of ['private-token', 'private-stream-key', 'private title']) {
          t.false(serialized.includes(secret));
        }
      },
    );
  },
);

test.serial(
  'Stream startup diagnostics cannot replace the original failure when the model is unavailable',
  async t => {
    const startupError = new Error('Original startup failure');
    await withStartupFixture(
      async () => {
        throw startupError;
      },
      () => {
        throw new Error('Diagnostic model unavailable');
      },
      async logs => {
        t.is(await t.throwsAsync(waitForStreamStart()), startupError);
        t.deepEqual(logs, [['Go Live startup state: unavailable']]);
      },
    );
  },
);

test.serial('Successful stream startup does not collect or log failure diagnostics', async t => {
  let modelReads = 0;
  await withStartupFixture(
    async () => {},
    () => {
      modelReads += 1;
      throw new Error('Successful startup must not request diagnostics');
    },
    async logs => {
      await waitForStreamStart();
      t.is(modelReads, 0);
      t.deepEqual(logs, []);
    },
  );
});
