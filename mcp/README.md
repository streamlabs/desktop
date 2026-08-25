# Streamlabs Desktop MCP server (prototype)

Exposes Streamlabs Desktop to an AI agent as an [MCP](https://modelcontextprotocol.io) server, so a
streamer can say *"switch to Starting Soon, mute my mic, and tell me if anything looks wrong"* and
have it happen.

**Status: M0 prototype.** Five tools, no destructive actions, no gating. Not shipped, not packaged,
not security-reviewed. See "Scope and limits" before pointing it at a real broadcast.

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

Note that Claude Desktop can't do everything here: MCP **elicitation** (the only in-band way to get
argument-specific human confirmation) is Claude Code CLI only. That matters from M2 onward.

## Tools

| Tool | Kind | What |
| --- | --- | --- |
| `get_stream_state` | read | The world model. Stream/recording status, health verdict, scene list, active-scene items as pixel rects, audio, events since last call, auto-detected warnings. **Call this first.** |
| `get_scene` | read | Full item detail for one scene by name. |
| `switch_scene` | write | Make a scene active. Warns if it's empty (black screen). |
| `set_item_visibility` | write | Show/hide an item by name. |
| `set_audio` | write | Mute/unmute and set volume by source name. |

All three writes are reversible. Everything takes **human names** — the model never sees
`SceneItem["sceneId", "nodeId", "sourceId"]`. On an ambiguous name you get the candidate list; on a
miss, the available names.

To reduce prompting, allowlist the safe ones in `.claude/settings.json`:

```json
{ "permissions": { "allow": [
  "mcp__streamlabs__get_stream_state",
  "mcp__streamlabs__get_scene",
  "mcp__streamlabs__switch_scene",
  "mcp__streamlabs__set_audio",
  "mcp__streamlabs__set_item_visibility"
] } }
```

## Development

```bash
npm run probe -- ScenesService activeScene     # raw JSON-RPC, no MCP involved
npm run probe -- StreamingService prepopulateInfo
npm run test:e2e                               # drives the built server as an MCP client
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
  `newEvents` on the next `get_stream_state`. Reactive-on-demand works well; continuous autonomous
  monitoring needs a driver loop (Claude Code's `/loop`).
- **Writes bypass the undo stack.** These tools call services directly, not
  `EditorCommandsService`, so Ctrl+Z won't revert them. M1 adds `snapshot_scene_layout` /
  `restore_scene_layout` to compensate.
- **Secret redaction is present but M0 doesn't need it much.** `src/desktop/redact.ts` scrubs every
  payload. It matters from M1 (`get_source_settings`, `get_settings`) onward, because the app's API
  falls through to the whole internal service registry — OAuth tokens, the RTMP stream key and
  widget tokens are all reachable, and model context leaves the machine.
- **Anything local can already do all of this.** The pipe is on by default, auto-authorizes local
  clients, has no token, and reaches ~250 services. This server doesn't widen that hole; it makes it
  convenient and puts a language model behind it. Productization needs real auth on the pipe, an
  explicit in-app opt-in, and a visible "an AI assistant is connected" indicator.

## Next

M1 — read surface (`list_sources`, `get_source_settings`, `diagnose_stream`), builder tools
(`add_source`, `set_item_transform`, `arrange_scene`), layout snapshot/restore.
M2 — confirm-token gate + elicitation, `stream_control` (go-live with dry-run default),
`remove_object`, `raw_rpc` behind `SLD_MCP_RAW=1`.
