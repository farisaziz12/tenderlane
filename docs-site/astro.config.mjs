import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: 'Tenderlane',
      description: 'Reactive payment orchestration for modern web apps',
      sidebar: [
        { label: 'Overview', slug: 'index' },
        { label: 'Getting Started', autogenerate: { directory: 'getting-started' } },
        { label: 'Core Concepts', autogenerate: { directory: 'concepts' } },
        { label: 'Cookbooks', autogenerate: { directory: 'cookbooks' } },
      ],
      customCss: ['./src/styles/custom.css'],
    }),
  ],
});
