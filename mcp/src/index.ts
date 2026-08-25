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
import { registerTools } from './tools/index.js';
import { log } from './log.js';

const INSTRUCTIONS = `
Controls Streamlabs Desktop, the live-streaming app, on this machine.

YOU CANNOT SEE THE RENDERED OUTPUT. There is no screenshot capability. Your only view of
the stream is the structured state from get_stream_state, where each scene item is given
as a rectangle [x, y, width, height] in canvas pixels. After ANY layout change, call
get_scene to verify what you did, and ask the human to confirm it looks right.

Start with get_stream_state. It also returns a "warnings" array of problems detected
automatically (live without recording, mic muted while live, off-canvas or zero-size
items, empty scenes) -- read it, it is often the answer to "is anything wrong?".

Actions that change what viewers see take effect immediately. Never switch scenes or
change a live layout without the human having eyes on the preview.
`.trim();

async function main(): Promise<void> {
  const client = new DesktopClient();
  const resolver = new Resolver(client);
  const events = new EventBuffer(client);
  const snapshot = new SnapshotBuilder(client, resolver, events);

  const server = new McpServer(
    { name: 'streamlabs', version: '0.1.0' },
    { instructions: INSTRUCTIONS },
  );

  registerTools(server, { client, resolver, snapshot });

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
