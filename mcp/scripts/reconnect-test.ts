/**
 * Verifies the MCP server survives Streamlabs restarting underneath it.
 *
 * This exercises client fix #4 (memoized connect + fail-all-in-flight). The ported
 * test helper would hang forever here: it never rejects in-flight requests on close
 * and its resolve/reject closures go stale after the first connect.
 *
 *   npx tsx scripts/reconnect-test.ts
 *
 * Kills and relaunches the ISOLATED dev instance (SLOBS_CACHE_DIR=.sld-mcp-cache).
 * Never touches %APPDATA%\slobs-client.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, execSync } from 'node:child_process';
import * as net from 'node:net';

const REPO = 'C:/Users/acree/code/desktop';
const CACHE = `${REPO}/.sld-mcp-cache`;

let failures = 0;
const check = (label: string, cond: boolean, detail = '') => {
  if (!cond) failures++;
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function apiUp(): Promise<boolean> {
  return new Promise(resolve => {
    const s = net.createConnection(28194, '127.0.0.1');
    const done = (v: boolean) => {
      s.destroy();
      resolve(v);
    };
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
    setTimeout(() => done(false), 1000);
  });
}

async function waitFor(want: boolean, label: string, maxSec = 90): Promise<boolean> {
  for (let i = 0; i < maxSec; i++) {
    if ((await apiUp()) === want) return true;
    await sleep(1000);
  }
  console.log(`    (timed out waiting for ${label})`);
  return false;
}

function launchApp() {
  const child = spawn(`${REPO}/node_modules/.bin/electron.cmd`, ['.'], {
    cwd: REPO,
    env: { ...process.env, SLOBS_CACHE_DIR: CACHE },
    detached: true,
    stdio: 'ignore',
    shell: true,
  });
  child.unref();
}

function killApp() {
  try {
    execSync('taskkill /IM electron.exe /F', { stdio: 'ignore' });
  } catch {
    /* already gone */
  }
}

async function callState(client: Client) {
  const res: any = await client.callTool({ name: 'get_stream_state', arguments: { maxAgeMs: 0 } });
  const text = (res?.content ?? []).map((c: any) => c.text ?? '').join('');
  return { isError: !!res?.isError, text };
}

async function main() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/index.js'],
    stderr: 'ignore',
  });
  const client = new Client({ name: 'reconnect-test', version: '0.0.0' });
  await client.connect(transport);

  console.log('\n1. baseline (app running)');
  if (!(await waitFor(true, 'app up'))) {
    console.log('    app not running; launching');
    launchApp();
    await waitFor(true, 'app up');
  }
  const before = await callState(client);
  check('tool works', !before.isError, `${before.text.length} bytes`);

  console.log('\n2. kill Streamlabs, MCP server stays up');
  killApp();
  await waitFor(false, 'app down', 30);
  const during = await callState(client);
  check('tool returns an error rather than hanging', during.isError);
  check(
    'error is human-readable advice',
    /doesn't appear to be running/i.test(during.text),
    during.text.slice(0, 90),
  );

  console.log('\n3. relaunch Streamlabs, same MCP server reconnects');
  launchApp();
  if (!(await waitFor(true, 'app back up'))) {
    check('app came back', false);
  } else {
    await sleep(4000); // let the scene collection finish loading
    let after = await callState(client);
    if (after.isError) {
      await sleep(5000);
      after = await callState(client);
    }
    check('tool works again without restarting the MCP server', !after.isError, after.text.slice(0, 80));

    const json = after.isError ? null : JSON.parse(after.text);
    const reconnected = (json?.newEvents ?? []).some((e: any) => e.type === 'reconnected');
    check('a "reconnected" marker warns the model its world model was stale', reconnected);
  }

  await client.close();
  console.log(`\n${failures === 0 ? 'RECONNECT TEST PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch(e => {
  console.error('crashed:', e);
  process.exit(1);
});
