import { z } from "zod"

import { buildDeckContext, recentMessages } from "@/lib/ai/DeckContext"
import { createEventStream } from "@/lib/ai/EventStream"
import { EDITOR_INSTRUCTIONS } from "@/lib/ai/Prompts"
import { streamAgentReply } from "@/lib/ai/StreamAgentReply"
import { createAgentTools } from "@/lib/ai/Tools"
import { deckSchema } from "@/lib/schema/Deck"

export const runtime = "nodejs"
export const maxDuration = 60

const chatRequestSchema = z.object({
  deck: deckSchema,
  messages: z
    .array(
      z.object({ role: z.enum(["user", "assistant"]), content: z.string() })
    )
    .default([]),
  currentSlideId: z.string().nullable().default(null),
  selectedIds: z.array(z.string()).default([]),
  userMessage: z.string().trim().min(1),
})

export async function POST(request: Request) {
  const requestBody = await request.json().catch(() => null)
  const parsedRequest = chatRequestSchema.safeParse(requestBody)
  if (!parsedRequest.success) {
    return Response.json(
      { error: z.prettifyError(parsedRequest.error) },
      { status: 400 }
    )
  }

  const { deck, messages, currentSlideId, selectedIds, userMessage } =
    parsedRequest.data
  const { response, sendEvent, closeStream } = createEventStream()
  const deckContext = buildDeckContext(deck, currentSlideId, selectedIds)

  // Not awaited: the response streams while the agent runs.
  streamAgentReply({
    instructions: `${EDITOR_INSTRUCTIONS}\n\n${deckContext}`,
    messages: [
      ...recentMessages(messages),
      { role: "user", content: userMessage },
    ],
    tools: createAgentTools(deck, sendEvent),
    sendEvent,
    abortSignal: request.signal,
  }).finally(closeStream)

  return response
}
