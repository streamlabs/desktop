# Streamlabs Desktop MCP server (prototype)

Exposes Streamlabs Desktop to an AI agent as an [MCP](https://modelcontextprotocol.io) server, so a
streamer can say *"switch to Starting Soon, mute my mic, and tell me if anything looks wrong"* and
have it happen.

**Status: Phase 1.** 27 tools covering scene/source editing, layout, and stream control, with a
provenance-based confirmation gate. **Requires** a two-line app change (see "Undo
integration"). Not shipped, not packaged, not security-reviewed. See "Scope and limits"
before pointing it at a real broadcast.

## How it works

Streamlabs Desktop already runs a JSON-RPC 2.0 server on the Windows named pipe `\\.\pipe\slobs`
(and TCP `127.0.0.1:28194`), auto-authorized for local clients — it's how Stream Deck and the
Streamlabs mobile app drive it. This server is a **translation layer**: it speaks MCP to the agent
and that JSON-RPC to the app. It requires **no changes to Streamlabs Desktop itself**.

```
Claude Code  ──stdio/MCP──>  sld-mcp  ──named pipe / TCP──>  Streamlabs Desktop
```

## Setup

```bash
cd mcp
npm install
npm run build
```

Then register it. **Claude Code** (project scope) — a `.mcp.json` already exists at the repo root;
approve it when prompted, or add it explicitly:

```bash
claude mcp add streamlabs --scope local -- node C:/Users/acree/code/desktop/mcp/dist/index.js
```

**Claude Desktop** — `%APPDATA%\Claude\claude_desktop_config.json`. Use an **absolute path**; the
client spawns servers with a minimal environment and a cwd that is not your repo:

```json
{
  "mcpServers": {
    "streamlabs": {
      "command": "node",
      "args": ["C:/Users/acree/code/desktop/mcp/dist/index.js"]
    }
  }
}
```

Register the **built `dist/index.js`**, never `tsx` — `tsx` resolution and PATH assumptions break
under a client-spawned environment. Use `npm run dev` for the inner loop instead.

Note that Claude Desktop can't do everything here: MCP **elicitation** — the only in-band way to
get argument-specific human confirmation — is Claude Code CLI and Hermes only. Every
agent-initiated write depends on it; see "Safety model".

## Tools

Grouped by **permission**, not by domain — `hermes mcp install` presents a per-tool checklist
that writes into `tools.include`, so these boundaries are what a user chooses between.

| Group | Tools |
| --- | --- |
| reads | `get_stream_state`, `get_health`, `get_scene`, `get_source_settings`, `list_source_types`, `preflight_check` |
| performance | `switch_scene`, `set_audio`, `set_item_visibility`, `save_replay`, `undo_last_edit` |
| layout | `set_item_transform`, `reorder_item`, `group_items` |
| sources | `add_source`, `set_source_settings`, `add_filter`, `remove_filter` |
| scenes | `create_scene`, `duplicate_scene`, `rename_scene` |
| destructive | `remove_item`, `remove_source`, `remove_scene` |
| stream | `go_live`, `stop_stream`, `set_recording` |

Everything takes **human names** — the model never sees
`SceneItem["sceneId", "nodeId", "sourceId"]`. On an ambiguous name you get the candidate list; on a
miss, the available names.

`get_health` is a slim projection of `get_stream_state` for polling loops; the full snapshot is
~1.2 KB per call and a monitoring task runs continuously.

## Safety model

**Provenance decides whether to ask, and this server cannot see it.** A `switch_scene` call
looks identical whether the streamer said "go to BRB" out loud or the agent decided BRB would
be nice. Only the agent knows. So policy lives in the client-side skill and this server is the
mechanism.

Every write takes `requested_by`:

- `"user"` — the streamer asked for this specific action. Executes immediately, no prompt.
- `"agent"` — the agent is proposing it. Goes to the human via **MCP elicitation** first,
  with the blast radius computed server-side (which scenes a source is in, whether you're
  live, what the geometry will look like).

`"agent"` is the **default**, so an omitted parameter asks rather than acts. A client that
cannot elicit gets a refusal with recovery instructions, never a silent execution.

`SLD_MCP_MODE=read-only` gates **registration** — the write tools do not exist, so there is
nothing for a misconfigured client to auto-approve. It is env-only on purpose: a mode the
model could set is a mode the model would set.

## Undo integration

Writes route through `EditorCommandsService`, so Ctrl+Z in Streamlabs reverts them — but only
if the app exports the internal `Selection` class under a distinct name. `Selection[...]`
otherwise resolves to the *external* helper, which has no `state` (`modify-transform.ts:20`
throws on it) and whose `freeze()` writes to a fallback proxy instead of the real object.

The app-side change is two lines in `app/services/api/external-api/resources.ts`:

```ts
export { Selection as InternalSelection } from 'services/selection';
```

This is a hard requirement, not a fallback: without the alias, every Selection-based tool
fails with "resource not found" from the app. Verify it with the probe below.

## Hermes skill

`skill/SKILL.md` encodes the provenance contract, the monitoring loop and live etiquette.
Install it straight from this path:

```bash
hermes skills install <owner>/<repo>/mcp/skill
```

## Development

```bash
npm run probe -- ScenesService activeScene     # raw JSON-RPC, no MCP involved
npm run probe -- StreamingService prepopulateInfo
npm run test:e2e                               # drives the built server as an MCP client
npm run mcp_demo                               # Phase 1 verification over the demo arc
npm run mcp_demo:readonly                      # ...reads only, makes no changes
npm run probe -- 'InternalSelection["<sceneId>",[]]' getSize   # undo-support probe
npm run test:reconnect                         # kills/relaunches the app underneath it
npm run inspect                                # browser Inspector
SLD_MCP_VERBOSE=1 ...                          # per-request logging to stderr
SLD_MCP_LOG=C:/tmp/sld-mcp.log ...             # log to a file instead
```

Three `slobs` spellings survive on purpose and must not be renamed — they are the app's own
surface, not ours: the pipe name `\\.\pipe\slobs`, the `SLOBS_CACHE_DIR` env var read by
`main.js:59`, and the `%APPDATA%\slobs-client` data directory.

`npm run test:reconnect` kills and relaunches Electron. It only ever touches the **isolated** dev
instance (`SLOBS_CACHE_DIR=<repo>/.sld-mcp-cache`), never `%APPDATA%\slobs-client`.

To run the app against throwaway data:

```bash
SLOBS_CACHE_DIR="C:/Users/acree/code/desktop/.sld-mcp-cache" ./node_modules/.bin/electron .
```

### Design constraints baked into this code

- **stdout is the MCP transport.** Never `console.log` in `src/` — use `log()` from `src/log.ts`,
  which writes to stderr or `SLD_MCP_LOG`. One stray write corrupts the stream and the client drops
  the server with an opaque error. This is the most common way a first MCP server fails.
- **No imports from `../app`.** Wire types are hand-copied into `src/desktop/types.ts`. The wire format
  is a contract; pinning to it rather than to app internals is the point of a separate process.
  `mcp/` is greenfield and uses `strict: true`, unlike the host repo.
- **This is npm, not Yarn**, and deliberately not a Yarn workspace — the root is pinned to Yarn Berry
  3.1.1 with no `workspaces` key, and adding one would touch `yarn.lock` and the electron-builder
  globs for no benefit.

### `src/desktop/client.ts` — six fixes vs. `test/helpers/api-client.ts`

It's a port, not a copy. Each change fixes something that would bite in this context:

1. **No `requestSync` / `getResource` Proxy** — they need `deasync`, which blocks the event loop.
2. **Inbound read buffering** — the original splits raw socket chunks on `\n` with no accumulator,
   so any response the OS splits mid-frame throws. `ScenesService.state` is 50–250 KB and *will*
   split.
3. **PROMISE envelopes resolved on the async path** — the original only correlates deferred results
   on the sync path, so `goLive` / `prepopulateInfo` would return an envelope and never resolve.
   *Verified*: `npm run probe -- SceneCollectionsService fetchSceneCollectionsSchema` returns real
   data, and the log shows the `deferred -> awaiting promise` hop.
4. **Memoized connect lifecycle** — the original's resolve/reject closures go stale after the first
   connect and in-flight requests hang forever on disconnect. Covered by `npm run test:reconnect`.
5. **Bootstrap ordering** — `forceRequests(true)` *then* `listenAllSubscriptions`. The first is
   needed because `isEventsSendingStopped` starts `true` and is re-raised during scene-collection
   loads, and `sendResponse` drops normal responses while it's set. The second is required for
   PROMISE results to reach us at all: the event fan-out matches on `client.subscriptions`, and
   promise ids are fresh uuids that are never in that list.
6. **Request-size guard + stderr logging** — the app's socket handler does no inbound reassembly
   either, so an oversized request that the OS splits gets us disconnected. Requests are capped at
   4 KB and `undefined` args are normalised to `null` (`JSON.stringify` drops `undefined` from
   arrays, silently shifting positional arity).

### Why `get_stream_state` is cheap

The rate limit (`MAX_POINTS_PER_SECOND = 2`) only applies to `@Expensive` methods, of which there
are exactly two: `ScenesService.getScenes` and `SceneCollectionsService.fetchSceneCollectionsSchema`.
The snapshot calls **neither** — `ScenesService.activeScene` is a getter returning the whole active
scene (nodes, transforms, per-item resourceIds) in one free call, and `getSceneNames` is the free
list. **Never call `getScenes()` from a hot path.**

Measured: ~1.2 KB, ~70 ms, 6 round-trips cold.

## Scope and limits

- **The agent cannot see the rendered output.** There is no frame-capture API: `capturePage` appears
  nowhere in the app, and OBS renders into a child native window composited by the OS, which
  Chromium's `capturePage()` would return as a black rectangle. The agent reasons over the pixel
  rects and the `warnings` array. Never let it switch scenes or go live without a human watching the
  preview.
- **No push.** MCP servers can't interrupt a model mid-turn, so events are buffered and surfaced via
  `newEvents` on the next `get_stream_state` / `get_health`. Reactive-on-demand works well;
  continuous monitoring needs a driver loop — Hermes' native scheduled automation, or Claude
  Code's `/loop`.
- **One undo entry per operation, not per agent action.** A multi-step edit is a matching
  number of Ctrl+Z presses. Collapsing them would need a `MacroCommand` in the app.
- **Secret redaction matters now.** `src/desktop/redact.ts` scrubs every payload, and
  `get_source_settings` is exactly why: the app's API falls through to the whole internal
  service registry — OAuth tokens, the RTMP stream key and widget tokens are all reachable, and
  model context leaves the machine.
- **Anything local can already do all of this.** The pipe is on by default, auto-authorizes local
  clients, has no token, and reaches ~250 services. This server doesn't widen that hole; it makes it
  convenient and puts a language model behind it. Productization needs real auth on the pipe, an
  explicit in-app opt-in, and a visible "an AI assistant is connected" indicator.

## Next

**Phase 1.5 — screen capture**, gated on two cheap experiments that should run before any code:

1. Does Hermes forward MCP `image` content blocks to a vision model? Image support is not a
   negotiated capability, so it cannot be feature-detected — point Hermes at a stub tool
   returning a tiny PNG and see whether the model can describe it. If not, capture is inert.
2. Does Electron 29's `desktopCapturer` return real pixels in the OBS preview region, or a
   black rectangle? OBS renders into a native child HWND via a D3D swap chain from a separate
   process, so this depends on Chromium's WGC window capturer being active. If it is black,
   try `app.commandLine.appendSwitch('enable-features', 'AllowWgcWindowCapturer')`.

The design if both pass: an internal `CaptureService` writes a downscaled PNG to
`<userData>/captures/`, returns the path, and the MCP server reads and base64s it into an
`image` content block — disk is the app↔server transport, because Hermes agents may run
sandboxed with no host filesystem. Capture is the one read that is **not** free: it reads the
user's screen rather than app state, bypasses `redact.ts` entirely, and always confirms.

**Phase 2 — OBS canvas capture**, needed only if experiment 2 fails. Preference order: an
offscreen `gs_texrender_t` readback inside osn; a Windows shared texture mirroring the
existing macOS `OBS_content_createIOSurface`; or WGC against a dedicated chrome-free display.
