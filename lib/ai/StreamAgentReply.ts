import "server-only"

import { APICallError, isStepCount, RetryError, StreamProviderError, streamText } from "ai"
import type { ModelMessage, ToolChoice, ToolSet } from "ai"

import { getChatModel } from "@/lib/ai/Model"
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
      data: {
        message: "The AI isn't set up: AI_API_KEY is missing on the server (see .env.example).",
        code: "missing_api_key",
      },
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

function errorEventFor(error: unknown): StreamEvent {
  const statusCode = getProviderStatusCode(error)

  if (statusCode === 401) {
    return {
      event: "error",
      data: { message: "API key invalid", code: "invalid_api_key" },
    }
  }
  if (statusCode === 429) {
    return {
      event: "error",
      data: {
        message: "Rate limited, try again shortly",
        code: "rate_limited",
      },
    }
  }
  return {
    event: "error",
    data: {
      message: "The AI request failed. Please try again.",
      code: "provider_error",
    },
  }
}

function getProviderStatusCode(error: unknown) {
  // After its own retries, the SDK wraps the last error in a RetryError.
  let providerError = error
  if (RetryError.isInstance(error)) {
    providerError = error.lastError
  }

  if (APICallError.isInstance(providerError)) return providerError.statusCode
  if (StreamProviderError.isInstance(providerError)) {
    return providerError.statusCode
  }
  return undefined
}
