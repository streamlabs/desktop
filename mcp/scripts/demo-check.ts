/**
 * End-to-end check of the demo-mode studio tools against the built server (SLD_MCP_MODE=demo),
 * with no model involved: scenes, restyling, adding to a scene, placement, and the NVIDIA
 * Broadcast camera handoff (including a live-feed check).
 *
 *   npm run demo:reset && npm run build && npm run demo:check
 *
 * Screenshots land in ./demo-check-out/ (gitignored).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const OUT = path.resolve('demo-check-out');
fs.mkdirSync(OUT, { recursive: true });

const sl = new Client({ name: 'demo-check', version: '0' });
await sl.connect(
  new StdioClientTransport({
    command: 'node',
    args: ['dist/index.js'],
    env: { ...process.env, SLD_MCP_MODE: 'demo' } as Record<string, string>,
    stderr: 'ignore',
  }),
);

let failures = 0;
async function call(name: string, args: Record<string, unknown>, c: Client = sl) {
  const t0 = Date.now();
  const r: any = await c.callTool({ name, arguments: args }, undefined, { timeout: 120_000 });
  const text = (r.content ?? []).map((b: any) => b.text ?? '').join('');
  const mark = r.isError ? 'FAIL' : 'ok  ';
  if (r.isError) failures++;
  console.log(`[${mark}] ${name} (${Date.now() - t0}ms)\n${text.slice(0, 900)}\n`);
  return r;
}

async function snap(tag: string) {
  const r: any = await sl.callTool({ name: 'capture_screen', arguments: {} });
  let i = 0;
  for (const b of r.content ?? []) {
    if (b.type === 'image')
      fs.writeFileSync(path.join(OUT, `${tag}-${i++}.jpg`), Buffer.from(b.data, 'base64'));
  }
  console.log(`   screenshot -> ${tag}`);
}

const { tools } = await sl.listTools();
console.log(`demo tools (${tools.length}): ${tools.map(t => t.name).join(', ')}\n`);

// --- Scenes (one without an explicit background: the server adds one)
await call('build_scene', {
  name: 'Intro',
  items: [
    { role: 'text', text: 'Going live shortly' },
    { role: 'webcam', anchor: 'center-left', width_percent: 30 },
  ],
});
await call('build_scene', {
  sceneName: 'Main', // wrong key on purpose: lenient args should map it to `name`
  items: JSON.stringify([
    { role: 'game', game: 'Minecraft' },
    { role: 'webcam', anchor: 'top-right', width_percent: '20' },
  ]),
});
await call('build_scene', {
  name: 'Break',
  items: [
    { role: 'background', color: '#0f172a' },
    { role: 'text', text: 'Back in a moment' },
  ],
});
await call('switch_scene', { scene: 'Intro' });
await snap('1-scenes');

// --- Restyle, add to an existing scene, placement
await call('apply_style', {
  background_color: '#0e7490',
  accent_color: '#fde047',
  text_color: '#ffffff',
  font: 'Segoe UI Black',
  webcam_frame: true,
});
await call('add_to_scene', {
  scene: 'Break',
  items: [{ role: 'text', text: 'Stretch break', size: 'small', anchor: 'bottom-center' }],
});
await call('set_item_transform', { item: 'Webcam', width_percent: 35 });
await call('set_item_transform', { item: 'Webcam', anchor: 'bottom-right', flush: true });
await snap('2-style');

// --- NVIDIA Broadcast camera handoff: release, change effect, attach
const raw = fs.readFileSync(
  path.join(os.homedir(), 'AppData', 'Roaming', 'nvidia-broadcast', 'gateway.json'),
  'utf8',
);
const port = JSON.parse(Buffer.from(raw.trim(), 'base64').toString()).port;
const nv = new Client({ name: 'demo-check', version: '0' });
await nv.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/gateway`)));
await call('set_camera', { device: 'off' });
await call('set_effects', { effects: [{ effectId: 'background_blur', enabled: true }] }, nv);
await call('set_camera', { device: 'NVIDIA Broadcast' });
await new Promise(r => setTimeout(r, 3000));
await snap('3-effect');
// Live-feed check: a live camera makes consecutive screenshots differ.
await new Promise(r => setTimeout(r, 2000));
await snap('3-effect-later');
const same = fs
  .readFileSync(path.join(OUT, '3-effect-0.jpg'))
  .equals(fs.readFileSync(path.join(OUT, '3-effect-later-0.jpg')));
if (same) {
  failures++;
  console.log('[FAIL] webcam feed is not updating (identical screenshots 2s apart)');
} else console.log('[ok  ] webcam feed is live');

await nv.close();
await sl.close();
console.log(failures ? `${failures} FAILURE(S)` : 'ALL OK');
process.exitCode = failures ? 1 : 0;
