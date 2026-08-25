/**
 * End-to-end M0 verification: drives the built server as a real MCP client over stdio.
 * Deterministic stand-in for the browser Inspector.
 *
 *   npm run build && npx tsx scripts/e2e.ts
 *
 * Requires Streamlabs Desktop running (ideally the isolated dev instance).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

let failures = 0;

function check(label: string, cond: boolean, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failures++;
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`);
}

function textOf(res: any): string {
  return (res?.content ?? []).map((c: any) => c.text ?? '').join('');
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res: any = await client.callTool({ name, arguments: args });
  const text = textOf(res);
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON (error strings) */
  }
  return { res, text, json, isError: !!res?.isError };
}

async function main() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/index.js'],
    // Keep the server's stderr out of the test output.
    stderr: 'ignore',
  });
  const client = new Client({ name: 'e2e', version: '0.0.0' });
  await client.connect(transport);

  console.log('\n1. tools/list');
  const { tools } = await client.listTools();
  const names = tools.map(t => t.name).sort();
  check('5 tools registered', tools.length === 5, names.join(', '));
  check(
    'reads are annotated readOnlyHint',
    tools.filter(t => t.annotations?.readOnlyHint).length === 2,
  );
  check(
    'every tool has a description',
    tools.every(t => (t.description ?? '').length > 40),
  );

  console.log('\n2. get_stream_state');
  const t0 = Date.now();
  const snap = await call(client, 'get_stream_state', { maxAgeMs: 0 });
  const ms = Date.now() - t0;
  check('returns JSON', !!snap.json, `${ms}ms`);
  check('under 2KB', snap.text.length < 2048, `${snap.text.length} bytes`);
  check('has activeScene.items', Array.isArray(snap.json?.activeScene?.items));
  check('has health.verdict', typeof snap.json?.health?.verdict === 'string', snap.json?.health?.verdict);
  check('has warnings array', Array.isArray(snap.json?.warnings));
  check('items carry pixel rects', snap.json?.activeScene?.items?.every((i: any) => Array.isArray(i.rect) && i.rect.length === 4));
  console.log('    scenes:', JSON.stringify(snap.json?.scenes));
  console.log('    items :', JSON.stringify(snap.json?.activeScene?.items));
  console.log('    audio :', JSON.stringify(snap.json?.audio));
  console.log('    warn  :', JSON.stringify(snap.json?.warnings));

  console.log('\n3. name resolution errors are actionable');
  const miss = await call(client, 'get_scene', { scene: 'No Such Scene' });
  check('miss is an error', miss.isError);
  check('miss lists available names', /Available:/.test(miss.text), miss.text.slice(0, 90));

  console.log('\n4. set_audio round-trip (mute then restore)');
  const audioName = snap.json?.audio?.[0]?.name;
  if (!audioName) {
    check('an audio source exists', false);
  } else {
    const wasMuted = snap.json.audio[0].muted;
    const mute = await call(client, 'set_audio', { source: audioName, muted: !wasMuted });
    check('set_audio succeeded', !mute.isError && mute.json?.updated === true);
    check('echoes resolution', !!mute.json?.resolved?.source, mute.json?.resolved?.source);

    const after = await call(client, 'get_stream_state', { maxAgeMs: 0 });
    const nowMuted = after.json?.audio?.find((a: any) => a.name === audioName)?.muted;
    check('state reflects the change', nowMuted === !wasMuted, `muted=${nowMuted}`);

    await call(client, 'set_audio', { source: audioName, muted: wasMuted });
    const restored = await call(client, 'get_stream_state', { maxAgeMs: 0 });
    check(
      'restored',
      restored.json?.audio?.find((a: any) => a.name === audioName)?.muted === wasMuted,
    );
  }

  console.log('\n5. set_item_visibility round-trip');
  const item = snap.json?.activeScene?.items?.[0];
  if (!item) {
    check('a scene item exists', false);
  } else {
    const hide = await call(client, 'set_item_visibility', { item: item.name, visible: false });
    check('hide succeeded', !hide.isError, hide.text.slice(0, 80));
    const after = await call(client, 'get_stream_state', { maxAgeMs: 0 });
    const nowVis = after.json?.activeScene?.items?.find((i: any) => i.name === item.name)?.visible;
    check('item is hidden', nowVis === false);
    await call(client, 'set_item_visibility', { item: item.name, visible: true });
    const back = await call(client, 'get_stream_state', { maxAgeMs: 0 });
    check(
      'item restored',
      back.json?.activeScene?.items?.find((i: any) => i.name === item.name)?.visible === true,
    );
  }

  console.log('\n6. switch_scene');
  const target = snap.json?.scenes?.[0];
  const sw = await call(client, 'switch_scene', { scene: target });
  check('switch succeeded', !sw.isError && sw.json?.switched === true, sw.text.slice(0, 80));
  check('reports item count', typeof sw.json?.itemCount === 'number');

  console.log('\n7. get_scene detail');
  const detail = await call(client, 'get_scene', {});
  check('returns items', Array.isArray(detail.json?.items), `${detail.json?.items?.length} item(s)`);

  console.log('\n8. events surfaced in snapshot');
  const evSnap = await call(client, 'get_stream_state', { maxAgeMs: 0 });
  const evs = evSnap.json?.newEvents ?? [];
  check('events captured from our own writes', evs.length > 0, `${evs.length} event(s): ` +
    JSON.stringify(evs.slice(0, 4).map((e: any) => e.type)));

  await client.close();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch(e => {
  console.error('e2e harness crashed:', e);
  process.exit(1);
});
