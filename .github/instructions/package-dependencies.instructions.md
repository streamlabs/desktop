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
