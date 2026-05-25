import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const docs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/docs' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    template: z.string().optional(),
    hero: z.any().optional(),
    sidebar: z
      .object({
        order: z.number().optional(),
        label: z.string().optional(),
      })
      .optional(),
  }),
});

export const collections = { docs };
