# Automations Migration — Progress & Resume Notes

> Living handoff doc for migrating the **Automations** system from the
> `stream-avatar` Streamlabs Desktop *plugin* (React + Zustand) into **native
> Streamlabs Desktop** (the Electron app in this `desktop/` repo).
> Last updated: 2026-06-04.

---

## 1. Context

Three repos are in play:

| Repo | Role |
|---|---|
| `stream-avatar` | Original FE plugin — the **reference implementation** we are porting from. |
| `stream-avatar-api` | Ts.ED backend (persists automations, AI pipeline). |
| `desktop` | **Migration target** — the native Streamlabs Desktop Electron app (this repo). |

Goal of the overall effort: bring the plugin's Automations feature (rule = *When a
game condition is met, Do these actions*) into native Desktop, wired to the same
backend, using Desktop's own services (`ScenesService`, `SourcesService`,
`StreamingService`, `VisionService`, etc.).

---

## 2. Architecture in Desktop

### Data model (engine)

Automations are stored/exchanged as **`TAutomationExport`** — actions reference
scenes/sources **by name**, not id:

```ts
type TAutomationExport = {
  id?: number;
  description?: string;
  conditions: TCondition[];            // [{ type: 'fortnite.elimination', props? }]
  actions: ExportedAction[];           // [{ type: 'common.switch_to_scene', props: { scene: { name } } }]
  enabled: boolean;
};
```

The engine resolves names → ids at process time via an **`ActionContext`**
(`resolveSceneId` / `resolveSourceId`), so "deleted / unavailable" detection ==
*a saved name no longer matching any live scene/source name*.

### Key engine files (`desktop/app/services/stream-avatar/engine/`)

| File | Responsibility |
|---|---|
| `automations.ts` | `TAutomationExport` type. |
| `conditions.ts` | `Conditions`, `GAME_NAMES`, `ConditionsManager`, `TCondition`, `ConditionType`, `ConditionPropsMap`, and all shared evaluator helpers (`onEvent`, `lowHealth`, `hasShield`/`noShield`, `eliminationCount()`, `playersRemaining(max)`) — see §5c. |
| `instructions.ts` | All per-game LLM prompts in a single `perGameInstructions` object; `withWordLimit()` applied on export — see §5c. |
| `actions.ts` | `ActionRegistry`, `Actions` (import/export/process), `ActionContext`, props types, **`defaultExportedProps` / `withActionDefaults`** (see §5). |
| `properties.ts` | `Properties.*` classes (Scene/Source/Slider/Checkbox/Text) with `valueFromExport` / `valueToExport` and a `config.default`. |
| `validation.ts` | **Shared validator** used by both the list and the editor (see §3). |
| `game-state.ts` | `GameState`, `defaultGameState`. |

### Services

| Service | Window | Role |
|---|---|---|
| `AutomationsService` (`automations-service.ts`) | any | CRUD over the backend (`fetchAll`/`create`/`update`/`remove`), holds `state.automations` + `state.loading`. |
| `AutomationsEngineService` (`automations-engine-service.ts`) | **worker only** (`Utils.isWorkerWindow()` guard) | Subscribes to vision events, evaluates conditions, processes actions. Owns the `actionContext`. Also exposes `simulateAutomation(id)` (see §4). |

Both are registered in `app/app-services.ts` and resolvable from the renderer via
the `Services` proxy (`components-react/service-provider.ts`).

**Renderer ↔ worker IPC** uses the base `Service.actions` proxy:
- `Service.actions.foo()` — fire-and-forget (resolves immediately in renderer).
- `Service.actions.return.foo()` — returns `Promise<T>` that resolves when the
  worker method *completes*. We use `.return` for `simulateAutomation` so the UI
  spinner stays accurate across the simulation's revert delay.

### UI (`desktop/app/components-react/windows/stream-avatar-automations/`)

| File | Role |
|---|---|
| `EditAutomations.tsx` | List modal — table of automations with per-row error icon, enable/disable `Switch`, **Test (play) button**, edit, delete. Launches the editor. |
| `AutomationEditor.tsx` | Create/edit form — description, condition (game + condition selects), actions list (`ActionEditor` per action). |
| `EditAutomations.m.less` | List styles (incl. `.errorIcon`, `.disabledIcon`). |

Launcher: `components-react/editor/elements/SceneSelector.tsx` has the
`Edit Automations.` tooltip/button that opens the list modal.

---

## 3. Validation (real-time errors + submit blocking)

Single source of truth: **`engine/validation.ts`** → `validateAutomation(automation, { scenes, sources })`
returns `IAutomationIssue[]`:

```ts
type TIssueScope = 'description' | 'conditions' | 'action';
interface IAutomationIssue {
  scope: TIssueScope;
  actionIndex?: number;   // set when scope === 'action'
  field?: string;         // 'scene' | 'source' | 'instruction'
  message: string;
}
```

Rules implemented:
- **Description** — required (`Add a description.`), ≤ `MAX_DESCRIPTION_LENGTH` (100).
- **Conditions** — required (`Select a condition.`); type must exist in `Conditions`
  else `This automation uses an unknown condition.`.
- **Actions** — at least one (`Add at least one action.`).
- **`common.switch_to_scene`** — scene required (`Select a scene to switch to.`);
  must exist in live scenes else `Scene "%{name}" no longer exists.`.
- **`common.show_source` / `common.hide_source`** — source required
  (`Select a source.`); must exist else `Source "%{name}" is unavailable.`.
- **`co-host.instruction`** — non-empty (`Enter an instruction for the co-host.`),
  ≤ `MAX_INSTRUCTION_LENGTH` (128).

Consumers:
- **List (`EditAutomations.tsx`)** — runs `validateAutomation` per row; if issues,
  renders a red `icon-error` with a `Tooltip` listing each `issue.message`.
  Pulls live `scenes`/`sources` from `ScenesService`/`SourcesService` via `useVuex`.
- **Editor (`AutomationEditor.tsx`)** — builds a `draft` and validates live. Shows
  red borders (`fieldBorder`) + inline error text (`errorTextStyle`) per field.
  Required-field errors are gated behind `attempted` (hidden on a fresh form until
  first save; shown immediately when editing an existing automation). For a
  deleted scene/source the editor injects a synthetic `… (unavailable)` option so
  the stale value is visible and selectable. `handleSave` blocks submission while
  `issues.length > 0` and surfaces `Please fix the highlighted fields before saving.`.

**Enabled state** is NOT in the editor — it's toggled only from the list row
`Switch`. New automations default to enabled; edits preserve the existing value.

---

## 4. Simulation (Test / play button)

`AutomationsEngineService.simulateAutomation(id)` (worker) reuses the engine's
existing `actionContext`:

1. Run every action with `conditionsMet: true` + `props.simulating: true`.
2. `await` ~5000ms.
3. Run every action again with `conditionsMet: false` — so conditional
   show/hide-source actions revert.

Each action is wrapped in try/catch, so an action pointing at a deleted
scene/source logs a warning instead of aborting the run.

UI (`EditAutomations.tsx`): per-row `icon-play` calls
`AutomationsEngineService.actions.return.simulateAutomation(id)`. While running,
that row shows an antd `Spin` and the other rows' play buttons are disabled
(`.disabledIcon`) via `simulatingId` state to prevent overlapping runs.

> Note: the test runs the **real** actions (it actually switches scenes / saves a
> replay), matching the original plugin. A non-destructive "dry run" mode (gating
> side effects behind `simulating`) is a possible future option — not implemented.

---

## 5. `wait_for_ms` default-duration fix

**Bug:** the `wait_for_ms` slider only *displayed* `props.duration ?? 5000` as a
fallback. If the user never dragged the slider, `duration` was never written into
the action's `props`, so the server received `duration: undefined`.

**Fix (generic, in `engine/actions.ts`):**
- `defaultExportedProps(type)` — reads each registered property's `config.default`
  into exported-props shape (covers `wait_for_ms`'s 5000 and any future
  slider/checkbox default).
- `withActionDefaults(action)` — merges those defaults under an action's existing
  props (existing values win).

Wired into `AutomationEditor.tsx` at the three points an action enters state:
`setType` (type change), `handleAddAction` (add), and the `initial.actions` map on
load (so previously-broken records heal on next save).

Also removed a leftover `console.log(props)` debug line from the `wait_for_ms`
process handler.

> TS gotcha: assigning into `props[key as keyof ExportedActionProps]` needs an
> `as never` cast (the keyed-union resolves to `never`), exactly as `exportAction`
> does. Fixed (was TS2322).

---

## 5b. Action rows: reference-aligned layout, insert-between, drag reorder

`AutomationEditor.tsx`'s action list mirrors the original `stream-avatar`
`DialogAutomation` UX: each action is a **single row** on a 4-column grid
`auto | minmax(0,1fr) | minmax(0,1fr) | auto`:

```
[⠿ grip] [ action-type select ] [ inline control ] [ + ]  [ − ]
```

- **Inline control (column 3).** The type-specific control sits on the *same row*
  as the type select (was previously stacked in a card). `renderControl()` returns:
  scene select / source select (+ its checkbox below) / Wait duration header +
  slider / instruction input / co-host blurb / nothing (save_replay). A fixed
  `CONTROL_HEIGHT` (32px) on the grip & +/- cells keeps them aligned with the
  control's first line even when a checkbox/slider adds height below.
- **`+` / `−` per row (column 4).** `+` (`icon-add`) inserts a new action directly
  after this one (`handleInsertAction(i)` → splice at `i+1`); shown on every row.
  `−` (`icon-subtract`) removes the row (`handleActionRemove`); hidden on the first
  row (`isFirst`), with a 16px spacer kept so `+` stays aligned. Matches the
  reference, where `−` is gated on `index > 0`. Bottom `+ Add Action` still appends.
- **Rows are separated by divider lines** (`borderTop` on every row but the first),
  not individual cards — matching the reference's `divide-y`.
- **Stable row keys.** Action state is `rows: ActionRow[]` where
  `ActionRow = { id: string; action: ExportedAction }` (`id` via `uuid/v4`); the
  array index is unstable across move/insert. `actions = rows.map(r => r.action)`
  feeds the validator and save payload, so reorders/inserts persist automatically.
  `makeRow` also runs `withActionDefaults`.
- **Drag reorder.** `react-sortablejs` (`ReactSortable<ActionRow>`,
  `list={rows} setList={setRows}`), same lib as `SourceFilters.tsx`. Drag is
  restricted to the grip handle (`handle=".sa-action-drag-handle"`, a Font Awesome
  `fas fa-grip-vertical` from the vendored FA 5.15.3) so it never fights the row's
  selects/inputs.
- i18n keys: `Insert a new action after this one`, `Remove this action`,
  `Drag to reorder`, `seconds`.

`ActionRow` satisfies react-sortablejs's `ItemInterface` via its
`[property: string]: any` index signature; `setRows` is assignable to `setList`.

## 5c. Condition + instruction consolidation

Two rounds of simplification were applied to the conditions and instructions subsystems.

**Round 1 — de-duplication (earlier session):**

- **Derived `group`, dropped `name`.** Every condition entry used to repeat
  `group: 'fortnite'` (always the key prefix) and `name: 'game_started'` (never
  read anywhere). `ConditionDefinition` no longer declares them; `group` is
  injected once when building `Conditions` (`{ ...def, group: type.split('.')[0] }`,
  typed as `RegisteredCondition<K>`), and `name` is gone entirely.
- **Shared evaluators.** ~150 of ~188 conditions were the identical
  `({ state }) => state.pendingEvents.has('x')` check — now `evaluate: onEvent('x')`.
  `lowHealth` / `hasShield` / `noShield` cover the common threshold checks;
  `eliminationCount()` and `playersRemaining(max)` return the full repeated definitions
  (slider + evaluate). Bespoke logic (e.g. Minecraft's edge-triggered `low_health`) stays inline.
- **`ConditionType`** is now `keyof ConditionPropsMap` instead of a hand-written
  union of every game's `keyof XConditionPropsMap`.
- **Instruction word-limit suffix.** Every instruction string now holds just the creative
  prompt; `withWordLimit()` (`WORD_LIMIT = '8 words max.'`) appends the limit idempotently
  on export, so every emitted instruction still literally ends with it.

**Round 2 — flat files (2026-06-04):**

The `conditions/` and `instructions/` directories (26 files each) were merged into
two flat files at the engine root:

- **`conditions.ts`** — inlines all shared evaluator helpers, the full `ConditionPropsMap`,
  all type exports (`ConditionType`, `ConditionProps`, `ConditionDefinition`, `RegisteredCondition`,
  `TCondition`, `TEvaluatedCondition`), the `perGameConditions` registry, and the
  `Conditions`/`GAME_NAMES`/`ConditionsManager` exports. 52 files → 1.
- **`instructions.ts`** — all 25 game prompt maps inlined into one `perGameInstructions` const
  (typed with `satisfies Record<ConditionType, string>` so missing keys are a compile error),
  with `withWordLimit` applied on export. 26 files → 1.

No import paths changed — all consumers imported `from './conditions'` or
`from './instructions'`, which now resolve to the flat files.

**Expandability:** adding a game now means appending to two sections in two files,
with `satisfies Record<ConditionType, string>` enforcing that every condition key
has a corresponding instruction at compile time.

## 5d. Alphabetical game + condition ordering

The editor's two `<select>`s are sorted **at the point of display** rather than by
reordering the source registries, so new games/conditions sort automatically:

- `GAME_OPTIONS` (`AutomationEditor.tsx`) → `.sort((a, b) => a.name.localeCompare(b.name))`
  (by display name, e.g. Apex Legends, Battlefield 6, Call of Duty: Black Ops 6, …).
- `getConditionOptions(gameId)` → `.sort((a, b) => a.label.localeCompare(b.label))`
  (by condition label, within the selected game).

`localeCompare` gives human-alphabetical order. The default-selected condition is
now `conditionOptions[0]` (alphabetically first). `GAME_NAMES` and the per-game
condition files keep their authoring order — ordering is purely a render concern.

## 6. Internationalisation (i18n)

Desktop's `$t` is VueI18n. **en-US is bundled** from `app/i18n/fallback.ts`, NOT
read from the `en-US/` folder at runtime — so a new dictionary file only takes
effect once it's `require`d in `fallback.ts`. VueI18n only interpolates `%{}` for
keys present in the dictionary; new unregistered strings render the placeholder
literally (this was an earlier visible bug with `%{name}`).

Done:
- Added **`app/i18n/en-US/stream-avatar-automations.json`** — all 47 user-facing
  strings of the feature (launcher, list, editor, validation), with `%{name}` /
  `%{max}` placeholders preserved.
- Registered it in **`app/i18n/fallback.ts`**.

Effect: `%{}` now interpolates natively for en-US, and since `en-US` is the
`fallbackLocale`, other locales inherit the interpolatable string before they're
translated. The manual `t()` helper in `validation.ts` is now redundant but left
in as harmless defensive code.

---

## 7. Files touched (quick index)

**Created**
- `app/services/stream-avatar/engine/conditions.ts` — flat merge of `conditions/` directory (see §5c round 2).
- `app/services/stream-avatar/engine/instructions.ts` — flat merge of `instructions/` directory (see §5c round 2).
- `app/services/stream-avatar/engine/validation.ts`
- `app/i18n/en-US/stream-avatar-automations.json`
- `AUTOMATIONS_MIGRATION.md` (this file)

**Deleted**
- `app/services/stream-avatar/engine/conditions/` (entire directory — 27 files including `index.ts`, `shared.ts`, and 25 per-game files).
- `app/services/stream-avatar/engine/instructions/` (entire directory — 26 files including `index.ts` and 25 per-game files).

**Edited**
- `app/services/stream-avatar/engine/actions.ts` — `defaultExportedProps`, `withActionDefaults`, removed debug log, `as never` fix.
- `app/services/stream-avatar/automations-engine-service.ts` — `simulateAutomation(id)`.
- `app/components-react/windows/stream-avatar-automations/EditAutomations.tsx` — validation error icon, play/Test button + `Spin` + `simulatingId`, live scenes/sources.
- `app/components-react/windows/stream-avatar-automations/EditAutomations.m.less` — `.errorIcon`, `.disabledIcon`.
- `app/components-react/windows/stream-avatar-automations/AutomationEditor.tsx` — shared validation, inline errors/red borders, removed Enabled control, `withActionDefaults` wiring, **drag-and-drop reorder + insert-between** (`react-sortablejs`, `ActionRow` stable ids), **alphabetical game/condition sorting** (see §5d).
- `app/i18n/fallback.ts` — registered the automations dictionary.

---

## 8. Known gaps / next steps

1. **Registry labels not translatable.** Action/condition/game labels come from
   `ActionRegistry`, `Conditions`, `GAME_NAMES` and are rendered directly (not via
   `$t`), so they stay English regardless of locale. Wrapping them is a larger
   pass: wrap at each render point (`ACTION_OPTIONS` / `summarizeActions` /
   `conditionLabel` / `GAME_OPTIONS`) and add the label strings to the dictionary.
2. **Full CLI build not yet run clean.** The shell safety classifier was
   intermittently unavailable, so `tsc` / `yarn compile` wasn't confirmed end-to-end.
   Run `npx tsc --noEmit` from `desktop/` (or `yarn compile` in CI) to confirm the
   §5c round-2 flat-file consolidation is clean. The `satisfies Record<ConditionType, string>`
   on `perGameInstructions` provides a compile-time guard that every condition key
   has a matching instruction.
3. **Diagnostic `console.log`s** remain in `automations-service.ts` (fetchAll raw
   response logging — see `.claude/plans/immutable-prancing-pancake.md`),
   `agent-socket-service.ts`, and backend controllers/repos. Strip once the socket
   path is confirmed working. `console.warn` lines in the engine are intentional.
4. **Non-destructive simulation** mode (optional) — see §4 note.

---

## 9. How to resume

1. Open the list modal via the **Edit Automations.** button in `SceneSelector`.
2. Verify: validation icons appear for automations referencing deleted
   scenes/sources; the editor blocks invalid saves and shows inline errors; the
   play button runs + reverts an automation with an accurate spinner; a
   default-position `wait_for_ms` saves `duration: 5000`.
3. Pick up from §8 — most likely the registry-label i18n pass and a clean
   `yarn compile`, then the `console.log` cleanup once the backend round-trip is
   confirmed.
