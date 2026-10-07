import { tool } from "ai"
import { z } from "zod"

import { PLANNER_INSTRUCTIONS } from "@/lib/ai/Prompts"
import { streamAgentReply } from "@/lib/ai/StreamAgentReply"
import { outlineSchema } from "@/lib/schema/Outline"

export const runtime = "nodejs"
export const maxDuration = 60

const planRequestSchema = z.object({
  prompt: z.string().trim().min(1),
})

// Phase one: the outline only; nothing is added to the deck until the user approves it.
export async function POST(request: Request) {
  const requestBody = await request.json().catch(() => null)
  const parsedRequest = planRequestSchema.safeParse(requestBody)
  if (!parsedRequest.success) {
    return new Response(z.prettifyError(parsedRequest.error), { status: 400 })
  }

  return streamAgentReply({
    instructions: PLANNER_INSTRUCTIONS,
    messages: [{ role: "user", content: parsedRequest.data.prompt }],
    createTools: (writer) => ({
      create_outline: tool({
        description: "Submit the outline of the deck: its title and every slide in order.",
        inputSchema: outlineSchema,
        execute: (outline) => {
          writer.write({ type: "data-outline", data: { outline } })
          return { ok: true }
        },
      }),
    }),
    toolChoice: { type: "tool", toolName: "create_outline" },
    maxSteps: 1,
    abortSignal: request.signal,
  })
}
