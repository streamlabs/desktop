---
applyTo: 'app/components/**,app/components-react/**,test/**'
---

# Tracking stale test selectors after a rename

When code reviewing a PR, check for any changes to the value of a `data-name`, `data-role`, `data-type`, or `name` prop on a component, where that prop is used to build a test selector (directly, or via a shared input wrapper like `useInput` in `app/components-react/shared/inputs/inputs.ts`, which turns a `name` prop into a `data-name` DOM attribute).

If such a value is renamed or removed, search `test/**` for the **old** literal string (e.g. `'old-value'` inside a `clickToggle(...)`, `select(...)`, or a raw `data-name="old-value"` selector). If found, flag it: the test is very likely referencing a selector that no longer exists in the app and needs to be updated to the new value.

Do not flag a rename where the old string is not referenced anywhere in `test/**` — only report an actual stale reference, not every rename.

# Ensuring selector hygiene

When code reviewing a PR, check for tests that use base CSS class selectors instead of `data-*` or `name` attributes. Our CSS modularization appends a hash to any CSS classes that aren't flagged as `:global` class names or aren't icon (`.icon-*`) class names, and thus can lead to selectors not being found.

Ensure that CSS class selectors in tests are flagged as a potential weak point for test failure and that a `data-*` attribute should be preferred, except for `.icon-*` selectors, which are global and may be used safely.