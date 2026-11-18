/**
 * Give NVIDIA Broadcast and Hermes a clean start.
 *
 *   1. Quit Streamlabs completely.
 *   2. npm run demo:prep          <- this script
 *   3. Start Streamlabs, wait until it has loaded.
 *   4. npm run demo:reset
 *   5. Hermes desktop: profile "sldemo", new chat.
 *
 * Why: starting both apps fresh, in this order, gives a clean camera pipeline for the session.
 */
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const LAUNCHER =
  'C:\\Program Files\\NVIDIA Corporation\\NVIDIA Broadcast\\skills\\nvidia-broadcast\\scripts\\launch_broadcast.ps1';
const HERMES = path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'bin', 'hermes.exe');

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function ps(command: string): string {
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-Command', command], {
      encoding: 'utf8',
    });
  } catch (e: any) {
    return String(e?.stdout ?? '');
  }
}

async function gatewayCameraActive(): Promise<boolean> {
  const client = new Client({ name: 'demo-prep', version: '0' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('http://127.0.0.1:18100/gateway')),
    );
    const r: any = await client.callTool({ name: 'list_devices', arguments: { kind: 'camera' } });
    return (
      JSON.stringify(r).includes('"active\\":true') || JSON.stringify(r).includes('"active":true')
    );
  } catch {
    return false;
  } finally {
    await client.close().catch(() => {});
  }
}

async function restartBroadcast(): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`NVIDIA Broadcast: restart attempt ${attempt}`);
    ps("Stop-Process -Name 'NVIDIA Broadcast' -Force -ErrorAction SilentlyContinue");
    await sleep(6000);
    try {
      execFileSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', LAUNCHER],
        {
          stdio: 'ignore',
          timeout: 90_000,
        },
      );
    } catch {
      /* the launcher's exit code is not meaningful; the gateway check below is */
    }
    for (let i = 0; i < 40; i++) {
      if (await gatewayCameraActive()) {
        console.log('NVIDIA Broadcast: gateway up on 18100, camera active.');
        return true;
      }
      await sleep(4000);
    }
  }
  return false;
}

const running = ps(
  '(Get-Process obs64 -ErrorAction SilentlyContinue | Measure-Object).Count',
).trim();
if (running !== '0') {
  console.log('!! Streamlabs (obs64) is still running. Quit it fully first, then rerun this.');
  process.exit(1);
}

if (!(await restartBroadcast())) {
  console.log(
    '!! NVIDIA Broadcast gateway did not come up. Start NVIDIA Broadcast manually and check it.',
  );
  process.exit(1);
}

try {
  execFileSync(HERMES, ['gateway', 'restart'], { stdio: 'ignore', timeout: 60_000 });
  console.log('Hermes gateway restarted.');
} catch {
  console.log('!! Hermes gateway restart failed; run: hermes gateway restart');
}

console.log('\nNext: start Streamlabs, wait for it to load, then: npm run demo:reset');
