/**
 * Event ring buffer.
 *
 * An MCP server CANNOT interrupt a model mid-turn. notifications/resources/updated
 * invalidates a cached resource; it does not start a turn. Sampling isn't supported by
 * the Anthropic clients. So: buffer server-side and let the agent poll.
 *
 * The important consumption path is get_stream_state folding in `newEvents` -- the agent
 * gets deltas for free on a call it was already making, with no extra prompting.
 */

import { DesktopClient } from './client.js';
import { log } from '../log.js';
import { IEventEnvelope } from './types.js';

const RING_SIZE = 300;
/** itemUpdated fires per-item on every drag release; without this it floods. */
const MAX_PER_SUBJECT = 3;

export interface BufferedEvent {
  seq: number;
  at: string;
  type: string;
  subject?: string;
  data?: unknown;
}

/**
 * An observable only starts emitting once the property is *called as a method*
 * (rpc-api.ts creates the subscription lazily in serializePayload).
 */
const SUBSCRIPTIONS: Array<[string, string]> = [
  ['ScenesService', 'sceneSwitched'],
  ['ScenesService', 'sceneAdded'],
  ['ScenesService', 'sceneRemoved'],
  ['ScenesService', 'itemAdded'],
  ['ScenesService', 'itemRemoved'],
  ['ScenesService', 'itemUpdated'],
  ['SourcesService', 'sourceAdded'],
  ['SourcesService', 'sourceRemoved'],
  ['SourcesService', 'sourceUpdated'],
  ['StreamingService', 'streamingStatusChange'],
  ['StreamingService', 'recordingStatusChange'],
  ['StreamingService', 'replayBufferStatusChange'],
  ['StreamingService', 'streamErrorCreated'],
  ['SceneCollectionsService', 'collectionSwitched'],
  ['SceneCollectionsService', 'collectionUpdated'],
  ['TransitionsService', 'studioModeChanged'],
  // The app's own troubleshooter already pushes throttled dropped/lagged/CPU warnings.
  ['NotificationsService', 'notificationPushed'],
];

/** Keep payloads tiny -- these land in the model's context. */
function summarize(resourceId: string, data: unknown): { subject?: string; data?: unknown } {
  if (data === null || data === undefined) return {};

  if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
    return { data };
  }

  const d = data as Record<string, unknown>;
  const subject =
    (typeof d.name === 'string' && d.name) ||
    (typeof d.sceneName === 'string' && d.sceneName) ||
    (typeof d.id === 'string' && d.id) ||
    (typeof d.sceneId === 'string' && d.sceneId) ||
    undefined;

  if (resourceId.endsWith('notificationPushed')) {
    return {
      subject: typeof d.subType === 'string' ? d.subType : undefined,
      data: { type: d.type, message: d.message },
    };
  }
  if (resourceId.endsWith('itemUpdated')) {
    return { subject: subject as string | undefined, data: { visible: d.visible } };
  }
  if (resourceId.endsWith('streamErrorCreated')) {
    return { data: { message: d.message ?? String(data) } };
  }
  return { subject: subject as string | undefined };
}

export class EventBuffer {
  private ring: BufferedEvent[] = [];
  private seq = 0;
  private lastDrained = 0;

  constructor(private client: DesktopClient) {
    client.onEvent(e => this.push(e));
    // Subscriptions are process-global in RpcApi and never torn down, so
    // re-subscribing after a reconnect is a harmless no-op.
    client.onReconnect(() => {
      this.pushSynthetic('reconnected', 'Reconnected to Streamlabs — earlier state may be stale.');
      void this.subscribeAll();
    });
  }

  async subscribeAll(): Promise<void> {
    let ok = 0;
    for (const [resource, observable] of SUBSCRIPTIONS) {
      try {
        await this.client.subscribe(resource, observable);
        ok++;
      } catch (e) {
        log(`subscribe ${resource}.${observable} failed`, e);
      }
    }
    log(`subscribed to ${ok}/${SUBSCRIPTIONS.length} observables`);
  }

  private push(e: IEventEnvelope): void {
    // listenAllSubscriptions means we also see events from OTHER clients'
    // subscriptions (a Stream Deck plugin, say). Only keep what we asked for.
    const [resource, observable] = e.resourceId.split('.');
    if (!SUBSCRIPTIONS.some(([r, o]) => r === resource && o === observable)) return;

    const { subject, data } = summarize(e.resourceId, e.data);
    const entry: BufferedEvent = {
      seq: ++this.seq,
      at: new Date().toISOString(),
      type: observable,
      ...(subject ? { subject } : {}),
      ...(data !== undefined ? { data } : {}),
    };

    // Coalesce: keep at most the last N of any (type, subject) pair.
    const sameKey = this.ring.filter(x => x.type === entry.type && x.subject === entry.subject);
    if (sameKey.length >= MAX_PER_SUBJECT) {
      const oldest = sameKey[0];
      this.ring = this.ring.filter(x => x !== oldest);
    }

    this.ring.push(entry);
    if (this.ring.length > RING_SIZE) this.ring.shift();
  }

  private pushSynthetic(type: string, message: string): void {
    this.ring.push({
      seq: ++this.seq,
      at: new Date().toISOString(),
      type,
      data: { message },
    });
    if (this.ring.length > RING_SIZE) this.ring.shift();
  }

  /** Everything since the last drain. Advances the cursor. */
  drain(): BufferedEvent[] {
    const out = this.ring.filter(e => e.seq > this.lastDrained);
    if (out.length) this.lastDrained = out[out.length - 1].seq;
    return out;
  }

  /** Look back without moving the drain cursor. */
  recent(opts: { limit?: number; types?: string[]; includeItemUpdated?: boolean } = {}): BufferedEvent[] {
    const limit = opts.limit ?? 50;
    let list = this.ring;
    if (opts.types?.length) {
      const want = new Set(opts.types);
      list = list.filter(e => want.has(e.type));
    } else if (!opts.includeItemUpdated) {
      list = list.filter(e => e.type !== 'itemUpdated');
    }
    return list.slice(-limit);
  }
}
