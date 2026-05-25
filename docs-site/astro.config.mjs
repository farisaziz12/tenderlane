import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import remarkDirective from 'remark-directive';
import remarkCallouts from './src/lib/remark-callouts.mjs';

// `BASE_PATH` is set by the PR-preview workflow to publish each PR under
// /tenderlane/pr-preview/pr-<N>/. Falls back to /tenderlane for production.
const base = process.env.BASE_PATH ?? '/tenderlane';

export default defineConfig({
  site: 'https://farisaziz12.github.io',
  base,
  trailingSlash: 'ignore',
  integrations: [mdx()],
  markdown: {
    remarkPlugins: [remarkDirective, remarkCallouts],
    shikiConfig: {
      theme: 'github-dark-default',
      wrap: false,
    },
  },
});
