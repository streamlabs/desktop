---
applyTo: '**'
---

# Reverts can leave dangling references

When code reviewing a PR that reverts one or more prior commits (title contains "Revert", or the PR description lists reverted commits/PRs), check whether anything the revert deletes (e.g., a CSS class/rule, an exported constant or function, a config value, a translation key) is still referenced elsewhere in the codebase outside the files this diff touches.

This matters most for bulk reverts that bundle several unrelated commits into one revert PR: the diff only touches the files the reverted commits touched, not every file that reads what those commits defined, so a still-live reference to a just-deleted definition won't appear anywhere in the diff itself.

Flag any deleted definition whose only usages you can find are outside this diff's changed files, since that's the shape of a silent regression: no error, no failing test, just a reference that now resolves to nothing.
