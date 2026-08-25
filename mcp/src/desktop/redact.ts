/**
 * Secret scrubbing.
 *
 * The external API falls through to the whole internal service registry
 * (external-api.ts:119-121), which puts OAuth access tokens (UserService.state),
 * the RTMP stream key (StreamSettingsService / SettingsService 'Stream'), widget
 * tokens embedded in browser-source URLs, and the API token one call away from the
 * model's context window -- and model context leaves the machine.
 *
 * This is the one genuinely NEW risk this project introduces; everything else in the
 * safety model protects the streamer from the agent. Prefer over-redaction: a model
 * that can't see the encoder preset is annoying, one that pastes a stream key into a
 * summary is a live-stream hijack.
 */

const REDACTED = '[redacted]';

const SECRET_KEY = /(^|[_\-.])(key|token|secret|password|passwd|pwd|oauth|auth|credential|cookie|session|apikey)($|[_\-.])|streamkey|api_?token|access_?token|refresh_?token/i;

/** Twitch stream-key shape, e.g. live_123456789_AbCdEf... */
const STREAM_KEY_VALUE = /^live_\d+_[A-Za-z0-9]{8,}$/;

/** Long high-entropy blobs that look like credentials. */
const HIGH_ENTROPY = /^[A-Za-z0-9_\-]{32,}$/;

const URL_SECRET_PARAM = /([?&](?:token|key|secret|auth|access_token|api_key)=)[^&#\s]+/gi;

/** Resources whose payloads are denied outright rather than scrubbed field by field. */
export const DENIED_RESOURCES = new Set([
  'UserService',
  'StreamSettingsService',
  'FileManagerService',
]);

export interface RedactionResult<T> {
  value: T;
  redactedFields: number;
}

function redactString(s: string, counter: { n: number }): string {
  if (STREAM_KEY_VALUE.test(s)) {
    counter.n++;
    return REDACTED;
  }
  if (s.includes('://') || s.startsWith('?') || s.includes('&')) {
    const replaced = s.replace(URL_SECRET_PARAM, (_m, prefix) => `${prefix}${REDACTED}`);
    if (replaced !== s) counter.n++;
    return replaced;
  }
  return s;
}

function walk(value: unknown, counter: { n: number }, depth = 0, keyHint = ''): unknown {
  if (depth > 24) return value;

  if (typeof value === 'string') {
    // A value under a secret-looking key is redacted whatever it looks like.
    if (keyHint && SECRET_KEY.test(keyHint)) {
      if (value.length > 0) counter.n++;
      return value.length > 0 ? REDACTED : value;
    }
    return redactString(value, counter);
  }

  if (Array.isArray(value)) return value.map(v => walk(v, counter, depth + 1, keyHint));

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(k)) {
        // Preserve shape but drop the value, regardless of type.
        if (v !== null && v !== undefined && v !== '') counter.n++;
        out[k] = v === null || v === undefined || v === '' ? v : REDACTED;
        continue;
      }
      if (typeof v === 'string' && HIGH_ENTROPY.test(v) && /url|uri|src|href/i.test(k)) {
        counter.n++;
        out[k] = REDACTED;
        continue;
      }
      out[k] = walk(v, counter, depth + 1, k);
    }
    return out;
  }

  return value;
}

/** Apply to EVERY payload before it becomes tool output. */
export function redact<T>(value: T): RedactionResult<T> {
  const counter = { n: 0 };
  const out = walk(value, counter) as T;
  return { value: out, redactedFields: counter.n };
}

export function isDeniedResource(resourceId: string): boolean {
  const base = resourceId.split('[')[0];
  return DENIED_RESOURCES.has(base);
}
