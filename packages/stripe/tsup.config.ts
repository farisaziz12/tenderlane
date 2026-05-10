import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'server/index': 'src/server/index.ts',
    'react/index': 'src/react/index.ts',
  },
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: false,
  treeshake: true,
  outDir: 'dist',
  external: [
    '@tenderlane/core',
    'stripe',
    '@stripe/stripe-js',
    '@stripe/react-stripe-js',
    'react',
    'react-dom',
  ],
});
