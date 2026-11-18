---
name: visual-evidence
description: Capture before and after screenshots and a recording for a change to the docs site or the example checkout app, for embedding in a pull request. Use before and after editing anything under docs-site/ or examples/, or when a PR needs visual proof.
---

# Visual evidence

Required for a diff under `docs-site/src/**` or `examples/**/app/**`. CI (`pr-rules`) fails the PR without an image in the description. Anything else: no screenshots; show an input and output instead.

## Run the surface

- Docs site: `pnpm docs:dev`.
- Example checkout: `pnpm example`. Without keys it runs against the built-in demo PSP, which is enough to capture the routing and the hosted round trip. The Stripe and Polar routes need test keys from `examples/react-checkout-multi-psp/.env.example`; say which setup a capture shows.

Read the port from the server's output.

## Capture

```bash
node tools/shot.mjs <url> <name>            # desktop 1280 and phone 390 PNGs
node tools/shot.mjs <url> <name> --record   # also a .webm of the page while you script it
```

First run on a machine: `pnpm exec playwright install chromium` (the recording needs Playwright's ffmpeg). Where a browser is already installed, point at it with `CHROME=/path/to/chrome`.

Files land in `.evidence/` (git-ignored) as `<name>_desktop.png` and `<name>_phone.png`.

1. Before you edit, capture every route the change touches: `before_<route>`.
2. After, capture the same URLs: `after_<route>`. Same viewport, same scroll position.
3. For an interactive flow (currency switch re-routing the PSP, payment method selection), record one short run. Do not keep a failing run.
4. Verify like a user first: click, type, switch context, submit. One render is not verification.

## Embed

Put one useful screenshot above anything that plays, so there is something to see before it
loads. Desktop before and after go under **Before → After**; phone captures and extra pages go
inside the collapsed block. Alt text says `before` or `after` and what the page is.

Drag the files into the PR description where you can. Where you cannot upload (an agent without
access to GitHub's attachment store), push them to an orphan branch named `pr-evidence/<number>`
and link them as `https://github.com/<owner>/<repo>/raw/pr-evidence/<number>/<file>`. The branch
shares no history with `main`; delete it after the merge. Never commit captures to a branch that
will be merged.

## The journey

`pnpm test:journey` builds nothing: start the example first (`pnpm example`), then run it. It
drives the checkout in a real browser against the demo provider, fails if a step does not behave,
and writes `journey_*.png` (and a `.webm` where Playwright's ffmpeg is installed) to `.evidence/`.
CI runs it on every PR and keeps the files as the `journey-evidence` artifact, so the captures
come from the commit under review, not from someone's laptop.
