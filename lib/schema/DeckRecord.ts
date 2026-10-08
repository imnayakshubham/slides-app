import { z } from "zod"

import { deckSchema } from "@/lib/schema/Deck"

// The saved shape of a deck. A future REST backend returns this same JSON.
export const deckRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  version: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deck: deckSchema,
})

export type DeckRecord = z.infer<typeof deckRecordSchema>

export type DeckSummary = { id: string; title: string; createdAt: string; updatedAt: string }
