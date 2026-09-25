---
applyTo: '.github/instructions/**'
---

# Writing instructions

- Every `*.instructions.md` file must begin with valid YAML frontmatter enclosed by `---` delimiters and include an `applyTo` glob specifying its scope.
  Copilot reads `applyTo` from this metadata to automatically apply the instructions to matching files. Without the delimiters, `applyTo` is ordinary Markdown text, not configuration, so automatic scope matching will not work. Keep the frontmatter even if it appears redundant to a human reader.

# Receiving new or updated instructions

When code reviewing a PR that includes changes to instructions:

- If any instructions appear unclear or confusing, ask clarifying questions in review comments on the unclear line(s).
- If there are no clarifying questions needed, summarize the new or changed instructions in a general review comment.
