---
applyTo: '**'
---

# PR Description Review Instructions

Review the PR description (not the code) for the two sections in `.github/pull_request_template.md`: **Description** and **QA Instructions**. Leave a review comment only when a section needs improvement. If both are adequate, say nothing.

## Description
Flag the description if it does not answer:
- What problem is solved or what feature is added, and why?
- For refactors: does behavior change? State "no behavior change" explicitly if not.

## QA Instructions

Decide in this order:

1. **No QA needed.** If the change has no user-facing effect (code cleanup, dependency bump, CI, docs), suggest replacing the section content with a single line: `No QA needed`.
2. **Section is populated.** Check that each step is concrete and testable (names the screen, action, and expected result). Flag vague steps such as "verify it works".
3. **Section is empty or minimal.** Suggest steps using the guidance below.

### Format
Steps must be a bulleted list, one `-` bullet per line, one action or check per bullet.

### Writing suggested steps
- Base steps on the diff. Keep them brief and actionable.
- Use 1–5 steps. Scale to the size of the change.
- By change type:
  - **UI:** how to reach the changed screen, and what should look or behave correctly.
  - **Service/logic:** how to trigger the affected code path.
  - **Fix:** how to reproduce the original issue, then confirm it is resolved.
  - **Refactor:** how to confirm the feature still works end to end.
- Check for adjacent impact. If the change touches shared code (services, stores, common components), add one or two steps for the other features that depend on it, if the current steps omit them.

### Example (illustrative only; write steps for the actual diff)
A PR that adds pinned apps to the nav menu has no QA instructions. Suggest:

> **Suggested QA Instructions:**
> - Install a platform app from the store and confirm it appears in the nav menu
> - Uninstall the app and confirm it is removed from the menu
> - Reinstall the app and confirm it is pinned again
