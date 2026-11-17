---
name: open-pr
description: Open or update a Tenderlane pull request in the slim house style. Use whenever creating, updating or describing a PR, or finishing a task that will be reviewed on GitHub.
---

# Opening a pull request

Only open a PR when the user asked for one.

## Before you write it

1. `pnpm build && pnpm test && pnpm typecheck` on the commit you will push. Keep the output.
2. A fresh-context reviewer has run the `payment-review` skill over `git diff origin/main...HEAD`, at most three fix-and-review rounds. Keep the counts.
3. A change to `packages/*/src` has a changeset.
4. A change under `docs-site/` or `examples/` has before and after captures (`visual-evidence` skill).

## Write it

Fill `.github/pull_request_template.md`. Do not add headings.

- Title: conventional commit, `type(scope): what changed`, scope is the package (`core`, `client`, `react`, `stripe`, `polar`, `docs-site`, `examples`).
- **Change** and **Why**: one sentence each, written for a user of the library.
- **Before → After**: the smallest thing that shows the difference. For a library change, one input and output, a type error, or the test that failed and now passes. For a visual change, a screenshot above any recording. Headings or alt text say `before` and `after`. A recording is a bare `https://github.com/user-attachments/assets/...` URL on its own line.
- Everything above `<details>` stays under 100 words. Review focus, evidence, and risk go inside it.
- **Evidence** names the tested commit, what each check printed, the review rounds, and what was not verified.

## Do not

- Paste full test logs, restate the diff, or list files changed.
- Claim `pnpm lint` passed while it runs nothing.
- Use after-only screenshots, or code and terminal screenshots as visual evidence.
