import test from 'ava';
import { format } from 'util';
import { withYouTubeRateLimitWarning, TExecutionContext } from '../helpers/webdriver';
import {
  isYouTubeBroadcastRateLimit,
  omitYouTubeRateLimitLogEntries,
  YouTubeRateLimitError,
} from '../helpers/youtube-rate-limit';

const quotaError = {
  type: 'YOUTUBE_CREATE_BROADCAST_FAILED',
  platform: 'youtube',
  reason: 'userRequestsExceedRateLimit',
  details: 'User Requests Exceed Rate Limit (User requests exceed the rate limit.)',
};

function logEntry(message: string, source = 'worker') {
  return message
    .split('\n')
    .map(line => `[2026-10-16T00:00:00.000Z] [error] [${source}] - ${line}`)
    .join('\n');
}

function fakeContext() {
  const logs: unknown[][] = [];
  let acknowledgements = 0;
  const context = ({
    log: (...args: unknown[]) => logs.push(args),
    pass: () => acknowledgements++,
  } as unknown) as TExecutionContext;
  return {
    context,
    logs,
    get acknowledgements() {
      return acknowledgements;
    },
  };
}

test('Only the exact YouTube broadcast user rate limit qualifies for a warning', t => {
  t.true(isYouTubeBroadcastRateLimit(quotaError));
  for (const error of [
    null,
    'userRequestsExceedRateLimit',
    { ...quotaError, type: 'UNKNOWN_ERROR' },
    { ...quotaError, platform: 'twitch' },
    { ...quotaError, reason: 'quotaExceeded' },
    { ...quotaError, reason: undefined },
  ]) {
    t.false(isYouTubeBroadcastRateLimit(error));
  }
});

test('A rate-limited YouTube test ends its checks with a warning and runs cleanup', async t => {
  const fixture = fakeContext();
  let remainingChecks = false;
  let cleanedUp = false;
  await withYouTubeRateLimitWarning(async () => {
    try {
      await Promise.reject(new YouTubeRateLimitError(new Error('Stream start timed out')));
      remainingChecks = true;
    } finally {
      cleanedUp = true;
    }
  })(fixture.context);
  t.false(remainingChecks);
  t.true(cleanedUp);
  t.is(fixture.acknowledgements, 1);
  t.deepEqual(fixture.logs, [
    ['WARNING: YouTube account rate limited; remaining live-stream checks were not run.'],
  ]);
});

test('The YouTube warning wrapper preserves ordinary failures and successful checks', async t => {
  const fixture = fakeContext();
  const error = new Error('Unrelated assertion or startup failure');
  t.is(
    await t.throwsAsync(
      withYouTubeRateLimitWarning(async () => {
        throw error;
      })(fixture.context),
    ),
    error,
  );
  let completed = false;
  await withYouTubeRateLimitWarning(async () => {
    completed = true;
  })(fixture.context);
  t.true(completed);
  t.is(fixture.acknowledgements, 0);
  t.deepEqual(fixture.logs, []);
});

test('Acknowledged quota logs cover the API request and streaming error handlers', t => {
  const entries = [
    format(
      'Failed YouTube API Request',
      '\nRequest Info:',
      { url: 'https://example.invalid/liveBroadcasts', method: 'POST' },
      '\nError:',
      { errors: [{ reason: quotaError.reason }] },
    ),
    format('Error setting platform settings', quotaError),
    format('Error running beforeGoLive for platform youtube\n', quotaError),
    format('Error setting up platform', 'youtube', quotaError.type, quotaError),
    format('Setup platform error, prompting user to bypass', quotaError),
  ].map(entry => logEntry(entry));
  t.is(omitYouTubeRateLimitLogEntries(entries.join('\n')), '');
});

test('Unexpected renderer errors remain fatal alongside acknowledged quota logs', t => {
  const quota = logEntry(format('Error setting platform settings', quotaError));
  const unexpected = logEntry('TypeError: source.getPropertiesFormData is not a function');
  const otherWindow = logEntry('Error: Unexpected child failure', 'child');
  const genericError = logEntry('Error: Unexpected worker failure');
  const rawQuota = logEntry(
    format('Failed YouTube Request', '\nError:', { errors: [{ reason: quotaError.reason }] }),
  );
  t.is(
    omitYouTubeRateLimitLogEntries([quota, unexpected, otherWindow].join('\n')),
    [unexpected, otherWindow].join('\n'),
  );
  t.is(omitYouTubeRateLimitLogEntries([rawQuota, genericError].join('\n')), genericError);
});

test('Other YouTube errors and unknown log messages are never suppressed', t => {
  for (const message of [
    format('Error setting platform settings', { ...quotaError, reason: 'forbidden' }),
    format('Error setting platform settings', { ...quotaError, platform: 'twitch' }),
    format('Error setting platform settings', { ...quotaError, type: 'UNKNOWN_ERROR' }),
    format('Unexpected failure', quotaError),
    'TypeError: userRequestsExceedRateLimit',
  ]) {
    const logs = logEntry(message);
    t.is(omitYouTubeRateLimitLogEntries(logs), logs);
  }
});
