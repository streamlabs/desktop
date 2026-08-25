/**
 * Diagnostics.
 *
 * CRITICAL: stdout is the MCP transport. A single console.log() corrupts the JSON-RPC
 * stream and the client drops the server with an opaque error. Everything goes to
 * stderr, or to the file named by SLD_MCP_LOG.
 */
import * as fs from 'node:fs';

const LOG_FILE = process.env.SLD_MCP_LOG;
const VERBOSE = process.env.SLD_MCP_VERBOSE === '1';

let stream: fs.WriteStream | null = null;
if (LOG_FILE) {
  try {
    stream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  } catch {
    // fall through to stderr
  }
}

function render(args: unknown[]): string {
  return args
    .map(a => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

export function log(...args: unknown[]): void {
  const line = `[${new Date().toISOString()}] ${render(args)}\n`;
  if (stream) stream.write(line);
  else if (VERBOSE || !LOG_FILE) process.stderr.write(line);
}

/** Gated audit trail: every confirmed destructive action, whether or not it ran. */
export function audit(entry: Record<string, unknown>): void {
  log('AUDIT', JSON.stringify(entry));
}
