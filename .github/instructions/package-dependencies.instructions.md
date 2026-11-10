---
applyTo: 'package.json'
---

# Reviewing dependency placement

When code reviewing dependency placement in `package.json`, verify the current manifest rather than relying on a diff hunk, prior review context, or the package's expected classification.

Before reporting that a package should move between `dependencies`, `devDependencies`, `optionalDependencies`, or `peerDependencies`:

- Locate the named package in the current `package.json`.
- For a finding that a package in `dependencies` should be in `devDependencies`, verify that it is actually in `dependencies` and not in `devDependencies`.

“Should be in `devDependencies`” is only valid when the package is not already in `devDependencies`.

Do not report a dependency-placement finding when the named package is already in the proposed section. State the verified current section in every dependency-placement finding.

# Reviewing Electron version bumps

When code reviewing a PR that changes the `electron` version in `package.json`, check that `electron-chromedriver` is changed to the same version in the same PR. The e2e suite drives the app through `electron-chromedriver`, so a mismatch tests against a different Chromium than the one that ships.

- Flag a PR that changes `electron` and leaves `electron-chromedriver` at its previous version. State both versions in the finding.
- `electron-chromedriver` doesn't publish every Electron patch release. If the PR's description says the exact version isn't published, accept the newest `electron-chromedriver` with the same major and minor version.
- Do not flag a PR that changes only `electron-chromedriver`. That is fixing an existing mismatch.
