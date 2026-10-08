import { z } from "zod"

// A deck's chat. Messages are AI SDK UI messages, checked with safeValidateUIMessages when loaded.
export const conversationRecordSchema = z.strictObject({
  schemaVersion: z.literal(2),
  deckId: z.uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messages: z.array(z.unknown()),
})

export type ConversationRecord = z.infer<typeof conversationRecordSchema>
