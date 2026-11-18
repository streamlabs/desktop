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
import { registerCapture } from './capture.js';
import { registerPerformance } from './performance.js';
import { registerLayout } from './layout.js';
import { registerSourceReads, registerSources } from './sources.js';
import { registerScenes } from './scenes.js';
import { registerDestructive } from './destructive.js';
import { registerStream } from './stream.js';
import { registerStudio } from './studio.js';
import { registerHealth } from './health.js';

/**
 * SLD_MCP_MODE=demo: a small, focused tool set. Fewer tools means fewer wrong choices, and
 * nothing in this set can go live, stop a stream or delete a source. (remove_source is also unsafe for scene-placed sources -- see
 * destructive.ts.)
 */
export const DEMO_TOOLS = new Set([
  'get_stream_state',
  'get_scene',
  'capture_screen',
  'build_scene',
  'add_to_scene',
  'apply_style',
  'edit_text',
  'edit_sticker',
  'set_camera',
  'set_item_transform',
  'reorder_item',
  'switch_scene',
  'remove_item',
  'undo_last_edit',
  'set_audio',
  'save_replay',
  'set_recording',
  'check_stream_health',
  'fix_stream_health',
]);

/** Registers only the tools in `allow`, so the existing register* functions can be reused. */
function filtered(server: McpServer, allow: Set<string>): McpServer {
  return new Proxy(server, {
    get(target, prop, receiver) {
      if (prop === 'registerTool') {
        return (name: string, ...rest: unknown[]) =>
          allow.has(name) ? (target.registerTool as any).call(target, name, ...rest) : undefined;
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

export type { Ctx } from './shared.js';

export function registerTools(server: McpServer, ctx: Ctx): void {
  if (serverMode() === 'demo') {
    const demo = filtered(server, DEMO_TOOLS);
    for (const register of [
      registerReads,
      registerCapture,
      registerStudio,
      registerHealth,
      registerLayout,
      registerPerformance,
      registerDestructive,
      registerStream, // set_recording only (go_live / stop_stream are filtered out)
    ]) {
      register(demo, ctx);
    }
    log(`SLD_MCP_MODE=demo — registered ${DEMO_TOOLS.size} tools, confirmations off`);
    return;
  }

  registerReads(server, ctx);
  registerSourceReads(server, ctx);
  registerCapture(server, ctx);

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
  registerStudio(server, ctx);
  registerHealth(server, ctx);
}
