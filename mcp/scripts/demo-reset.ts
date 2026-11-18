/**
 * Put everything back to the demo's starting line:
 *   - NVIDIA Broadcast: camera background effects off
 *   - Streamlabs: a brand-new, empty scene collection, made active
 *
 *   npm run demo:reset
 *
 * Old collections are left alone (switch back from Streamlabs' scene collection menu).
 * Also prints the NVIDIA gateway port, which must match the Hermes demo profile.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { DesktopClient } from '../src/desktop/client.js';

const EXPECTED_NVIDIA_PORT = 18100;

function nvidiaPort(): number | null {
  try {
    const file = path.join(os.homedir(), 'AppData', 'Roaming', 'nvidia-broadcast', 'gateway.json');
    const raw = fs.readFileSync(file, 'utf8').trim();
    return Number(JSON.parse(Buffer.from(raw, 'base64').toString('utf8')).port) || null;
  } catch {
    return null;
  }
}

async function resetNvidia(): Promise<void> {
  const port = nvidiaPort();
  if (!port) {
    console.log('NVIDIA Broadcast: gateway.json not found -- is NVIDIA Broadcast running?');
    return;
  }
  if (port !== EXPECTED_NVIDIA_PORT) {
    console.log(
      `!! NVIDIA gateway is on port ${port}, not ${EXPECTED_NVIDIA_PORT}. ` +
        `Update mcp_servers.nvidia-broadcast.url in the Hermes demo profile.`,
    );
  }
  const client = new Client({ name: 'demo-reset', version: '0' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/gateway`)),
    );
    await client.callTool({
      name: 'set_effects',
      arguments: {
        effects: [
          { effectId: 'background_remove', enabled: false },
          { effectId: 'background_blur', enabled: false },
          { effectId: 'background_replace', enabled: false },
        ],
      },
    });
    console.log(`NVIDIA Broadcast (port ${port}): background effects off.`);
  } catch (e) {
    console.log('NVIDIA Broadcast: reset failed:', e instanceof Error ? e.message : e);
  } finally {
    await client.close().catch(() => {});
  }
}

async function resetStreamlabs(): Promise<void> {
  const client = new DesktopClient();
  try {
    const stamp = new Date().toLocaleTimeString('en-US', { hour12: false }).slice(0, 5);
    const name = `Demo ${stamp}`;
    await client.request('SceneCollectionsService', 'create', [{ name }]);
    const scenes = await client.request<{ scenes: Record<string, { name: string }> }>(
      'ScenesService',
      'state',
    );
    const names = Object.values(scenes?.scenes ?? {}).map(s => s.name);
    console.log(
      `Streamlabs: switched to new empty collection "${name}" (scenes: ${JSON.stringify(names)}).`,
    );
  } catch (e) {
    console.log('Streamlabs: reset failed:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    client.close();
  }
}

// Streamlabs FIRST: the new collection releases any source using the NVIDIA Broadcast camera,
// so the effect reset below happens with the camera released (same order as set_camera).
await resetStreamlabs();
await new Promise(r => setTimeout(r, 2000));
await resetNvidia();
