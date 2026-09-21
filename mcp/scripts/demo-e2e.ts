/**
 * Phase 1 verification: drives the built server as a real MCP client over the demo arc.
 *
 *   npm run build && npm run mcp_demo
 *
 * Phase A (tools/list) runs without Streamlabs. Everything after it needs the app running,
 * ideally the isolated dev instance:
 *   SLOBS_CACHE_DIR="<repo>/.sld-mcp-cache" ./node_modules/.bin/electron .
 *
 * This client does NOT declare the elicitation capability, which is deliberate: it lets us
 * assert that an agent-initiated write is refused rather than silently executed. Actions the
 * script actually wants to perform pass requested_by: 'user'.
 *
 * Pass --no-write to run reads only.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const WRITES = !process.argv.includes('--no-write');

let failures = 0;
let checks = 0;

function check(label: string, cond: boolean, detail = '') {
  checks++;
  if (!cond) failures++;
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
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
    /* error strings are not JSON */
  }
  return { text, json, isError: !!res?.isError };
}

async function main() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/index.js'],
    stderr: 'ignore',
  });
  const client = new Client({ name: 'demo-e2e', version: '0.0.0' });
  await client.connect(transport);

  // ---------------------------------------------------------------- A. surface
  console.log('\nA. tools/list  (no Streamlabs required)');
  const { tools } = await client.listTools();
  const names = tools.map(t => t.name).sort();
  console.log(`    ${tools.length} tools: ${names.join(', ')}`);

  const expect = [
    'add_filter', 'add_source', 'create_scene', 'duplicate_scene',
    'get_health', 'get_scene', 'get_source_settings', 'get_stream_state', 'go_live',
    'group_items', 'list_source_types', 'preflight_check', 'remove_filter', 'remove_item',
    'remove_scene', 'remove_source', 'rename_scene', 'reorder_item', 'save_replay',
    'set_audio', 'set_item_transform', 'set_item_visibility', 'set_recording',
    'set_source_settings', 'stop_stream', 'switch_scene', 'undo_last_edit',
  ];
  const missing = expect.filter(n => !names.includes(n));
  check('all expected tools registered', missing.length === 0, missing.join(', ') || 'none missing');
  check(
    'every tool has a substantial description',
    tools.every(t => (t.description ?? '').length > 60),
  );

  const reads = tools.filter(t => t.annotations?.readOnlyHint);
  check('reads annotated readOnlyHint', reads.length >= 6, `${reads.length} read tools`);

  const destructive = tools.filter(t => t.annotations?.destructiveHint);
  check(
    'deletions annotated destructiveHint',
    ['remove_source', 'remove_item', 'remove_scene'].every(n =>
      destructive.some(t => t.name === n),
    ),
    destructive.map(t => t.name).join(', '),
  );

  const writesWithProvenance = tools.filter(
    t => !t.annotations?.readOnlyHint && (t.inputSchema as any)?.properties?.requested_by,
  );
  const writeTools = tools.filter(t => !t.annotations?.readOnlyHint);
  check(
    'every write tool takes requested_by',
    writesWithProvenance.length === writeTools.length,
    `${writesWithProvenance.length}/${writeTools.length}`,
  );

  // ---------------------------------------------------------------- B. reads
  console.log('\nB. state reads');
  const snap = await call(client, 'get_stream_state', { maxAgeMs: 0 });
  if (snap.isError) {
    console.log(`\n  Streamlabs not reachable — stopping after the surface checks.`);
    console.log(`  ${snap.text.slice(0, 160)}\n`);
    await client.close();
    console.log(`${failures === 0 ? 'SURFACE CHECKS PASSED' : `${failures}/${checks} FAILED`}\n`);
    process.exitCode = failures === 0 ? 0 : 1;
    return;
  }

  check('snapshot returns JSON', !!snap.json);

  const health = await call(client, 'get_health');
  check('get_health is compact', !health.isError && health.text.length < 900, `${health.text.length} bytes`);

  const types = await call(client, 'list_source_types');
  check('source types enumerated', (types.json?.sourceTypes?.length ?? 0) > 3,
    `${types.json?.sourceTypes?.length} types`);

  const scene = await call(client, 'get_scene', {});
  check('get_scene returns items + canvas', Array.isArray(scene.json?.items) && !!scene.json?.canvas,
    `${scene.json?.items?.length} item(s) on ${scene.json?.canvas?.join('x')}`);

  const preflight = await call(client, 'preflight_check');
  check('preflight returns a verdict', typeof preflight.json?.ready === 'boolean',
    `ready=${preflight.json?.ready}, ${preflight.json?.problems?.length ?? 0} problem(s)`);

  console.log('\nC. name resolution is self-correcting');
  const miss = await call(client, 'get_scene', { scene: 'No Such Scene' });
  check('unknown name errors', miss.isError);
  check('error lists the available names', /Available:/.test(miss.text), miss.text.slice(0, 80));

  // ------------------------------------------------------- D. provenance gate
  console.log('\nD. confirmation gate');
  // Must be a uniquely-named, visible, unlocked item: a duplicate name would fail on
  // resolution and give a FALSE PASS on "was it refused?".
  const allItems: any[] = scene.json?.items ?? [];
  const nameCounts = new Map<string, number>();
  for (const i of allItems) nameCounts.set(i.name, (nameCounts.get(i.name) ?? 0) + 1);
  const subject = allItems.find(i => i.visible && !i.locked && i.rect?.[2] > 0);
  // Duplicate names are normal (dual output alone puts a horizontal and a vertical copy of
  // every node in one scene), so address by the id get_scene emits for ambiguous names.
  const handle = subject && (nameCounts.get(subject.name) === 1 ? subject.name : subject.id);
  const dupes = allItems.filter(i => (nameCounts.get(i.name) ?? 0) > 1).length;
  if (dupes) console.log(`    ${dupes}/${allItems.length} items share a name — addressing by id`);

  const byName = (items: any[], s: any) =>
    items.find((i: any) => (s.id ? i.id === s.id : i.name === s.name));

  if (!subject || !handle) {
    check('a visible unlocked item exists to test against', false,
      `${allItems.length} item(s) in scene`);
  } else {
    check('ambiguous names carry an id', nameCounts.get(subject.name) === 1 || !!subject.id,
      `subject "${subject.name}" -> ${handle}`);

    // No requested_by, and this client does not declare elicitation -> must refuse.
    const ungated = await call(client, 'set_item_visibility', { item: handle, visible: false });
    check('agent-initiated write is refused', ungated.isError, ungated.text.slice(0, 70));
    check(
      'refusal is the CONFIRMATION gate, not an unrelated error',
      /not requested by the streamer/i.test(ungated.text),
      ungated.text.slice(0, 110),
    );

    const after = await call(client, 'get_scene', {});
    const stillVisible = byName(after.json?.items ?? [], subject)?.visible;
    check('refused write did NOT change state', stillVisible === true, `visible=${stillVisible}`);
  }

  if (!WRITES) {
    await client.close();
    console.log(`\n${failures === 0 ? `ALL ${checks} CHECKS PASSED` : `${failures}/${checks} FAILED`}\n`);
    process.exitCode = failures === 0 ? 0 : 1;
    return;
  }

  // ------------------------------------------------------------- E. the arc
  console.log('\nE. user-requested writes (the voice-command path)');
  if (subject && handle) {
    const hide = await call(client, 'set_item_visibility', {
      item: handle, visible: false, requested_by: 'user',
    });
    check('user-requested write executes immediately', !hide.isError && hide.json?.updated === true,
      hide.text.slice(0, 90));
    check('result names the undo entry', typeof hide.json?.undo === 'string',
      hide.json?.undo ?? '');

    const mid = await call(client, 'get_scene', {});
    check('state actually changed', byName(mid.json?.items ?? [], subject)?.visible === false);

    const undone = await call(client, 'undo_last_edit', { requested_by: 'user' });
    check('undo_last_edit reverses it', !undone.isError && undone.json?.undone === true,
      undone.json?.action ?? undone.text.slice(0, 70));
    const back = await call(client, 'get_scene', {});
    check('item restored via the undo stack',
      byName(back.json?.items ?? [], subject)?.visible === true);
  }

  console.log('\nF. layout');
  const before = await call(client, 'get_scene', {});
  const target = subject ? byName(before.json?.items ?? [], subject) : undefined;
  if (!target || !handle || !(target.rect?.[2] > 0)) {
    check('a sized item exists to move', false, 'no usable subject');
  } else {
    const moved = await call(client, 'set_item_transform', {
      item: handle, anchor: 'bottom-right', width_percent: 22, requested_by: 'user',
    });
    check('anchor + width_percent applies', !moved.isError && moved.json?.updated === true,
      moved.json?.where ?? moved.text.slice(0, 90));
    check('reports geometry checks', Array.isArray(moved.json?.checks),
      (moved.json?.checks ?? []).join(' | ').slice(0, 110));

    // Put it back EXACTLY as it was -- size as well as position. Restoring only position
    // silently leaves the item resized, which is a real edit to the user's scene collection.
    const canvasW = before.json?.canvas?.[0] ?? 1920;
    await call(client, 'set_item_transform', {
      item: handle,
      position: { x: target.rect[0], y: target.rect[1] },
      width_percent: (target.rect[2] / canvasW) * 100,
      requested_by: 'user',
    });
    const restored = byName((await call(client, 'get_scene', {})).json?.items ?? [], subject);
    check(
      'subject restored to its original rect',
      JSON.stringify(restored?.rect) === JSON.stringify(target.rect),
      `${JSON.stringify(target.rect)} -> ${JSON.stringify(restored?.rect)}`,
    );
  }

  await client.close();
  console.log(`\n${failures === 0 ? `ALL ${checks} CHECKS PASSED` : `${failures}/${checks} CHECK(S) FAILED`}\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch(e => {
  console.error('demo harness crashed:', e);
  process.exit(1);
});
