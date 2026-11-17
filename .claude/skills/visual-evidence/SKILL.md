---
name: visual-evidence
description: Capture before and after screenshots and a recording for a change to the docs site or the example checkout app, for embedding in a pull request. Use before and after editing anything under docs-site/ or examples/, or when a PR needs visual proof.
---

# Visual evidence

Required for a diff under `docs-site/src/**` or `examples/**/app/**`. CI (`pr-rules`) fails the PR without an image in the description. Anything else: no screenshots; show an input and output instead.

## Run the surface

- Docs site and playground: `pnpm docs:dev` (the playground needs no PSP keys).
- Example checkout: `pnpm build && pnpm --filter nextjs-multi-psp-checkout-example dev`. It needs Stripe test keys from `examples/react-checkout-multi-psp/.env.example`; without them, capture the docs-site playground instead and say so.

Read the port from the server's output.

## Capture

```bash
node tools/shot.mjs <url> <name>            # desktop 1280 and phone 390 PNGs
node tools/shot.mjs <url> <name> --record   # also a .webm of the page while you script it
```

First run on a machine: `pnpm exec playwright install chromium` (the recording needs Playwright's ffmpeg).

Files land in `.evidence/` (git-ignored) as `<name>_desktop.png` and `<name>_phone.png`.

1. Before you edit, capture every route the change touches: `before_<route>`.
2. After, capture the same URLs: `after_<route>`. Same viewport, same scroll position.
3. For an interactive flow (currency switch re-routing the PSP, payment method selection), record one short run. Do not keep a failing run.
4. Verify like a user first: click, type, switch context, submit. One render is not verification.

## Embed

Drag the files into the PR description, or attach them with `gh pr comment --attach` where available. Put the before and after under **Before → After**, phone captures inside the collapsed block. Never commit captures to the repository.
