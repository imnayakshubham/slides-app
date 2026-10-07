import "server-only"

import { isStepCount, RetryError, streamText } from "ai"
import type { ModelMessage, ToolChoice, ToolSet } from "ai"

import { getChatModel } from "@/lib/ai/Model"
import { messageFromError } from "@/lib/ErrorMessage"
import type { SendStreamEvent, StreamEvent } from "@/lib/StreamEvents"

const MAX_AGENT_STEPS = 8

type StreamAgentReplyOptions = {
  instructions: string
  messages: ModelMessage[]
  tools: ToolSet
  toolChoice?: ToolChoice<ToolSet>
  // A forced tool runs on every step, so stop after one step or once that tool succeeds.
  maxSteps?: number
  isFinished?: () => boolean
  sendEvent: SendStreamEvent
  abortSignal?: AbortSignal
}

export async function streamAgentReply({
  instructions,
  messages,
  tools,
  toolChoice,
  maxSteps = MAX_AGENT_STEPS,
  isFinished = () => false,
  sendEvent,
  abortSignal,
}: StreamAgentReplyOptions) {
  const model = getChatModel()
  if (!model) {
    sendEvent({
      event: "error",
      data: { message: "The AI isn't set up: AI_API_KEY is missing on the server (see .env.example)." },
    })
    return
  }

  try {
    const result = streamText({
      model,
      instructions,
      messages,
      tools,
      toolChoice,
      stopWhen: [isStepCount(maxSteps), isFinished],
      abortSignal,
    })

    for await (const part of result.stream) {
      if (part.type === "text-delta") {
        sendEvent({ event: "text_delta", data: { text: part.text } })
      }
      // Bad tool input never reaches the tool's code; the error shows up here.
      if (part.type === "tool-error") {
        sendEvent({
          event: "tool_error",
          data: { message: String(part.error) },
        })
      }
      if (part.type === "error") {
        throw part.error
      }
    }

    sendEvent({ event: "done" })
  } catch (error) {
    // Stopped by the user: the browser is no longer listening.
    if (abortSignal?.aborted) return

    console.error("AI agent run failed", error)
    sendEvent(errorEventFor(error))
  }
}

// The SDK wraps the last failed attempt in a RetryError; its message is the provider's own reason.
function errorEventFor(error: unknown): StreamEvent {
  const lastError = RetryError.isInstance(error) ? error.lastError : error
  return { event: "error", data: { message: messageFromError(lastError) } }
}
