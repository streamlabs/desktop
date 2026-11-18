/**
 * Stream health measured over a short window, not since go-live.
 *
 * PerformanceService's percentages are cumulative for the whole stream, so a problem that was
 * fixed minutes ago still reads as "8% dropped". Comparing the raw frame counters across a few
 * seconds gives what is happening now, which is what a watcher needs to see both a problem and
 * its recovery.
 */

import os from 'node:os';
import path from 'node:path';
import { DesktopClient } from './client.js';

/** The streamer's own bitrate, saved before the first automatic fix (survives restarts). */
export const ORIGINAL_BITRATE_FILE = path.join(os.tmpdir(), 'sld-mcp-original-bitrate.json');
/** The last automatic fix, so a chat can answer "what did you change?" with real numbers. */
export const LAST_FIX_FILE = path.join(os.tmpdir(), 'sld-mcp-last-health-fix.json');

interface PerfState {
  numberDroppedFrames: number;
  numberSkippedFrames: number;
  numberLaggedFrames: number;
  numberEncodedFrames: number;
  numberRenderedFrames: number;
  streamingBandwidth: number | null;
  CPU: number;
}

export type HealthStatus = 'offline' | 'healthy' | 'degraded';
export type HealthCause = 'network' | 'encoder' | 'rendering';

export interface HealthReport {
  status: HealthStatus;
  /** Over the measurement window, percent of frames. */
  droppedPct: number;
  skippedPct: number;
  laggedPct: number;
  /** What the connection actually carried during the window (video + audio). */
  uploadKbps: number | null;
  /** The configured video bitrate. */
  bitrateKbps: number | null;
  cpu: number;
  windowSeconds: number;
  cause: HealthCause | null;
  summary: string;
  /** The automatic fix, when there is a safe one (network only). */
  recommendedBitrateKbps: number | null;
  /** Fixes worth suggesting that are not applied automatically. */
  suggestions: string[];
}

/** Above this share of frames lost in the window, the stream counts as degraded. */
const DEGRADED_PCT = 2;
/** Floor for the automatic bitrate fix: below this, video quality falls apart. */
export const MIN_AUTO_BITRATE = 1000;
/** Rough audio share of the upload (Streamlabs' default audio bitrate is 160 kbps). */
const AUDIO_KBPS = 160;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const pct = (n: number, d: number) => (d > 0 ? Math.round((1000 * n) / d) / 10 : 0);

async function bitrate(client: DesktopClient): Promise<number | null> {
  try {
    const s = await client.request<{ streaming?: { bitrate?: number } }>(
      'OutputSettingsService',
      'getSettings',
    );
    return typeof s?.streaming?.bitrate === 'number' ? s.streaming.bitrate : null;
  } catch {
    return null;
  }
}

export async function measureHealth(client: DesktopClient, windowMs = 6000): Promise<HealthReport> {
  const status = await client.request<{ streamingStatus?: string }>('StreamingService', 'state');
  const live = status?.streamingStatus === 'live' || status?.streamingStatus === 'reconnecting';
  const bitrateKbps = await bitrate(client);

  if (!live) {
    return {
      status: 'offline',
      droppedPct: 0,
      skippedPct: 0,
      laggedPct: 0,
      uploadKbps: null,
      bitrateKbps,
      cpu: 0,
      windowSeconds: 0,
      cause: null,
      summary: 'Not live, so there is no stream health to measure.',
      recommendedBitrateKbps: null,
      suggestions: [],
    };
  }

  const a = await client.request<PerfState>('PerformanceService', 'state');
  await sleep(windowMs);
  const b = await client.request<PerfState>('PerformanceService', 'state');

  const encoded = b.numberEncodedFrames - a.numberEncodedFrames;
  const dropped = Math.max(0, b.numberDroppedFrames - a.numberDroppedFrames);
  const skipped = Math.max(0, b.numberSkippedFrames - a.numberSkippedFrames);
  const rendered = b.numberRenderedFrames - a.numberRenderedFrames;
  const lagged = Math.max(0, b.numberLaggedFrames - a.numberLaggedFrames);

  const droppedPct = pct(dropped, encoded + dropped);
  const skippedPct = pct(skipped, encoded + skipped);
  const laggedPct = pct(lagged, rendered + lagged);
  const bw = [a.streamingBandwidth, b.streamingBandwidth].filter(
    (v): v is number => typeof v === 'number' && v > 0,
  );
  const uploadKbps = bw.length ? Math.round(bw.reduce((s, v) => s + v, 0) / bw.length) : null;

  let cause: HealthCause | null = null;
  if (droppedPct > DEGRADED_PCT) cause = 'network';
  else if (skippedPct > DEGRADED_PCT) cause = 'encoder';
  else if (laggedPct > DEGRADED_PCT) cause = 'rendering';

  let recommendedBitrateKbps: number | null = null;
  const suggestions: string[] = [];
  let summary = `Healthy: ${droppedPct}% dropped, ${skippedPct}% skipped over the last ${Math.round(
    windowMs / 1000,
  )} s.`;

  if (cause === 'network') {
    // Fit the video under what the connection is actually carrying, with headroom.
    const fit = uploadKbps ? Math.floor(((uploadKbps - AUDIO_KBPS) * 0.8) / 100) * 100 : null;
    if (fit && bitrateKbps && fit < bitrateKbps) {
      recommendedBitrateKbps = Math.max(MIN_AUTO_BITRATE, fit);
    }
    summary =
      `Dropping ${droppedPct}% of frames over the last ${Math.round(windowMs / 1000)} s: the ` +
      `connection is carrying about ${uploadKbps ?? '?'} kbps but the stream is set to ` +
      `${bitrateKbps ?? '?'} kbps of video, so frames are being dropped before they can be sent.`;
    suggestions.push(
      'Turn on Dynamic Bitrate (Settings > Advanced) so the stream adapts by itself next time.',
    );
    suggestions.push('Use a wired connection, or pause uploads and downloads on the same network.');
  } else if (cause === 'encoder') {
    summary = `The encoder is overloaded: ${skippedPct}% of frames skipped over the last ${Math.round(
      windowMs / 1000,
    )} s.`;
    suggestions.push('Switch to a hardware encoder or a faster encoder preset.');
    suggestions.push('Lower the output resolution or frame rate.');
  } else if (cause === 'rendering') {
    summary = `Rendering is lagging: ${laggedPct}% of frames late over the last ${Math.round(
      windowMs / 1000,
    )} s.`;
    suggestions.push('Close GPU-heavy apps, or hide heavy sources (browser sources, effects).');
  }

  return {
    status: cause ? 'degraded' : 'healthy',
    droppedPct,
    skippedPct,
    laggedPct,
    uploadKbps,
    bitrateKbps,
    cpu: Math.round(b.CPU * 10) / 10,
    windowSeconds: Math.round(windowMs / 1000),
    cause,
    summary,
    recommendedBitrateKbps,
    suggestions,
  };
}
