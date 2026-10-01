import test from 'ava';
import { sanitizePlatformRequestFailure } from '../../app/services/platforms/utils';

test('platform request failure diagnostics retain only safe structured fields', t => {
  const diagnostic = sanitizePlatformRequestFailure(
    'youtube',
    {
      url: 'https://www.googleapis.com/youtube/v3/liveStreams?access_token=secret-token',
      method: 'post',
      headers: { Authorization: 'Bearer secret-token' },
      body: JSON.stringify({ streamKey: 'secret-stream-key', title: 'private title' }),
    },
    {
      status: 403,
      statusText: 'Forbidden private response text',
      url: 'https://www.googleapis.com/youtube/v3/liveStreams?access_token=secret-token',
      result: {
        error: {
          message: 'Private server message',
          errors: [{ reason: 'liveStreamingNotEnabled', message: 'Private detail' }],
        },
      },
    },
  );

  t.deepEqual(diagnostic, {
    platform: 'youtube',
    method: 'POST',
    status: 403,
    reason: 'liveStreamingNotEnabled',
  });
  const serialized = JSON.stringify(diagnostic);
  for (const secret of [
    'secret-token',
    'secret-stream-key',
    'private title',
    'Private server message',
    'Private detail',
    'liveStreams',
  ]) {
    t.false(serialized.includes(secret));
  }
});

test('platform request failure diagnostics omit untrusted status and reason values', t => {
  t.deepEqual(
    sanitizePlatformRequestFailure(
      'youtube',
      { url: 'https://example.invalid/private', method: 'POST\nsecret' },
      {
        status: 0,
        result: { error: { errors: [{ reason: 'quotaExceeded\nsecret-token' }] } },
      },
    ),
    { platform: 'youtube', method: 'UNKNOWN' },
  );

  t.deepEqual(
    sanitizePlatformRequestFailure('twitch', 'https://example.invalid/secret', new TypeError()),
    { platform: 'twitch', method: 'GET' },
  );

  t.deepEqual(
    sanitizePlatformRequestFailure('twitch', 'https://example.invalid/secret', {
      status: 403,
      result: { error: { errors: [{ reason: 'opaqueSecretIdentifier' }] } },
    }),
    { platform: 'twitch', method: 'GET', status: 403 },
  );
});

test.serial('a failed token refresh preserves the authoritative request rejection', async t => {
  const indexPath = require.resolve('../../app/services/platforms/index');
  const cachedIndex = require.cache[indexPath];
  const originalFetch = globalThis.fetch;
  const originalConsoleLog = console.log;
  const diagnostics: unknown[][] = [];
  let requestCount = 0;

  require.cache[indexPath] = ({
    id: indexPath,
    filename: indexPath,
    loaded: true,
    exports: {
      getPlatformService: () => ({
        getHeaders: () => ({ 'Content-Type': 'application/json' }),
        fetchNewToken: async () => {
          throw new TypeError('refresh transport unavailable');
        },
      }),
    },
  } as unknown) as NodeModule;
  globalThis.fetch = (async () => {
    requestCount += 1;
    return new Response(
      JSON.stringify({ error: { errors: [{ reason: 'authError' }] } }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }) as typeof fetch;
  console.log = (...args: unknown[]) => diagnostics.push(args);

  try {
    const { platformRequest } = await import('../../app/services/platforms/utils');
    const error = await platformRequest(
      'youtube',
      {
        url: 'https://www.googleapis.com/youtube/v3/liveStreams',
        method: 'POST',
        body: JSON.stringify({ streamKey: 'must-not-be-logged' }),
      },
      true,
    ).then(
      () => null,
      (error: unknown) => error,
    );

    t.truthy(error);
    t.is(
      (error as { status?: number }).status,
      401,
      'the original request rejection remains visible to resource recovery',
    );
    t.is(requestCount, 1, 'no second resource-creation request was attempted');
    t.deepEqual(diagnostics, [
      [
        'Failed platform request',
        { platform: 'youtube', method: 'POST', status: 401, reason: 'authError' },
      ],
    ]);
    t.false(JSON.stringify(diagnostics).includes('must-not-be-logged'));
    t.false(JSON.stringify(diagnostics).includes('refresh transport unavailable'));
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalConsoleLog;
    if (cachedIndex) require.cache[indexPath] = cachedIndex;
    else delete require.cache[indexPath];
  }
});
