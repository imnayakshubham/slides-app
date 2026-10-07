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
import { messageFromError } from "@/lib/ErrorMessage"

const MAX_AGENT_STEPS = 8

type StreamAgentReplyOptions = {
  instructions: string
  messages: ModelMessage[]
  // Tools get the stream writer so they can send each deck change as soon as it is valid.
  createTools: (writer: SlidesStreamWriter) => ToolSet
  toolChoice?: ToolChoice<ToolSet>
  // A forced tool runs on every step, so stop after one step or once that tool succeeds.
  maxSteps?: number
  isFinished?: () => boolean
  abortSignal?: AbortSignal
}

// Streams the agent's reply as an AI SDK UI message stream: text, tool calls and our data parts.
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

// Shown to the user: the provider's own reason, unwrapped from the SDK's retry error.
function describeError(error: unknown) {
  console.error("AI agent run failed", error)
  const lastError = RetryError.isInstance(error) ? error.lastError : error
  return messageFromError(lastError)
}
