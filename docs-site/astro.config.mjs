import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import remarkDirective from 'remark-directive';
import remarkCallouts from './src/lib/remark-callouts.mjs';

export default defineConfig({
  site: 'https://farisaziz12.github.io',
  base: '/tenderlane',
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
