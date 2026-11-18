# Demo mode: Hermes + local LLM + Streamlabs MCP + NVIDIA Broadcast MCP

`SLD_MCP_MODE=demo` runs the server with a small, focused tool set and no confirmation prompts,
for driving Streamlabs from an agent with a local model. It pairs with NVIDIA Broadcast's own MCP
server for webcam effects.

## Tools in demo mode

| Tool | What it does |
| --- | --- |
| `get_stream_state`, `get_scene` | Read the scenes, items, audio and stream health |
| `build_scene` | Create a scene from roles (`background`, `game`, `webcam`, `text`, `alerts`) in one call |
| `add_to_scene` | Add roles to an existing scene (e.g. the Streamlabs Alert Box widget) |
| `apply_style` | Restyle every scene: background, accent and text colors, font, webcam frame |
| `set_camera` | Choose which camera the webcam shows (e.g. the NVIDIA Broadcast camera), or `off` |
| `set_item_transform` | Move or resize one item, by anchor, `width_percent`, or `flush: true` against an edge |
| `switch_scene`, `remove_item`, `undo_last_edit`, `capture_screen` | Show a scene, remove an item, undo, screenshot |

The server keeps free-form choices presentable: low-contrast text colors are swapped for
readable ones, text that's too wide or overlaps the webcam is shrunk or moved, emoji (which the
text source can't render) are stripped, and positions past the canvas edge are clamped.

## Hermes setup

A dedicated Hermes profile keeps the agent focused:

```yaml
mcp_servers:
  streamlabs:
    command: node
    args: ["<repo>/mcp/dist/index.js"]
    env:
      SLD_MCP_MODE: demo
  nvidia-broadcast:
    url: http://127.0.0.1:18100/gateway
    tools:
      include: [set_effects, get_broadcast_state, list_devices]
tools:
  tool_search:
    enabled: "off"            # direct tools with full schemas
platform_toolsets:
  cli: [skills, vision, clarify]
skills:
  auto_load: [streamlabs-studio]   # mcp/skill-demo/SKILL.md, copied into the profile's skills/
```

Turning off the skill curator, background review and skill-creation nudges for the profile also
keeps sessions focused. Start the desktop app on the profile so voice input and every other
request goes to it from the first message.

## Fresh start

Starting both apps fresh, in this order, gives a clean camera pipeline:

1. Quit Streamlabs completely.
2. `npm run demo:prep`: restarts NVIDIA Broadcast (until its MCP gateway answers) and the Hermes
   gateway.
3. Start Streamlabs.
4. `npm run demo:reset`: a new empty scene collection, with NVIDIA background effects off.

After `npm run build`, run `hermes gateway restart` so Hermes picks up the new server.

## Voice input

Hermes's built-in local Whisper doesn't support Windows ARM64. A command STT provider works
instead (`stt.provider: <name>`, `stt.providers.<name>: {type: command, command: ...}`): a small
wrapper converts the browser recording to 16 kHz WAV with ffmpeg and runs whisper.cpp's
`whisper-cli` (native ARM64 builds are attached to whisper.cpp's numbered build tags). Use
dictation (the mic button, or bind "Start / stop dictation" to a Ctrl/Alt shortcut) so the agent
only hears you when you mean it.

## Design notes

- **Release the camera before changing effects.** An effect change reconfigures the camera, so
  Streamlabs lets go of it first and attaches to the processed camera afterwards: `set_camera off`
  → NVIDIA `set_effects` → `set_camera "NVIDIA Broadcast"`. `set_camera` never changes an existing
  source's device (OBS opens a changed device synchronously); it creates one source per camera
  and swaps visibility. Calling it for the camera already shown re-attaches it.
- NVIDIA Broadcast exposes a camera filter per architecture; this x64 OBS build uses the
  `(Win32)` one, and `set_camera` picks it automatically.
- A smaller LLM quantization leaves GPU memory headroom for AI video effects running alongside.
- `remove_source` (full mode) should remove scene items rather than use `RemoveSourceCommand`,
  which is meant for global sources. It's excluded from demo mode.

## Checks

```bash
npm run build
npm run demo:reset && npm run demo:check   # exercises the studio tools end to end, screenshots in demo-check-out/
```
