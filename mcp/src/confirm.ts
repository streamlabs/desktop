/**
 * Confirmation gate.
 *
 * THE DESIGN CONSTRAINT: provenance decides whether to ask, and this server cannot see it.
 * A `switch_scene` call looks identical whether the streamer said "go to BRB" out loud or
 * the agent decided BRB would be nice. Only the agent knows. So policy lives in the Hermes
 * skill, which passes `requested_by`; this module is the mechanism that acts on it.
 *
 *   requested_by: 'user'   -> the streamer asked for this. Execute immediately.
 *   requested_by: 'agent'  -> the agent is proposing it. Ask the human via elicitation.
 *
 * `agent` is the DEFAULT, so an omission asks rather than acts.
 *
 * Elicitation is the right surface for the target client: Hermes enables it per server by
 * default with a 300s timeout and renders it as interactive buttons (including on Telegram
 * and Slack). It is not universal, so a client that cannot elicit gets a refusal with
 * recovery instructions rather than a silent execution.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { log } from './log.js';

/**
 * How long the streamer has to answer. Matches Hermes' own elicitation timeout -- without an
 * explicit value the SDK applies its 60s request default and cuts the prompt off at a fifth
 * of the time the client would have waited.
 */
const CONFIRM_TIMEOUT_MS = 300_000;

export type RequestedBy = 'user' | 'agent';

/**
 * A change described for a human, built as STRUCTURED DATA rather than a preformatted
 * string so that richer payloads (a captured frame, say) can be attached later without
 * touching any tool.
 */
export interface ChangeSummary {
  /** One line, imperative: 'Unmute "Mic/Aux"'. */
  title: string;
  /** Prose delta: what moves from where to where, what is affected. */
  lines?: string[];
  /** Consequences worth reading before approving: live, blast radius, no undo. */
  warnings?: string[];
}

export type Decision = { approved: true } | { approved: false; reason: string };

/**
 * read-only -- write tools are never registered, so there is nothing to auto-approve.
 * full      -- everything registered; writes still pass through the provenance gate.
 *
 * Deliberately env-only. If the model could set this, it would set it to whatever let it
 * finish the task.
 */
export type ServerMode = 'read-only' | 'full' | 'demo';

/**
 * demo -- a curated, small tool set for live demos with smaller local models, and NO
 *         confirmation prompts: every write executes as if the streamer requested it.
 */
export function serverMode(): ServerMode {
  const m = process.env.SLD_MCP_MODE;
  return m === 'read-only' ? 'read-only' : m === 'demo' ? 'demo' : 'full';
}

export function renderSummary(s: ChangeSummary): string {
  const parts = [s.title];
  if (s.lines?.length) parts.push('', ...s.lines);
  if (s.warnings?.length) parts.push('', ...s.warnings.map(w => `! ${w}`));
  return parts.join('\n');
}

export class Confirmer {
  constructor(private server: McpServer) {}

  async gate(requestedBy: RequestedBy | undefined, summary: ChangeSummary): Promise<Decision> {
    // Demo mode: no prompts. Everything runs as if the streamer asked for it.
    if (serverMode() === 'demo') {
      log(`gate: demo mode, executing -- ${summary.title}`);
      return { approved: true };
    }

    // Default to 'agent': an omitted parameter must fail safe, not fail open.
    const provenance: RequestedBy = requestedBy === 'user' ? 'user' : 'agent';

    if (provenance === 'user') {
      log(`gate: user-requested, executing -- ${summary.title}`);
      return { approved: true };
    }

    const message = renderSummary(summary);
    log(`gate: agent-initiated, eliciting -- ${summary.title}`);

    let result: { action: string };
    try {
      result = await this.server.server.elicitInput(
        {
          message,
          // A pure confirmation: the accept/decline action IS the answer, so no fields.
          requestedSchema: { type: 'object', properties: {} },
        },
        { timeout: CONFIRM_TIMEOUT_MS },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof McpError && e.code === ErrorCode.RequestTimeout) {
        log('gate: confirmation timed out');
        return {
          approved: false,
          reason:
            `Not done. The streamer was asked to confirm but did not answer within ` +
            `${CONFIRM_TIMEOUT_MS / 60_000} minutes, so nothing was changed. Ask them directly ` +
            `whether they want it, and if they agree, call again with requested_by: "user".` +
            `\n\nProposed change:\n${message}`,
        };
      }
      log(`gate: elicitation unavailable (${msg})`);
      return {
        approved: false,
        reason:
          `Not done. This was not requested by the streamer, and this client cannot show a ` +
          `confirmation prompt (${msg}). Ask them directly, and if they agree, call again ` +
          `with requested_by: "user".\n\nProposed change:\n${message}`,
      };
    }

    if (result.action !== 'accept') {
      log(`gate: declined (${result.action})`);
      return {
        approved: false,
        reason: `The streamer ${
          result.action === 'decline' ? 'declined' : 'dismissed'
        } this change. Nothing was modified. Do not retry it unless they ask.`,
      };
    }

    return { approved: true };
  }
}
