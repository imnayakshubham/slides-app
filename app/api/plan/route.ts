import { tool } from "ai"
import { z } from "zod"

import { createEventStream } from "@/lib/ai/EventStream"
import { PLANNER_INSTRUCTIONS } from "@/lib/ai/Prompts"
import { streamAgentReply } from "@/lib/ai/StreamAgentReply"
import { outlineSchema } from "@/lib/schema/Outline"

export const runtime = "nodejs"
export const maxDuration = 60

const planRequestSchema = z.object({
  prompt: z.string().trim().min(1),
})

// Phase one of generation: the outline only. Nothing is added to the deck
// until the user approves it in the chat.
export async function POST(request: Request) {
  const requestBody = await request.json().catch(() => null)
  const parsedRequest = planRequestSchema.safeParse(requestBody)
  if (!parsedRequest.success) {
    return Response.json({ error: z.prettifyError(parsedRequest.error) }, { status: 400 })
  }

  const { response, sendEvent, closeStream } = createEventStream()

  const tools = {
    create_outline: tool({
      description: "Submit the outline of the deck: its title and every slide in order.",
      inputSchema: outlineSchema,
      execute: (outline) => {
        sendEvent({ event: "outline", data: { outline } })
        return { ok: true }
      },
    }),
  }

  // Not awaited: the response streams while the agent runs.
  streamAgentReply({
    instructions: PLANNER_INSTRUCTIONS,
    messages: [{ role: "user", content: parsedRequest.data.prompt }],
    tools,
    toolChoice: { type: "tool", toolName: "create_outline" },
    maxSteps: 1,
    sendEvent,
    abortSignal: request.signal,
  }).finally(closeStream)

  return response
}
