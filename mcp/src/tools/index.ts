/**
 * Tool registration.
 *
 * Tools are grouped by PERMISSION, not by domain. `hermes mcp install` presents a per-tool
 * checklist and writes the selection into `tools.include`, so these boundaries are what a
 * user actually chooses between — which is why, for example, deletion is its own group
 * rather than living alongside the scene and source editing it resembles.
 *
 * SLD_MCP_MODE=read-only gates REGISTRATION, not just execution: in that mode the write
 * tools do not exist, so there is nothing for a misconfigured client to auto-approve.
 *
 * Safety model, in short: every write takes `requested_by`, defaulting to 'agent'. Anything
 * the agent proposes goes to the streamer via MCP elicitation before it happens; anything
 * the streamer asked for directly runs immediately. See src/confirm.ts.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Ctx } from './shared.js';
import { serverMode } from '../confirm.js';
import { log } from '../log.js';

import { registerReads } from './reads.js';
import { registerPerformance } from './performance.js';
import { registerLayout } from './layout.js';
import { registerSourceReads, registerSources } from './sources.js';
import { registerScenes } from './scenes.js';
import { registerDestructive } from './destructive.js';
import { registerStream } from './stream.js';

export type { Ctx } from './shared.js';

export function registerTools(server: McpServer, ctx: Ctx): void {
  registerReads(server, ctx);
  registerSourceReads(server, ctx);

  if (serverMode() === 'read-only') {
    log('SLD_MCP_MODE=read-only — write tools not registered');
    return;
  }

  registerPerformance(server, ctx);
  registerLayout(server, ctx);
  registerSources(server, ctx);
  registerScenes(server, ctx);
  registerDestructive(server, ctx);
  registerStream(server, ctx);
}
