/**
 * Read NVIDIA Broadcast's camera effects directly from its local MCP gateway, so tool results
 * can say what is actually on instead of what should be on. Read-only; never changes effects.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/** The gateway port NVIDIA Broadcast publishes (base64 JSON in its app data). */
function gatewayPort(): number | null {
  try {
    const file = path.join(os.homedir(), 'AppData', 'Roaming', 'nvidia-broadcast', 'gateway.json');
    const raw = fs.readFileSync(file, 'utf8').trim();
    return Number(JSON.parse(Buffer.from(raw, 'base64').toString('utf8')).port) || null;
  } catch {
    return null;
  }
}

export interface CameraEffects {
  /** Enabled camera effect ids, e.g. ["background_remove"]. */
  enabled: string[];
  blurStrength?: number;
}

/** The camera effects that are on right now, or null if NVIDIA Broadcast can't be asked. */
export async function nvidiaCameraEffects(timeoutMs = 3000): Promise<CameraEffects | null> {
  const port = gatewayPort();
  if (!port) return null;
  const client = new Client({ name: 'streamlabs-mcp', version: '0' });
  const timer = new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs));
  const read = (async (): Promise<CameraEffects | null> => {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/gateway`)),
    );
    const r = await client.callTool({
      name: 'get_broadcast_state',
      arguments: { effectType: 'camera' },
    });
    const text = ((r.content as Array<{ text?: string }>) ?? []).map(b => b.text ?? '').join('');
    const state = JSON.parse(text) as Record<string, { enabled?: boolean; strength?: number }>;
    const camera = (state.camera ?? state) as Record<
      string,
      { enabled?: boolean; strength?: number }
    >;
    return {
      enabled: Object.entries(camera)
        .filter(([, v]) => v && typeof v === 'object' && v.enabled)
        .map(([k]) => k),
      blurStrength: camera.background_blur?.enabled ? camera.background_blur.strength : undefined,
    };
  })();
  try {
    return await Promise.race([read, timer]);
  } catch {
    return null;
  } finally {
    client.close().catch(() => {});
  }
}

/** What the streamer will see with these effects, in one sentence for the model. */
export function describeCameraEffects(fx: CameraEffects): string {
  const on = new Set(fx.enabled);
  const parts: string[] = [];
  if (on.has('background_remove')) {
    parts.push(
      'Background removal is ON: only people remain (anyone else in the room too), with whatever ' +
        'is behind the webcam (background, pattern, game placeholder) showing through around them.',
    );
  } else if (on.has('background_blur')) {
    const pct = fx.blurStrength !== undefined ? ` at ${Math.round(fx.blurStrength * 100)}%` : '';
    parts.push(`Background blur is ON${pct}: the room shows, softened.`);
  } else if (on.has('background_replace')) {
    parts.push('Background replacement is ON: an image replaces the room behind the streamer.');
  } else {
    parts.push(
      'NO background effect is on: the camera shows the room as normal. If the streamer asked ' +
        'to remove or blur the background, the effect was not applied: do the three steps ' +
        '(set_camera off, nvidia-broadcast set_effects, set_camera "NVIDIA Broadcast").',
    );
  }
  const others = fx.enabled.filter(
    e => !['background_remove', 'background_blur', 'background_replace'].includes(e),
  );
  if (others.length) parts.push(`Also on: ${others.join(', ')}.`);
  return parts.join(' ');
}
