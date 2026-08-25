/**
 * get_stream_state -- the agent's world model, rebuilt each turn.
 *
 * Budget: <=2 KB of JSON, ~6 RPC round-trips cold / ~4 warm, ZERO rate-limit points.
 *
 * The rate limit (MAX_POINTS_PER_SECOND = 2, external-api-limits.ts) only applies to
 * @Expensive methods, of which there are exactly two: ScenesService.getScenes and
 * SceneCollectionsService.fetchSceneCollectionsSchema. This snapshot calls NEITHER --
 * `activeScene` is a getter that returns the whole active scene (nodes, transforms and
 * per-item resourceIds) in one free call, and `getSceneNames` is the free list.
 *
 * RULE: never call getScenes() from a hot path.
 */

import { DesktopClient } from './client.js';
import { Resolver, SourceRef } from './resolver.js';
import { EventBuffer, BufferedEvent } from './events.js';
import {
  IAudioSourceModel,
  IPerformanceStateModel,
  ISceneItemModel,
  IStreamingStateModel,
  isHelper,
} from './types.js';

export type StreamQuality = 'GOOD' | 'FAIR' | 'POOR';

export interface ItemSummary {
  name: string;
  type: string;
  visible: boolean;
  /** [x, y, w, h] in canvas pixels -- a textual rendering of the layout. */
  rect: [number, number, number, number];
  rotation?: number;
  locked?: boolean;
}

export interface Snapshot {
  connected: true;
  canvas: [number, number];
  stream: {
    status: string;
    for?: string;
    recording: string;
    replayBuffer: string;
    platforms?: string[];
    title?: string;
    game?: string;
  };
  health: {
    cpu: number;
    fps: number;
    droppedPct: number;
    skippedPct: number;
    laggedPct: number;
    bandwidthKbps: number | null;
    verdict: StreamQuality;
  };
  scenes: string[];
  activeScene: { name: string; items: ItemSummary[] };
  audio: Array<{ name: string; muted: boolean; volume: number; db?: number }>;
  newEvents?: BufferedEvent[];
  warnings: string[];
}

interface ActiveSceneEnvelope {
  id: string;
  name: string;
  nodes?: Array<ISceneItemModel & { resourceId?: string; sceneNodeType?: string }>;
}

interface BaseResolutions {
  horizontal?: { baseWidth: number; baseHeight: number };
}

/** Ported from PerformanceServiceViews.streamQuality (app/services/performance.ts:90-106). */
export function streamQuality(p: Partial<IPerformanceStateModel>): StreamQuality {
  const d = p.percentageDroppedFrames ?? 0;
  const l = p.percentageLaggedFrames ?? 0;
  const s = p.percentageSkippedFrames ?? 0;
  if (d > 50 || l > 50 || s > 50) return 'POOR';
  if (d > 30 || l > 30 || s > 30) return 'FAIR';
  return 'GOOD';
}

const round = (n: number) => Math.round(n * 100) / 100;

function itemRect(item: ISceneItemModel, source?: SourceRef): [number, number, number, number] {
  const t = item.transform;
  const crop = t?.crop ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const srcW = source?.width ?? 0;
  const srcH = source?.height ?? 0;
  const w = Math.max(0, srcW - crop.left - crop.right) * (t?.scale?.x ?? 1);
  const h = Math.max(0, srcH - crop.top - crop.bottom) * (t?.scale?.y ?? 1);
  return [
    Math.round(t?.position?.x ?? 0),
    Math.round(t?.position?.y ?? 0),
    Math.round(w),
    Math.round(h),
  ];
}

export class SnapshotBuilder {
  private canvasCache: { at: number; canvas: [number, number] } | null = null;
  private cache: { at: number; snap: Snapshot } | null = null;

  constructor(
    private client: DesktopClient,
    private resolver: Resolver,
    private events: EventBuffer,
  ) {}

  private async canvas(): Promise<[number, number]> {
    // Canvas size changes almost never; a long cache is fine.
    if (this.canvasCache && Date.now() - this.canvasCache.at < 300_000) {
      return this.canvasCache.canvas;
    }
    try {
      const res = await this.client.request<BaseResolutions>(
        'VideoSettingsService',
        'baseResolutions',
      );
      const c: [number, number] = [res?.horizontal?.baseWidth ?? 1920, res?.horizontal?.baseHeight ?? 1080];
      this.canvasCache = { at: Date.now(), canvas: c };
      return c;
    } catch {
      return [1920, 1080];
    }
  }

  /**
   * @param maxAgeMs serve from cache if the last snapshot is younger than this.
   *                 Stops a chatty model hammering the pipe.
   */
  async build(opts: { maxAgeMs?: number; include?: string[] } = {}): Promise<Snapshot> {
    const maxAge = opts.maxAgeMs ?? 750;
    if (this.cache && Date.now() - this.cache.at < maxAge) {
      // Still drain events so nothing is lost to a cache hit.
      const fresh = this.events.drain();
      if (fresh.length) {
        this.cache.snap.newEvents = [...(this.cache.snap.newEvents ?? []), ...fresh];
      }
      return this.cache.snap;
    }

    const [canvas, active, sceneNames, sources, audioRaw, streaming, perf] = await Promise.all([
      this.canvas(),
      this.client.request<ActiveSceneEnvelope>('ScenesService', 'activeScene'),
      this.client.request<string[]>('ScenesService', 'getSceneNames'),
      this.resolver.sources(),
      this.client.request<unknown[]>('AudioService', 'getSourcesForCurrentScene'),
      this.client.request<IStreamingStateModel>('StreamingService', 'state'),
      this.client.request<IPerformanceStateModel>('PerformanceService', 'state'),
    ]);

    const byId = new Map(sources.map(s => [s.sourceId, s]));

    const items: ItemSummary[] = (active?.nodes ?? [])
      .filter(n => n.sceneNodeType !== 'folder')
      .map(n => {
        const src = byId.get(n.sourceId);
        const s: ItemSummary = {
          name: n.name ?? src?.name ?? '(unnamed)',
          type: src?.type ?? 'unknown',
          visible: !!n.visible,
          rect: itemRect(n, src),
        };
        if (n.transform?.rotation) s.rotation = n.transform.rotation;
        if (n.locked) s.locked = true;
        return s;
      });

    const audio = (audioRaw ?? []).filter(isHelper).map(h => {
      const m = h as unknown as IAudioSourceModel;
      return {
        name: String(m.name ?? ''),
        muted: !!m.muted,
        volume: round(m.fader?.deflection ?? 0),
        ...(m.fader?.db !== undefined ? { db: round(m.fader.db) } : {}),
      };
    });

    const platforms = Object.entries(streaming?.info?.settings?.platforms ?? {})
      .filter(([, v]) => v?.enabled)
      .map(([k]) => k);
    const firstPlatform = Object.values(streaming?.info?.settings?.platforms ?? {}).find(
      p => p?.enabled,
    );

    const snap: Snapshot = {
      connected: true,
      canvas,
      stream: {
        status: streaming?.streamingStatus ?? 'unknown',
        ...(streaming?.streamingStatusTime ? { for: streaming.streamingStatusTime } : {}),
        recording: streaming?.recordingStatus ?? 'unknown',
        replayBuffer: streaming?.replayBufferStatus ?? 'unknown',
        ...(platforms.length ? { platforms } : {}),
        ...(firstPlatform?.title ? { title: firstPlatform.title } : {}),
        ...(firstPlatform?.game ? { game: firstPlatform.game } : {}),
      },
      health: {
        cpu: round(perf?.CPU ?? 0),
        fps: round(perf?.frameRate ?? 0),
        droppedPct: round(perf?.percentageDroppedFrames ?? 0),
        skippedPct: round(perf?.percentageSkippedFrames ?? 0),
        laggedPct: round(perf?.percentageLaggedFrames ?? 0),
        bandwidthKbps: perf?.streamingBandwidth ?? null,
        verdict: streamQuality(perf ?? {}),
      },
      scenes: sceneNames ?? [],
      activeScene: { name: active?.name ?? '(none)', items },
      audio,
      warnings: [],
    };

    snap.warnings = buildWarnings(snap, byId, active?.nodes ?? []);

    const fresh = this.events.drain();
    if (fresh.length) snap.newEvents = fresh;

    this.cache = { at: Date.now(), snap };
    return snap;
  }

  invalidate(): void {
    this.cache = null;
  }
}

/**
 * Cheap heuristics for the things a human would catch by looking. The agent is blind,
 * so this is where a lot of the "director" value actually lives -- and it costs nothing.
 */
function buildWarnings(
  snap: Snapshot,
  byId: Map<string, SourceRef>,
  nodes: Array<ISceneItemModel & { sceneNodeType?: string }>,
): string[] {
  const w: string[] = [];
  const live = snap.stream.status === 'live';
  const [cw, ch] = snap.canvas;

  if (live && snap.stream.recording !== 'recording') {
    w.push('Live but not recording — no local VOD will be saved.');
  }
  if (live && snap.health.verdict !== 'GOOD') {
    w.push(
      `Stream quality is ${snap.health.verdict} (dropped ${snap.health.droppedPct}%, ` +
        `skipped ${snap.health.skippedPct}%, lagged ${snap.health.laggedPct}%).`,
    );
  }

  const mic = snap.audio.find(a => /mic|aux/i.test(a.name));
  if (live && mic?.muted) w.push(`"${mic.name}" is muted while live.`);

  const visible = snap.activeScene.items.filter(i => i.visible);
  if (snap.activeScene.items.length === 0) {
    w.push(`Active scene "${snap.activeScene.name}" is empty — it will render as black.`);
  } else if (visible.length === 0) {
    w.push(`Every item in "${snap.activeScene.name}" is hidden — it will render as black.`);
  }

  for (const item of visible) {
    const [x, y, iw, ih] = item.rect;
    if (iw === 0 || ih === 0) {
      w.push(`"${item.name}" has zero size — the capture may be dead or not yet started.`);
      continue;
    }
    if (x + iw <= 0 || y + ih <= 0 || x >= cw || y >= ch) {
      w.push(`"${item.name}" is entirely off-canvas at [${x}, ${y}, ${iw}, ${ih}].`);
    }
  }

  for (const n of nodes) {
    if (n.sceneNodeType === 'folder') continue;
    const src = byId.get(n.sourceId);
    if (!src) w.push(`Scene item "${n.name ?? n.sourceId}" points at a missing source.`);
  }

  return w;
}
