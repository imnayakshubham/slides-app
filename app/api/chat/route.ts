import { z } from "zod"

import { buildDeckContext, recentMessages } from "@/lib/ai/DeckContext"
import { EDITOR_INSTRUCTIONS } from "@/lib/ai/Prompts"
import { streamAgentReply } from "@/lib/ai/StreamAgentReply"
import { createAgentTools } from "@/lib/ai/Tools"
import { deckSchema } from "@/lib/schema/deck"

export const runtime = "nodejs"
export const maxDuration = 60

const chatRequestSchema = z.object({
  deck: deckSchema,
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).default([]),
  currentSlideId: z.string().nullable().default(null),
  selectedIds: z.array(z.string()).default([]),
  userMessage: z.string().trim().min(1),
})

export async function POST(request: Request) {
  const requestBody = await request.json().catch(() => null)
  const parsedRequest = chatRequestSchema.safeParse(requestBody)
  if (!parsedRequest.success) {
    return new Response(z.prettifyError(parsedRequest.error), { status: 400 })
  }

  const { deck, messages, currentSlideId, selectedIds, userMessage } = parsedRequest.data
  const deckContext = buildDeckContext(deck, currentSlideId, selectedIds)

  return streamAgentReply({
    instructions: `${EDITOR_INSTRUCTIONS}\n\n${deckContext}`,
    messages: [...recentMessages(messages), { role: "user", content: userMessage }],
    createTools: (writer) =>
      createAgentTools(deck, (edit, label) =>
        writer.write({ type: "data-edit", data: { edit, label }, transient: true })
      ),
    abortSignal: request.signal,
  })
}
