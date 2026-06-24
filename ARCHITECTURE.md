# Architecture

> **Scope.** This document describes the **core platform** of Streamlabs Desktop —
> the process/window model, the services layer, cross‑window communication, and
> state management. It deliberately does *not* cover feature domains (streaming,
> scenes/sources, platforms, widgets, etc.); those may get their own docs later.
>
> **Conventions.** Non‑obvious claims name the source file (and the relevant
> function or symbol) rather than a line number — grep the symbol to find the code,
> and the reference stays valid as the code moves. Sharp edges and non‑obvious
> invariants are collected in [Known wrinkles](#6-known-wrinkles).
>
> **Keeping this current.** Treat it like the matklad model: document the things
> that change *slowly* (the boundaries and invariants) and point at code for the
> rest. When a change alters one of those boundaries, update this file in the same
> PR.

---

## 1. The big picture

Streamlabs Desktop is an Electron app. Electron gives us two kinds of process:

- one **main process** (Node.js) — this is `main.js`, the entry point named in
  `package.json` `"main"`. It owns windows, native lifecycle, the updater,
  logging, and **routes all inter‑window IPC**. It is *not* a UI.
- many **renderer processes** — Chromium windows, each running the same compiled
  bundle but parameterised by a `windowId` URL query (`main.js`, the
  `loadURL(...?windowId=…)` calls).

The renderers are not peers of equal responsibility. Exactly one — the **worker**
window — runs the entire services layer and hosts the native OBS backend. Every
other window is a UI client that *calls* services remotely.

```
   ┌─────────────────────────┐          ┌──────────────────────────────┐
   │ UI windows (renderers)  │          │  worker window (renderer)    │
   │ main / child / one-off  │          │  • runs ALL services         │
   │ • Vue + React UI        │          │  • hosts obs-studio-node     │
   │ • InternalApiClient     │          │  • executes calls; emits     │
   │   turns calls into IPC   │          │    results + events          │
   └────────────┬────────────┘          └───────────────┬──────────────┘
                │                                        │
                │   renderers never message each other directly —
                │   every request / response / event hops through main.js
                │                                        │
   ┌────────────▼────────────────────────────────────────▼─────────────┐
   │              Electron main process — main.js  (Node)               │
   │   The "router": a process in its own right (Electron's main        │
   │   process), but NOT a window. Forwards each service-request from a  │
   │   UI window to the worker, routes the response back, and relays     │
   │   vuex-mutation / services-message between windows.                 │
   └────────────────────────────────────────────────────────────────────┘
```

**The single most misunderstood point:** the *main process* (`main.js`) is the
router — **not** the *main window*. The main window is just another UI client,
exactly like the child window. Service calls from any UI window go through the
main process to the **worker** window; the main window is never in that path.
(`main.js`, `sendRequest` and the `services-request` handlers; the worker is the
only window that runs services — `app/services-manager.ts` `init`, and the worker
branch of the `DOMContentLoaded` handler in `app/app.ts`.)

---

## 2. Windows

All windows load the same bundle; behaviour is selected by `windowId` (`app/app.ts`,
the root component's `render` switch on `windowId`).

| Window | Created | Role |
| --- | --- | --- |
| **worker** | `main.js` (`workerWindow` creation) | Invisible (`show: false`), persistent. Runs the entire services layer and hosts OBS (`app/app.ts`, the `isWorkerWindow()` branch). |
| **main** | `main.js` (`mainWindow` creation) | The primary application UI. A service *client*, not a host. |
| **child** | created/kept warm by `WindowsService` | Always running, hidden until needed (e.g. Source Properties) because spinning up a window is slow (`README.md`, Development). |
| **one‑off** | on demand | Transient windows: projectors, pop‑outs, etc. Also clients. |

Plus other JS runtimes for Apps, embedded webviews, and the like (`README.md`,
Development).

**Security posture worth knowing:** worker and main windows run with
`nodeIntegration: true` and `contextIsolation: false` (`main.js`, the
`BrowserWindow` `webPreferences`). This is why renderer code can `require` Node
modules and use `@electron/remote` directly. Treat anything loaded into these
windows as fully privileged.

**Shutdown ordering** is deliberate: closing the main window triggers a
`shutdown` message to the worker with a 10‑second grace period (`main.js`,
`mainWindow.on('close')`); the worker window refuses to close first so test
teardown and `App.stop()` behave (`main.js`, `workerWindow.on('close')`).

---

## 3. The services layer

Domain logic lives in **services** under `app/services/`. A service is a strict
singleton; the base class is `app/services/core/service.ts`.

### 3.1 Singletons

`Service` enforces single‑instance construction with a symbol guard — you cannot
`new` a service yourself (`service.ts`, `createInstance` and the `singletonEnforcer`
guard). Access is always through the static `instance` getter (`service.ts`).

### 3.2 Registration and lookup

Every service is hand‑registered in `app/app-services.ts`. `ServicesManager`
(`app/services-manager.ts`) holds that registry (the `services` map) and resolves
names to instances/helpers (`getResource`). A service that isn't registered cannot
be resolved.

### 3.3 Dependency injection

Normal application code reaches a service through the `@Inject()` decorator, which
defines a lazy getter resolving the service by property name (or an explicit name)
at access time (`app/services/core/injector.ts`, `Inject`).

`getResource<T>(name)` (`injector.ts`) and `ServicesManager.getResource`
(`services-manager.ts`) also exist, but these are **plumbing** — for infrastructure
(the IPC layer, serialization) and for poking at services from a dev console.
Application code should use `@Inject()`, not `getResource`.

### 3.4 Lifecycle

Created via the factory `createInstance` (`service.ts`), in this order:

1. `init()` — once per application lifetime.
2. `mounted()` — once per window.
3. `afterInit()` — once per app, after observers are listening.

(All three are defined on `Service` in `service.ts`.) Services can observe another
service's initialization with `@InitAfter('Other')`; `ServicesManager.initObservers`
wires this up off the `serviceAfterInit` subject in the worker.

### 3.5 The worker/non‑worker split (key mechanism)

`ServicesManager.init` (`services-manager.ts`) branches on whether it is running in
the worker:

- **Non‑worker windows:** install an IPC proxy over *every* service via
  `Service.setupProxy(...)`, and replace the init function with a no‑op via
  `Service.setupInitFunction(...)`. So in a UI window, "calling a service" actually
  produces an IPC request, and services do **not** run their `init()` locally.
- **Worker window:** no proxy; services run for real, and the `InitAfter`
  observer wiring is enabled.

This single branch is what makes the same service class behave as a *local object*
in the worker and a *remote stub* everywhere else.

---

## 4. Cross‑window communication (the service RPC)

This is the heart of the platform. A method call in a UI window has to execute in
the worker and return a serializable result. The path has three parts: a client
proxy, the main‑process router, and a worker‑side executor. The wire format is
JSON‑RPC (`app/services/api/jsonrpc`).

### 4.1 Client side — `InternalApiClient`

`app/services/api/internal-api-client.ts`. Instantiated in **every non‑worker (UI)
window — main, child, and one‑off alike** — by the proxy setup in
`ServicesManager.init` (`services-manager.ts`). The main window is *not* special
here: it goes through the same `InternalApiClient` as any other UI window.

`applyIpcProxy` wraps a service in a `Proxy` (`internal-api-client.ts`). When you
call a method it builds a JSON‑RPC request and ships it over IPC. There are three
call shapes, selected by how you access the method (all handled in
`getRequestHandler`):

| You write | Transport | Returns | When |
| --- | --- | --- | --- |
| `Service.actions.foo()` | `ipcRenderer.send('services-request-async')` with `noReturn:true` | `void` | **Default.** Fire‑and‑forget. |
| `Service.actions.return.foo()` | same async channel, `fetchMutations:true`, `noReturn:false` | `Promise<result>` (resolved later via the `services-response-async` handler in `listenWorkerWindowMessages`) | Need a return value. Use sparingly. |
| `Service.foo()` | `ipcRenderer.sendSync('services-request')` | result **synchronously** | Avoid — blocks the UI process. Logs a warning in dev. |

The `actions`/`return` accessors are matched literally in the `applyIpcProxy`
proxy. Methods marked `__executeInCurrentWindow` (via the `@ExecuteInCurrentWindow()`
decorator) bypass the proxy and run locally — this is how, e.g., Realm connections
are made per‑process (see §5.3).

Arguments and results that contain **service helpers** are serialized by reference
(`{_type:'HELPER', resourceId}`) and re‑wrapped on the other side (in
`getRequestHandler` and `handleResult`). Helpers themselves can't be proxied —
attempting to call a helper method through the client throws (in `applyIpcProxy`).

### 4.2 Router — the main process

A UI window's `ipcRenderer` send goes to `ipcMain` in `main.js`, never directly to
another renderer. `main.js` forwards every request to the worker and remembers how
to reply:

- The `services-request` and `services-request-async` handlers both call
  `sendRequest`, which does `workerWindow.webContents.send('services-request', …)`
  and stores the originating `event` keyed by request id (`main.js`).
- When the worker replies `services-response`, the `services-response` handler
  routes it back: sync requests resolve via `event.returnValue`, async via
  `event.reply('services-response-async', …)` (`main.js`).

There's a standing intent to eventually make renderers talk to the worker without
round‑tripping the main process (see the comment near `getWorkerWindowId` in
`main.js`), but today everything is proxied through it.

### 4.3 Worker side — `IpcServerService` + `RpcApi`

The worker registers a single handler, `ipcRenderer.on('services-request', …)`, in
`IpcServerService.listen` (`app/services/api/ipc-server/ipc-server.ts`), which
executes the request via `InternalApiService.executeServiceRequest` and sends a
`services-response` unless the request was `noReturn`.

`executeServiceRequest` lives in the shared base `app/services/api/rpc-api.ts`. Its
chain `executeServiceRequest` → `handleServiceRequest` → `serializePayload` looks up
the resource, invokes the method, and **serializes the payload into something
transferable**:

- a **plain value** → returned as‑is.
- an **RxJS `Observable`** → subscribed once; a `{_type:'SUBSCRIPTION', emitter:
  'STREAM'}` token is returned, and subsequent emissions are pushed as
  `services-message` events (`serializePayload`).
- a **`Promise`** → a `{_type:'SUBSCRIPTION', emitter:'PROMISE'}` token is returned
  immediately; when it settles, `sendPromiseMessage` emits a `services-message`
  event carrying the resolution/rejection.
- a **`Service` / helper / `RealmObject`** → serialized by reference (in
  `serializePayload`).

Events (stream emissions, promise settlements) flow worker → main process →
all non‑worker windows via `services-message` (`ipc-server.ts` `sendEvent`;
`main.js` the `services-message` handler; `internal-api-client.ts`
`listenWorkerWindowMessages`).

### 4.4 End‑to‑end: an async action with a return value

1. UI: `SomeService.actions.return.doThing(arg)`.
2. `InternalApiClient` sends `services-request-async` with `fetchMutations:true`
   (`getRequestHandler`).
3. `main.js` forwards to the worker, remembers the reply target (the
   `services-request-async` handler).
4. Worker `IpcServerService` runs `RpcApi.executeServiceRequest`; the method
   returns a `Promise`, so the worker first replies with a `PROMISE` subscription
   token plus any buffered mutations (`handleServiceRequest` / `serializePayload`).
5. When the worker‑side promise settles, a `services-message` PROMISE event is
   broadcast; the client matches it by id and resolves the caller's promise
   (`listenWorkerWindowMessages`).

---

## 5. State management

State is **mid‑migration between two systems**. Pick by scope:

- **UI‑only state** → React local state (`useState`/hooks).
- **Service state that must sync across windows/processes, or must persist to disk
  across application runs** → **Realm** (§5.3). Realm covers both: it has a
  persistent (on‑disk) database and an ephemeral (in‑memory) one.
- **Legacy** → **Vuex** via `StatefulService` (§5.2). Still pervasive; maintained
  where it exists, not chosen for new state.

### 5.1 Why state is hard here

Because services execute in the worker but UI renders in other windows, the UI
needs a *local, reactive* copy of state — it can't synchronously reach across
processes on every render. The two systems solve this differently: Vuex
**replicates** state by broadcasting mutations over IPC; Realm **shares** state at
the database layer, with each process holding its own connection.

### 5.2 Vuex / `StatefulService` (legacy)

`app/services/core/stateful-service.ts` + `app/store/index.ts`.

- A `StatefulService<TState>` gets an auto‑generated Vuex module; read state via
  `this.state`, which is just the service's slice of the store (`StatefulService.state`
  in `stateful-service.ts`). Modules are assembled in `createStore`
  (`store/index.ts`).
- State is mutated **only** through `@mutation()` methods (`mutation` /
  `registerMutation` in `stateful-service.ts`). **Mutations must be pure** — touch
  only `this.state` and their arguments, no side effects, no async. In dev a `Proxy`
  inside `registerMutation` enforces this and throws on any other access. The
  reason: a mutation has to be replayable in any window from its serialized
  payload, so it can't depend on worker‑only context.
- **Replication:** the store‑sync plugin (`store/index.ts`) subscribes to local
  commits and, for any non‑`__vuexSyncIgnore` mutation, both feeds it to the
  worker's mutation buffer and broadcasts it to other windows. The broadcast is
  queued and flushed on a timer to coalesce re‑renders
  (`sendMutationToRendererWindows` / `flushMutations`). The main process relays
  `vuex-mutation` to every *other* registered window (`main.js`, the
  `vuex-mutation` handler).
- **New window bootstrap:** a freshly opened window registers (the `vuex-register`
  send in `store/index.ts`), the main process asks the worker to dump current state
  (`main.js`, the `vuex-register` handler), and the window applies it via
  `BULK_LOAD_STATE` (the `vuex-loadState` handler in `store/index.ts`). **Ordering
  invariant:** a renderer window ignores incoming mutations until after that bulk
  load (`storeCanReceiveMutations` in `store/index.ts`), so early mutations are
  intentionally dropped to avoid applying deltas to a state that hasn't loaded yet.
- **Consistency on synchronous reads:** when a UI window makes a *synchronous*
  service call, the worker buffers any mutations produced during the call and
  attaches them to the response (`handleServiceRequest` with
  `startBufferingMutations`/`stopBufferingMutations` in `rpc-api.ts`), and the
  client commits them immediately before returning (`getRequestHandler` in
  `internal-api-client.ts`). This keeps the caller's local store consistent with the
  value it just received without waiting for the async broadcast.

### 5.3 Realm (current direction)

`app/services/realm.ts`, with a React hook at
`app/components-react/hooks/realm.ts`.

- Two databases: a **persistent** on‑disk realm (`persistent.realm` under
  `userData`) and an **ephemeral** in‑memory realm (`RealmService`,
  `persistentConfig` / `ephemeralConfig` in `realm.ts`). A `RealmObject` subclass
  declares which it belongs to at registration (`registerObject`). Choose the
  **persistent** DB for state that must survive across application runs (it's
  written to disk); the **ephemeral** DB for cross‑process state that needn't
  persist.
- **Each process opens its own connections** — `connect()` and `getDb()` are
  marked `@ExecuteInCurrentWindow()` so they run locally rather than being proxied
  to the worker (`realm.ts`); the worker triggers the initial `RealmService…connect()`
  during bootstrap (`app/app.ts`). Because every process points at the same
  realm(s), Realm propagates changes across all connections — that's the
  cross‑process sync, achieved without our IPC mutation broadcast.
- **Across the service RPC**, a `RealmObject` is passed by reference
  (`{_type:'REALM_OBJECT', resourceId, realmType}`) and reconstructed on the other
  side via `RealmService.registeredClasses[type].fromId(...)` (`serializePayload` in
  `rpc-api.ts`; `handleResult` in `internal-api-client.ts`). The receiving window
  then reads through its *own* local connection.

> **Note:** the ephemeral realm still propagates across processes despite being
> in‑memory — a file‑backed `inMemory` realm is shared by path, so every process's
> connection observes the same data.

### 5.4 Events (RxJS)

Cross‑service and cross‑window notifications use RxJS `Subject`s. Within the worker
they're ordinary subscriptions; when a subscription crosses the RPC boundary it
becomes a `STREAM` subscription delivered over `services-message` (§4.3).

---

## 6. Known wrinkles

These are real, load‑bearing quirks an agent (or human) will trip over.

- **`window['servicesManager']` global (production plumbing — leave it alone).**
  Set in `createStore` (`store/index.ts`, "This is bad and I should feel bad") to
  break an import cycle. It *is* load‑bearing: read by `ViewHandler.getServiceViews`
  (`stateful-service.ts`, which backs cross‑service `views` access in ~15+ services)
  and by `service-helper.ts`. Those existing uses stay. **Do not add new ones**, and
  never reach for it from application‑level services code.
- **`window.sm` — dev console only.** A debug handle on the services manager, set
  only in dev mode or under `SLOBS_PRODUCTION_DEBUG` (`services-manager.ts`, `init`).
  It's for poking at services from the console; never use it in real code or
  plumbing.
- **Sync IPC blocks the UI.** `Service.foo()` (no `.actions`) uses `sendSync` and
  freezes the calling renderer until the worker replies (`main.js`, `sendRequest`;
  `internal-api-client.ts`, `getRequestHandler`). Only acceptable where truly
  necessary.
- **Helpers can't be proxied.** Calling a helper method through the IPC client
  throws by design (`internal-api-client.ts`, `applyIpcProxy`).
- **`strictNullChecks` is off globally** with an opt‑in subset
  (`strict-null-check-files/`, `SLOBS_STRICT_NULLS`). Don't flip it repo‑wide.
- **Privileged renderers.** `nodeIntegration: true` / `contextIsolation: false`
  (`main.js`, the `BrowserWindow` `webPreferences`).

---

## 7. Key files

| File | Responsibility |
| --- | --- |
| `main.js` | Electron main process: window creation, IPC routing, mutation relay, updater, logging, shutdown. |
| `app/app.ts` | Renderer bootstrap; worker‑only OBS init; Realm connect; Vue root. |
| `app/services/core/service.ts` | Singleton base, lifecycle, `actions` proxy. |
| `app/services/core/injector.ts` | `@Inject()` and `getResource`. |
| `app/services/core/stateful-service.ts` | Vuex‑backed services, `@mutation()`, mutation‑purity proxy, `ViewHandler`. |
| `app/app-services.ts` | The service registry. |
| `app/services-manager.ts` | Instance management; worker/non‑worker proxy split; `InitAfter` wiring. |
| `app/store/index.ts` | Vuex store, mutation replication, bulk‑load bootstrap. |
| `app/services/api/internal-api-client.ts` | Client side of the service RPC (UI windows). |
| `app/services/api/ipc-server/ipc-server.ts` | Worker side: receives requests, returns responses/events. |
| `app/services/api/rpc-api.ts` | Request execution + payload serialization (Promises, Observables, helpers, Realm). |
| `app/services/realm.ts` | Realm databases, per‑process connections, cross‑process state. |

---

*Maintenance: this document covers the slow‑moving core‑platform boundaries and
invariants. When a change moves one of them, update this file (and its file +
symbol references) in the same PR.*
