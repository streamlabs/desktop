interface IYouTubeBroadcastRateLimit {
  type: 'YOUTUBE_CREATE_BROADCAST_FAILED';
  platform: 'youtube';
  reason: 'userRequestsExceedRateLimit';
}

export function isYouTubeBroadcastRateLimit(error: unknown): error is IYouTubeBroadcastRateLimit {
  if (!error || typeof error !== 'object') return false;
  const value = error as Record<string, unknown>;
  return (
    value.type === 'YOUTUBE_CREATE_BROADCAST_FAILED' &&
    value.platform === 'youtube' &&
    value.reason === 'userRequestsExceedRateLimit'
  );
}

/** Identifies an unavailable test account without losing the original startup exception. */
export class YouTubeRateLimitError extends Error {
  constructor(readonly originalError: unknown) {
    super('YouTube account request rate limit prevented the live-stream checks');
    this.name = 'YouTubeRateLimitError';
  }
}

/** Remove only recognized quota error entries after a test acknowledges this exact failure. */
export function omitYouTubeRateLimitLogEntries(logs: string): string {
  const result: string[] = [];
  let entry: string[] = [];
  let windowId = '';
  let header = '';

  function flush() {
    const text = entry.join('\n');
    const knownHeader = /^(Failed YouTube (API )?Request|Error setting platform settings|Error running beforeGoLive for platform youtube|Error setting up platform youtube YOUTUBE_CREATE_BROADCAST_FAILED|Setup platform error, prompting user to bypass)\b/.test(
      header,
    );
    const rateLimited = /["']?reason["']?\s*:\s*["']userRequestsExceedRateLimit["']/.test(text);
    const youtubeRequest = /^Failed YouTube (API )?Request\b/.test(header);
    const broadcastError =
      text.includes('YOUTUBE_CREATE_BROADCAST_FAILED') &&
      /["']?platform["']?\s*:\s*["']youtube["']/.test(text);
    if (!knownHeader || !rateLimited || (!youtubeRequest && !broadcastError)) {
      result.push(...entry);
    }
    entry = [];
  }

  for (const line of logs.split('\n')) {
    const record = /\[error\]\s+\[([^\]]+)\]\s+- (.*)$/.exec(line);
    if (!record) {
      flush();
      result.push(line);
      continue;
    }
    const [, source, message] = record;
    const continuation =
      !message.trim() ||
      /^\s|^[}\]]/.test(message) ||
      (/^Failed YouTube (API )?Request\b/.test(header) &&
        /^(Request Info:|Error: \{)/.test(message));
    if (!entry.length || source !== windowId || !continuation) {
      flush();
      windowId = source;
      header = message;
    }
    entry.push(line);
  }
  flush();
  return result.join('\n');
}
