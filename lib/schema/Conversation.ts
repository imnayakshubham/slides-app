import { z } from "zod"

const chatMessageSchema = z.strictObject({
  id: z.uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string(),
  status: z.enum(["streaming", "complete", "error"]),
  errorMessage: z.string().optional(),
  actions: z.array(z.strictObject({ label: z.string(), failed: z.boolean() })),
})

export const conversationRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  deckId: z.uuid(),
  updatedAt: z.string(),
  messages: z.array(chatMessageSchema),
})

export type ChatMessage = z.infer<typeof chatMessageSchema>
export type ConversationRecord = z.infer<typeof conversationRecordSchema>
