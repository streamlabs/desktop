/**
 * Stream health: measure what is happening now, and fix it when there is a safe fix.
 *
 *   check_stream_health -- windowed health (see desktop/health.ts) with a diagnosis
 *   fix_stream_health   -- the automatic fix for network congestion: lower the live video
 *                          bitrate to fit what the connection carries and return; the agent
 *                          verifies with check_stream_health. Bounded: a floor, one change per minute, and
 *                          the original bitrate is remembered so it can be restored.
 *
 * Only the network case is fixed automatically: lowering bitrate is safe and reversible.
 * Encoder and rendering problems come back as suggestions.
 */

import fs from 'node:fs';
import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Ctx, fail, guard, ok, requestedBy } from './shared.js';
import {
  measureHealth,
  MIN_AUTO_BITRATE,
  HealthReport,
  ORIGINAL_BITRATE_FILE,
  LAST_FIX_FILE,
} from '../desktop/health.js';

const MIN_SECONDS_BETWEEN_FIXES = 60;

let lastFixAt = 0;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function readOriginal(): number | null {
  try {
    const v = JSON.parse(fs.readFileSync(ORIGINAL_BITRATE_FILE, 'utf8')).bitrate;
    return typeof v === 'number' ? v : null;
  } catch {
    return null;
  }
}

function writeOriginal(bitrate: number | null): void {
  try {
    if (bitrate === null) fs.rmSync(ORIGINAL_BITRATE_FILE, { force: true });
    else fs.writeFileSync(ORIGINAL_BITRATE_FILE, JSON.stringify({ bitrate }));
  } catch {
    /* best effort */
  }
}

interface LastFix {
  /** Local clock time, for telling the streamer. */
  at: string;
  atMs: number;
  fromKbps: number;
  toKbps: number;
  droppedBeforePct: number;
}

/** After a bitrate change the send buffer takes several seconds to drain. */
const SETTLE_MS = 12000;

function readLastFix(): LastFix | null {
  try {
    return JSON.parse(fs.readFileSync(LAST_FIX_FILE, 'utf8')) as LastFix;
  } catch {
    return null;
  }
}

function writeLastFix(fix: LastFix): void {
  try {
    fs.writeFileSync(LAST_FIX_FILE, JSON.stringify(fix));
  } catch {
    /* best effort */
  }
}

function brief(r: HealthReport) {
  return {
    status: r.status,
    droppedPct: r.droppedPct,
    uploadKbps: r.uploadKbps,
    bitrateKbps: r.bitrateKbps,
  };
}

async function setBitrate(ctx: Ctx, kbps: number): Promise<void> {
  try {
    await ctx.client.request('StreamingService', 'setLiveVideoBitrate', [kbps]);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/METHOD_NOT_FOUND/.test(msg)) {
      throw new Error(
        'This Streamlabs build cannot change bitrate while live (StreamingService.setLiveVideoBitrate ' +
          'is missing). Rebuild and restart Streamlabs.',
      );
    }
    throw e;
  }
}

export function registerHealth(server: McpServer, ctx: Ctx): void {
  server.registerTool(
    'check_stream_health',
    {
      title: 'Check stream health right now',
      description:
        'Measure the live stream over the next few seconds: dropped, skipped and lagged frames ' +
        '(right now, not since go-live), upload speed versus bitrate, and a diagnosis. Status is ' +
        '"healthy", "degraded" or "offline". When degraded by the network, fix_stream_health ' +
        'can fix it automatically. lastAutomaticFix (when present) is the last bitrate change ' +
        'made by fix_stream_health, with its time and numbers. Right after a fix it waits a few ' +
        'seconds first, so it is the right way to verify a fix worked.',
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () =>
      guard('check_stream_health', async () => {
        const last = readLastFix();
        // Right after a fix, wait out the backlog so a verify reads the new bitrate, not the old.
        const wait = last ? last.atMs + SETTLE_MS - Date.now() : 0;
        if (wait > 0) await sleep(wait);
        const health = await measureHealth(ctx.client);
        if (!last) return ok(health);
        const { atMs, ...fix } = last;
        return ok({
          ...health,
          lastAutomaticFix: { ...fix, secondsAgo: Math.round((Date.now() - atMs) / 1000) },
        });
      }),
  );

  server.registerTool(
    'fix_stream_health',
    {
      title: 'Fix stream health automatically',
      description:
        'When the stream is dropping frames because the connection cannot keep up, lower the ' +
        'live video bitrate to fit what the connection carries (no reconnect). Returns right ' +
        'away; then call check_stream_health to verify it worked. ' +
        'Pass {"restore": true} to put the streamer\'s original bitrate back. Only network ' +
        'problems are fixed automatically; other causes come back as suggestions.',
      inputSchema: {
        restore: z
          .boolean()
          .optional()
          .describe('true = restore the bitrate the streamer had before the automatic fix.'),
        requested_by: requestedBy,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ restore, requested_by }) =>
      guard('fix_stream_health', async () => {
        if (restore) {
          const original = readOriginal();
          if (!original) return fail('There is no saved original bitrate to restore.');
          const decision = await ctx.confirm.gate(requested_by, {
            title: `Restore the stream bitrate to ${original} kbps`,
          });
          if (!decision.approved) return fail(decision.reason);
          await setBitrate(ctx, original);
          writeOriginal(null);
          return ok({ restored: true, bitrateKbps: original });
        }

        const before = await measureHealth(ctx.client);
        if (before.status === 'offline') return fail(before.summary);
        if (before.status === 'healthy') {
          return ok({
            fixed: false,
            reason: 'The stream is healthy right now; nothing to fix.',
            health: brief(before),
          });
        }
        if (before.cause !== 'network') {
          return ok({
            fixed: false,
            reason: `${before.summary} That is not something a bitrate change fixes.`,
            suggestions: before.suggestions,
          });
        }

        const sinceLast = (Date.now() - lastFixAt) / 1000;
        if (sinceLast < MIN_SECONDS_BETWEEN_FIXES) {
          return ok({
            fixed: false,
            reason: `A fix was applied ${Math.round(
              sinceLast,
            )} s ago; give it a moment before changing again.`,
            health: brief(before),
          });
        }

        const current = before.bitrateKbps ?? 0;
        const target =
          before.recommendedBitrateKbps ??
          Math.max(MIN_AUTO_BITRATE, Math.floor((current * 0.6) / 100) * 100);
        if (!current || target >= current) {
          return ok({
            fixed: false,
            reason: `The bitrate is already ${current} kbps, at or below what the connection carries.`,
            suggestions: before.suggestions,
          });
        }

        const decision = await ctx.confirm.gate(requested_by, {
          title: `Lower the live video bitrate from ${current} to ${target} kbps`,
          lines: [before.summary],
        });
        if (!decision.approved) return fail(decision.reason);

        if (readOriginal() === null) writeOriginal(current);
        await setBitrate(ctx, target);
        lastFixAt = Date.now();

        writeLastFix({
          at: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          atMs: lastFixAt,
          fromKbps: current,
          toKbps: target,
          droppedBeforePct: before.droppedPct,
        });

        return ok({
          fixed: true,
          changed: `Live video bitrate ${current} → ${target} kbps (no reconnect).`,
          before: brief(before),
          cause: before.summary,
          next:
            'Call check_stream_health to confirm it worked (it waits for the stream to settle).',
          suggestions: before.suggestions,
          undo: 'fix_stream_health {"restore": true} puts the original bitrate back.',
        });
      }),
  );
}
