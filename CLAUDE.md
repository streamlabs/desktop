# CLAUDE.md

Guidance for AI agents working in this repository. Keep this file lean — it loads
into every session. Deep architecture lives in `ARCHITECTURE.md` (read it when a
change touches the window/service/state/IPC model).

This is **Streamlabs Desktop** (`slobs-client`): an Electron live‑streaming app
built on OBS. Large, old, and mid‑migration on two fronts (Vue → React for UI,
Vuex → Realm/React for state), with several non‑obvious invariants. Read the
relevant service before editing it; prefer targeted reads over broad assumptions.

## Commands

Package manager is **Yarn Berry (3.1.1)** — never use `npm`.

| Task | Command | Notes |
| --- | --- | --- |
| Lint + format | `yarn eslint` | Prettier runs *through* ESLint (`eslint-plugin-prettier`). `eslint --fix` formats. |
| Iterative dev build | `yarn watch` | Webpack watch; use this while developing. |
| One‑shot dev build | `yarn compile` | Slow: clears `bundles/media` and rebuilds everything. Don't run casually. |
| Run the app | `yarn start` | Launches Electron against the last build. |
| Single test file | `yarn test:file <path>` | Compiles tests, runs one file. |
| Full test suite | `yarn test` | **Heavy/slow e2e** — see Testing below. Don't run unless asked. |

There is **no standalone typecheck script**; types are checked by `ts-loader`
during `yarn compile`/`yarn watch` (tests via `tsc -p test`). For correctness,
reason about types locally and run `yarn eslint` rather than triggering a full build.

## Code style

- TypeScript, formatted by Prettier via ESLint. **Don't memorize the rules** —
  let `yarn eslint` (`--fix`) apply them, and match the surrounding file.
- `strictNullChecks` is **intentionally OFF** globally. Do **not** enable it
  repo‑wide. A subset of files opts in via `strict-null-check-files/` +
  `SLOBS_STRICT_NULLS`; only add to that set deliberately.

## Architecture in one screen

Multi‑window Electron app. Every window runs the *same* JS bundle but plays a
different role:

- **worker** — invisible, persistent renderer that runs the **entire services
  layer**. All service methods actually execute here.
- **main** — the primary UI window.
- **child** — kept warm in the background for things like Source Properties.
- plus transient **one‑off** windows (projectors, pop‑outs), apps, webviews.

The UI windows (main, child, one‑off) **don't run services** — they call them
remotely. A call from any non‑worker window is sent to the **Electron main
process** (`main.js`), which forwards it to the **worker** window, then routes the
result back to the originating window. Note: the *main process* (`main.js`, Node)
is the router — **not** the *main window*, which is just another UI client.

**Services** (`app/services/`) are strict singletons holding all domain logic.
Normal application code reaches a service through the `@Inject()` decorator. They're
registered in `app/app-services.ts`.

## State — know which mechanism to use

State management is **mid‑migration**. For new code, choose by scope:

- **UI‑only state** → React state (`useState` / hooks), local to the component.
- **Service state that must sync across windows/processes** → **Realm**
  (`RealmObject` / `RealmService` in `app/services/realm.ts`), which replicates
  across all processes. React reads it via `app/components-react/hooks/realm.ts`.

Much existing service state still lives in **Vuex** via `StatefulService<TState>`
(read through `this.state`, mutated only via `@mutation()` methods). You'll
maintain it where it already exists, but **don't reach for Vuex for new state.**

See `ARCHITECTURE.md` for the full model and the *why* behind the sharp edges.

## Hard rules (these are easy to get wrong)

1. **Vuex mutations are pure.** When editing an existing `StatefulService`, a
   `@mutation()` method may touch only `this.state` and its own arguments — no side
   effects, no calling other services, no async. In dev a Proxy enforces this and
   throws (`app/services/core/stateful-service.ts:49`).
2. **Calling a service from a UI window — pick the right form:**
   - `Service.actions.method()` — **default**. Async, fire‑and‑forget, returns
     `void`.
   - `Service.actions.return.method()` — async **with** a return value (resolves
     when the worker finishes). Use sparingly.
   - `Service.method()` (omit `.actions`) — **synchronous**; it blocks the calling
     UI process and logs a console warning. Avoid except where absolutely
     necessary — it degrades the user experience.
   - Reads: use `views` (Vuex) or read Realm objects directly.
3. **Register new services** in `app/app-services.ts` — it's hand‑maintained, not
   generated. A service that isn't registered won't resolve.
4. **New UI is React.** Functional components + hooks only, in
   `app/components-react/` (`.tsx`). Vue (`app/components/`, `.vue`) is legacy and
   frozen — only touch it to migrate a component to React.
5. **Don't edit generated/build output:** `bundles/`, `*.g.less`, `updater/build/`,
   `dist/`, `test-dist/`, `docs/dist/`.
6. **Honor in‑code warnings.** Respect `DO NOT CALL` / `@warning` markers — e.g.
   `app/services/sources/sources.ts` `updatePropertiesManagerSettingsInStore`,
   and the deprecated method in `app/services/video.ts`.

## Conventions

- Filenames map to classes: `foo-bar.ts` → `class FooBarService`.
- Common decorators: `@Inject()` (DI), `@mutation()` (Vuex mutation),
  `@InitAfter('OtherService')` (ordered init), `@InheritMutations()`.
- Service lifecycle hooks: `init()` (once per app) → `mounted()` (once per window)
  → `afterInit()`.
- Cross‑service / cross‑window events use **RxJS** `Subject`s.

## Testing

Tests are **integration/e2e via WebdriverIO** — they launch the real Electron app
and drive it, run **serially**, and are slow. They are not fast unit tests. Run a
single file with `yarn test:file <path>` when iterating; avoid the full `yarn test`
suite (and `yarn package`) unless explicitly asked.

## Where things live

| Path | What |
| --- | --- |
| `main.js` | Electron main process: windows, IPC routing, updater, logging. |
| `app/app.ts` | Renderer bootstrap (services, i18n, Sentry). |
| `app/app-services.ts` | Central service registry. |
| `app/services/` | All services (domain logic). |
| `app/services/core/` | Service base, `StatefulService`, DI, mutations. |
| `app/services/realm.ts` | Realm‑backed cross‑process state. |
| `app/services-manager.ts` | Service instantiation + IPC proxying. |
| `app/services/api/internal-api-client.ts` | Client side of cross‑window service calls. |
| `app/store/` | Vuex store + cross‑window mutation sync (legacy). |
| `app/components-react/` | React UI (current). |
| `app/components/` | Vue UI (legacy). |
| `test/` | e2e/stress/screen/performance tests + helpers. |

## Useful env vars (dev)

`SLOBS_REPORT_TO_SENTRY`, `SLOBS_PRODUCTION_DEBUG` (open dev tools on start),
`SLOBS_CACHE_DIR`, `SLOBS_FORCE_AUTO_UPDATE`, `SLOBS_STRICT_NULLS`. See README for
the full list.
