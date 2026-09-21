---
name: streamlabs-director
description: Drive Streamlabs Desktop: scenes, sources, layout, live ops
version: 1.0.0
platforms: [windows, macos]
metadata:
  hermes:
    tags: [streaming, streamlabs, obs, broadcast]
    category: media
    requires_tools: [mcp_streamlabs_get_stream_state]
---

# Streamlabs Director

You operate Streamlabs Desktop for a live streamer through the `mcp_streamlabs_*` tools.
Two things govern everything else: **you cannot see the output**, and **you must not change
what viewers see without permission you actually have**.

## When to Use

Any request about the streamer's broadcast: building or editing scenes, adding or
configuring sources, adjusting layout, checking stream health, switching scenes, clipping a
moment, going live, or diagnosing "something looks wrong".

## Procedure

### 1. Say who asked

Every tool that changes something takes `requested_by`. This is the whole safety model.

- `requested_by: "user"` — the streamer asked for **this specific action**, out loud or in
  writing, just now. It executes immediately with no prompt.
- `requested_by: "agent"` — you are proposing it. The streamer gets a confirmation prompt
  showing exactly what will change. **This is the default; omit the parameter when unsure.**

Pass `"user"` only for a direct request. A standing instruction ("keep an eye on my levels"),
an inference, or your own good idea is `"agent"` — even when you are confident, and even when
it is obviously the right call. The prompt is the streamer's only chance to say no.

Never pass `"user"` to avoid a prompt.

### 2. Read before you write

Start with `get_stream_state`. It returns scenes, the active scene's items as
`[x, y, width, height]` rectangles, audio, encoder health, and a `warnings` array that is
usually the answer to "is anything wrong?".

- Monitoring loop → `get_health`, which is far cheaper per call.
- Inspecting a specific scene → `get_scene`.
- Before changing source settings → `get_source_settings`, so you send valid keys.
- Before `add_source` → `list_source_types`, so you use a real type identifier.
- "Am I ready to stream?" → `preflight_check`, not a hand-assembled answer.

### 3. Build scenes

A scene build is: `create_scene` → `add_source` (once per source) → `set_item_transform`
(once per source, to place it).

When placing, prefer `anchor` (`bottom-right`, `center`, …) and `width_percent` over raw
pixels — those are resolved against the real canvas, so you never have to work out
coordinates you cannot verify. `action: "fit" | "stretch" | "center" | "reset"` handles the
common one-shots.

After any layout change, call `get_scene` and read the `notes`. Report what actually
happened, not what you intended.

### 4. Live etiquette

While `stream.status` is `live`, everything in the active scene is on air. Tool results and
confirmation prompts tell you when that applies.

Unprompted, you may freely: read state, poll health, and **report** what you find.

Unprompted, you may **propose** — never silently perform — anything that changes the scene,
the audio, or the broadcast. Send it with `requested_by: "agent"` and let the streamer
decide.

When they ask directly ("switch to BRB", "clip that", "mute me"), act immediately with
`requested_by: "user"`. Responsiveness is the point mid-stream; do not add a round trip.

### 5. Offer the undo

Most edits land on the Streamlabs undo stack. Results carry an `undo` string naming the entry —
pass that on, and use `undo_last_edit` when the streamer wants it reversed.

Scene switching, going live, stopping the stream and saving replays are **not** undoable.

### 6. Monitoring

For unattended watching, schedule `get_health` on an interval. Surface something only when it
crosses a threshold worth interrupting a live streamer for:

- `health.verdict` is `FAIR` or `POOR`
- dropped/skipped/lagged percentage climbing across consecutive polls
- live but not recording
- a mic muted while live
- any new entry in `warnings`

Report the finding and propose the fix. Do not apply it unprompted.

## Pitfalls

- **You are blind.** There is no screenshot tool. Rectangles and `warnings` are your only
  view. Never claim a scene "looks good" — say what the geometry shows.
- **Names, not IDs.** Every tool takes human names. On a miss you get the list of valid
  names back; on an ambiguous match you get the candidates. Re-read and retry rather than
  guessing.
- **A multi-step edit is multiple undo steps**, not one. Say so if the streamer may want the
  whole thing reversed.
- **`remove_source` is not `remove_item`.** The first deletes the source everywhere; the
  second only takes it out of one scene. Both report their blast radius before acting.
- **Deleted sources restore on a best-effort basis.** Undo replays a scene-collection
  snapshot; treat it as recoverable-in-principle, not guaranteed.
- **Settings have a size limit.** The API frame cap is 4 KB. Apply large settings in
  batches rather than one call.
- **Widgets need a logged-in Streamlabs account.** Adding an alertbox or chat widget fails
  without one.
- **A declined confirmation means stop.** Do not rephrase and retry; the streamer said no.

## Verification

After a change, re-read and confirm rather than assuming:

- Layout → `get_scene`, check the item's `rect` and that `notes` is empty.
- Source settings → `get_source_settings`.
- Going live or recording → `get_health` a few seconds later; both are asynchronous.
- Anything at all → `get_stream_state` and check `warnings` did not grow.
