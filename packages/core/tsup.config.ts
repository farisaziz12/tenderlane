import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'server/index': 'src/server/index.ts',
    'adapters/index': 'src/adapters/index.ts',
  },
  format: ['esm'],
  dts: true,
  // Shared chunks: the entry points must share one copy of the error classes,
  // or `instanceof` fails between `@tenderlane/core` and `@tenderlane/core/server`.
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  outDir: 'dist',
});
