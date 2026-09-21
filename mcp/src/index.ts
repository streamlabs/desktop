#!/usr/bin/env node
/**
 * Streamlabs Desktop MCP server (stdio).
 *
 * REMINDER: stdout is the transport. Never console.log here -- use log() from ./log.js,
 * which writes to stderr or SLD_MCP_LOG.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { DesktopClient } from './desktop/client.js';
import { Resolver } from './desktop/resolver.js';
import { EventBuffer } from './desktop/events.js';
import { SnapshotBuilder } from './desktop/snapshot.js';
import { Commands } from './desktop/commands.js';
import { Confirmer, serverMode } from './confirm.js';
import { registerTools } from './tools/index.js';
import { log } from './log.js';

const INSTRUCTIONS = `
Controls Streamlabs Desktop, the live-streaming app, on this machine.

YOU CANNOT SEE THE RENDERED OUTPUT. There is no screenshot capability. Your only view of
the stream is the structured state from get_stream_state, where each scene item is given
as a rectangle [x, y, width, height] in canvas pixels.

Start with get_stream_state. It also returns a "warnings" array of problems detected
automatically (live without recording, mic muted while live, off-canvas or zero-size
items, empty scenes) -- read it, it is often the answer to "is anything wrong?".
For a monitoring loop use get_health instead; it is much cheaper per call.

WHO ASKED FOR IT. Every tool that changes something takes "requested_by":
  - "user"  - the streamer directly asked for THIS action, out loud or in writing.
              It happens immediately, with no prompt.
  - "agent" - you are proposing it, including when acting on a standing instruction or
              on something you inferred. The streamer gets a confirmation prompt first.
"agent" is the default. Omit the parameter whenever you are not certain. Never pass
"user" to avoid a prompt -- that prompt is the streamer's only chance to say no.

WHERE YOU RUN MATTERS. An agent-initiated change is confirmed with the streamer through an
MCP elicitation prompt. A non-interactive context -- a background subagent, a scheduled
task -- has nowhere to show that prompt, so it is auto-declined and the change silently
never happens. Reads are safe to run anywhere. Run anything that writes from the
interactive session where the streamer can actually answer.

LAYOUT. Use set_item_transform, preferring "anchor" (bottom-right, center, ...) and
"width_percent" over raw pixels -- both are resolved against the real canvas, so you never
have to work out coordinates you cannot verify. After any layout change, get_scene to
verify what actually happened.

Actions that change the active scene take effect immediately for viewers. Most edits are
on the Streamlabs undo stack -- tool results say so, and undo_last_edit steps back.
`.trim();

async function main(): Promise<void> {
  const client = new DesktopClient();
  const resolver = new Resolver(client);
  const events = new EventBuffer(client);
  const snapshot = new SnapshotBuilder(client, resolver, events);
  const commands = new Commands(client);

  const server = new McpServer(
    { name: 'streamlabs', version: '0.2.0' },
    { instructions: INSTRUCTIONS },
  );

  const confirm = new Confirmer(server);

  registerTools(server, { client, resolver, snapshot, events, commands, confirm });
  log(`mode: ${serverMode()}`);

  // Connect the transport first so the client never waits on Streamlabs being up.
  await server.connect(new StdioServerTransport());
  log('MCP server connected on stdio');

  // Best-effort warm-up. If Streamlabs isn't running yet, tools reconnect on demand.
  void client
    .ensureConnected()
    .then(() => events.subscribeAll())
    .catch(e => log('initial connect deferred:', e instanceof Error ? e.message : String(e)));

  const shutdown = () => {
    log('shutting down');
    client.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(e => {
  log('fatal', e);
  process.exit(1);
});
