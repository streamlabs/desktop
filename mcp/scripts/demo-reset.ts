/**
 * Put everything back to the demo's starting line:
 *   - NVIDIA Broadcast: camera background effects off
 *   - Streamlabs: a brand-new, empty scene collection, made active
 *   - Stream health: the bitrate an automatic fix lowered is put back, any leftover stream
 *     watcher is stopped, and a still-on upload throttle is reported
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
import { execFileSync } from 'node:child_process';
import { DesktopClient } from '../src/desktop/client.js';
import { ORIGINAL_BITRATE_FILE, LAST_FIX_FILE } from '../src/desktop/health.js';

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
        'Update mcp_servers.nvidia-broadcast.url in the Hermes demo profile.',
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
  } catch (e: unknown) {
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
  } catch (e: unknown) {
    console.log('Streamlabs: reset failed:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    client.close();
  }
}

function powershell(command: string): string {
  try {
    return execFileSync('powershell', ['-NoProfile', '-Command', command], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

async function resetStreamHealth(): Promise<void> {
  // The bitrate an automatic fix lowered (fix_stream_health saves the original first).
  const client = new DesktopClient();
  try {
    let original: number | null = null;
    try {
      original = Number(JSON.parse(fs.readFileSync(ORIGINAL_BITRATE_FILE, 'utf8')).bitrate) || null;
    } catch {
      /* no fix since the last restore */
    }
    if (original) {
      await client.request('StreamingService', 'setLiveVideoBitrate', [original]);
      fs.rmSync(ORIGINAL_BITRATE_FILE, { force: true });
      console.log(`Stream health: bitrate restored to ${original} kbps.`);
    } else {
      const s = await client.request<{ streaming?: { bitrate?: number } }>(
        'OutputSettingsService',
        'getSettings',
      );
      console.log(
        `Stream health: bitrate is ${
          s?.streaming?.bitrate ?? '?'
        } kbps (no automatic fix to undo).`,
      );
    }
    fs.rmSync(LAST_FIX_FILE, { force: true });
  } catch (e: unknown) {
    console.log('Stream health: bitrate reset failed:', e instanceof Error ? e.message : e);
  } finally {
    client.close();
  }

  // A watcher left running from an earlier chat would wake that chat, not the new one.
  const stopped = powershell(
    '$p = @(Get-CimInstance Win32_Process -Filter "Name=\'python.exe\'" | ' +
      "Where-Object { $_.CommandLine -like '*stream_health_monitor*--until-degraded*' }); " +
      '$p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; $p.Count',
  );
  if (Number(stopped) > 0) {
    console.log(`Stream health: stopped ${stopped} leftover stream watcher(s).`);
  }

  // The demo's upload throttle (scripts/net-throttle.ps1). Removing it needs admin.
  if (
    powershell('Get-NetQosPolicy -Name StreamUploadThrottle -ErrorAction SilentlyContinue | % Name')
  ) {
    console.log(
      '!! Upload throttle is still ON. From an admin PowerShell in mcpscripts: ' +
        'powershell -ExecutionPolicy Bypass -File .\net-throttle.ps1 -Off',
    );
  }
}

// Streamlabs FIRST: the new collection releases any source using the NVIDIA Broadcast camera,
// so the effect reset below happens with the camera released (same order as set_camera).
await resetStreamlabs();
await new Promise(r => setTimeout(r, 2000));
await resetNvidia();
await resetStreamHealth();
