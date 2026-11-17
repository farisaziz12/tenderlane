import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import remarkDirective from 'remark-directive';
import remarkCallouts from './src/lib/remark-callouts.mjs';
import remarkCodeTitles from './src/lib/remark-code-titles.mjs';

export default defineConfig({
  trailingSlash: 'ignore',
  integrations: [mdx()],
  markdown: {
    remarkPlugins: [remarkDirective, remarkCallouts, remarkCodeTitles],
    shikiConfig: {
      theme: 'github-dark-default',
      wrap: false,
    },
  },
});
