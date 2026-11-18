import { defineConfig } from 'vitest/config';

// Tests that call a real PSP in test mode. Run with `pnpm test:live`; they
// are not part of `pnpm test` or CI.
export default defineConfig({
  test: {
    globals: true,
    include: ['live/**/*.live.ts'],
    testTimeout: 60_000,
    // One at a time: the cases share an account and its rate limit.
    fileParallelism: false,
  },
});
