import { defineConfig } from 'vitest/config';

// Tests that call a real PSP in test mode. Run with `pnpm test:live`; they
// are not part of `pnpm test` or CI.
export default defineConfig({
  test: {
    globals: true,
    include: ['live/**/*.live.ts'],
    // Longer than the settle poll in the suite, so a slow debit fails on the
    // assertion and not on the clock.
    testTimeout: 120_000,
    // One at a time: the cases share an account and its rate limit.
    fileParallelism: false,
  },
});
