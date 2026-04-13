import { defineCollection, z } from 'astro:content';

const chapters = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    session_number: z.number(),
    date: z.coerce.date(),
    characters_present: z.array(z.string()),
    summary: z.string(),
  }),
});

const characters = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    player: z.string(),
    race: z.string(),
    class: z.string(),
    portrait: z.string().optional(),
    status: z.enum(['active', 'inactive', 'deceased', 'unknown']),
  }),
});

const lore = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    category: z.string(),
  }),
});

const npcs = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    first_appeared: z.string(),
    status: z.enum(['alive', 'deceased', 'missing', 'unknown']),
  }),
});

export const collections = { chapters, characters, lore, npcs };
