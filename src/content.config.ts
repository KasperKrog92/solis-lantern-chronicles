import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const chapters = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/chapters' }),
  schema: z.object({
    title: z.string(),
    session: z.number(),
    date: z.coerce.date(),
    summary: z.string(),
    characters_present: z.array(z.string()).default([]),
    draft: z.boolean().default(true),
    // Future fields — schema defined now so it never needs to change
    gmNotes: z.string().optional(),
    illustration: z.string().optional(),
  }),
});

const characters = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/characters' }),
  schema: z.object({
    name: z.string(),
    player: z.string(),
    race: z.string(),
    class_name: z.string(),
    portrait: z.string().optional(),
    status: z.enum(['active', 'inactive', 'deceased']),
    short_bio: z.string(),
    summary: z.string().optional(),
  }),
});

const lore = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/lore' }),
  schema: z.object({
    title: z.string(),
    category: z.enum(['location', 'faction', 'concept', 'creature']),
    summary: z.string(),
  }),
});

const npcs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/npcs' }),
  schema: z.object({
    name: z.string(),
    first_appearance: z.string(),
    status: z.enum(['alive', 'missing', 'deceased', 'unknown']),
    affiliation: z.string().optional(),
    description: z.string(),
    summary: z.string().optional(),
  }),
});

export const collections = { chapters, characters, lore, npcs };
