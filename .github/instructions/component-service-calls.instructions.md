---
applyTo: 'app/services/**,app/components/**,app/components-react/**'
---

# Service Architecture Invariants

This repo is mid-migration on two axes (Vue -> React, Vuex -> Realm/React) and has several non-obvious invariants around how UI code is allowed to call into services. When code reviewing a PR, check for the following.

## Wrong service call form from UI code

`SomeService.method()` (no `.actions`) called from a file under `app/components/**` or `app/components-react/**` is a **synchronous** IPC call that blocks the calling renderer until the worker replies. Flag any such call in changed UI code and recommend one of:

- `SomeService.actions.method()` — default, fire-and-forget, returns `void`.
- `SomeService.actions.return.method()` — async, resolves with the return value. Use when the
  caller needs the result.

If the caller uses a return value from a bare `Service.method()` call, flag it as broken, not just discouraged — `.actions.method()` returns `void`.

## Vuex mutation purity

A method decorated with `@mutation()` may only read/write `this.state` and its own arguments. Flag any `@mutation()` method body that:

- calls `await` or otherwise performs async work,
- calls another service or a method outside the mutation itself,
- has any other side effect (logging aside).

This is enforced by a dev-only runtime check, so a violation that isn't exercised by a test or manual QA pass ships silently. Catching it in review matters even though "it would throw in development" is technically true.

## Restricted-call markers

Flag any new call to a function or method whose docstring contains `DO NOT CALL` or `@warning`, unless the call site is the specific sanctioned caller the docstring names. Known instances today: `app/services/sources/sources.ts` (`updatePropertiesManagerSettingsInStore` — callable only from the base `PropertiesManager` class), `app/services/streaming/streaming-view.ts`, and `app/services/video.ts`.

## `window['servicesManager']` / `window.sm`

`window['servicesManager']` is load-bearing production plumbing with a fixed set of existing call sites (`ViewHandler.getServiceViews`, `service-helper.ts`); flag any new one. `window.sm` is a dev-console-only debug handle — flag any use of it in application code.

## New service not registered in `app-services.ts`

`app/app-services.ts` is the hand-maintained, non-generated central service registry — a service that isn't listed there won't resolve. Flag any diff that adds a new class extending `Service` (or a `StatefulService`) under `app/services/**` without a matching addition to `app/app-services.ts` in the same diff.

## New Vue components

Flag any new file added under `app/components/**/*.vue`. New UI must be built as a React functional component under `app/components-react/**` instead — Vue is legacy and frozen except for migrating an existing component to React.

## Side-effecting work during render

Flag any service call, controller `init()`, or other side-effecting work invoked directly inside a render-phase `useMemo` or a component's render body (as opposed to inside a`useEffect`/`useLayoutEffect` or an event handler). This runs once per _consuming component_ rather than once per mount, which both duplicates the work (e.g. redundant network/service calls) and can trigger "Cannot update a component while rendering a different component."
