import "server-only"

import {
  APICallError,
  isStepCount,
  RetryError,
  StreamProviderError,
  streamText,
  type ModelMessage,
  type ToolChoice,
  type ToolSet,
} from "ai"

import { groqModel } from "@/lib/ai/Provider"
import type { SendStreamEvent, StreamEvent } from "@/lib/StreamEvents"

const MAX_AGENT_STEPS = 8

type RunAgentOptions = {
  instructions: string
  messages: ModelMessage[]
  tools: ToolSet
  toolChoice?: ToolChoice<ToolSet>
  sendEvent: SendStreamEvent
  abortSignal?: AbortSignal
}

export async function runAgent({
  instructions,
  messages,
  tools,
  toolChoice,
  sendEvent,
  abortSignal,
}: RunAgentOptions) {
  try {
    const result = streamText({
      model: groqModel,
      instructions,
      messages,
      tools,
      toolChoice,
      stopWhen: isStepCount(MAX_AGENT_STEPS),
      abortSignal,
    })

    for await (const part of result.stream) {
      if (part.type === "text-delta") {
        sendEvent({ event: "text_delta", data: { text: part.text } })
      }
      // Invalid tool input never reaches the tool's execute; it surfaces here.
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
  // After automatic retries, the SDK wraps the last error in a RetryError.
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
