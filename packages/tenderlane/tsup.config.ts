import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    client: 'src/client.ts',
    react: 'src/react.ts',
    server: 'src/server.ts',
    stripe: 'src/stripe.ts',
    'stripe-server': 'src/stripe-server.ts',
    'stripe-react': 'src/stripe-react.ts',
  },
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: false,
  treeshake: true,
  outDir: 'dist',
  external: [
    'react',
    'react-dom',
    'stripe',
    '@stripe/stripe-js',
    '@stripe/react-stripe-js',
    '@tenderlane/core',
    '@tenderlane/client',
    '@tenderlane/react',
    '@tenderlane/stripe',
  ],
});
