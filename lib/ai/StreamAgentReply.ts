import "server-only"

import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  RetryError,
  streamText,
  toUIMessageStream,
} from "ai"
import type { ModelMessage, ToolChoice, ToolSet } from "ai"

import { getChatModel } from "@/lib/ai/Model"
import type { SlidesMessage, SlidesStreamWriter } from "@/lib/ai/SlidesMessage"
import { messageFromError } from "@/lib/utils"

const MAX_AGENT_STEPS = 8

type StreamAgentReplyOptions = {
  instructions: string
  messages: ModelMessage[]
  // Tools get the stream writer so they can send each deck change as soon as it is valid.
  createTools: (writer: SlidesStreamWriter) => ToolSet
  toolChoice?: ToolChoice<ToolSet>
  // A tool the model must use would run again on every step, so stop after one step or once it works.
  maxSteps?: number
  isFinished?: () => boolean
  abortSignal?: AbortSignal
}

// Sends the agent's reply to the browser bit by bit: its text, its tool calls and our own data.
export function streamAgentReply({
  instructions,
  messages,
  createTools,
  toolChoice,
  maxSteps = MAX_AGENT_STEPS,
  isFinished = () => false,
  abortSignal,
}: StreamAgentReplyOptions) {
  const model = getChatModel()
  if (!model) {
    const error = "The AI isn't set up: AI_API_KEY is missing on the server (see .env.example)."
    return new Response(error, { status: 503 })
  }

  const stream = createUIMessageStream<SlidesMessage>({
    execute: ({ writer }) => {
      const result = streamText({
        model,
        instructions,
        messages,
        tools: createTools(writer),
        toolChoice,
        stopWhen: [isStepCount(maxSteps), isFinished],
        abortSignal,
      })
      // The model's private reasoning stays on the server; the user sees its reply and changes.
      writer.merge(toUIMessageStream({ stream: result.stream, sendReasoning: false, onError: describeError }))
    },
    onError: describeError,
  })
  return createUIMessageStreamResponse({ stream })
}

// The AI service's own error message, taken out of the retry error, to show the user.
function describeError(error: unknown) {
  console.error("AI agent run failed", error)
  const lastError = RetryError.isInstance(error) ? error.lastError : error
  return messageFromError(lastError)
}
