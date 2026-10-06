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
import type { SendStreamEvent, StreamEventDataByName } from "@/lib/StreamEvents"

const MAX_AGENT_STEPS = 8

type RunAgentOptions = {
  instructions: string
  messages: ModelMessage[]
  tools: ToolSet
  toolChoice?: ToolChoice<ToolSet>
  send: SendStreamEvent
  abortSignal?: AbortSignal
}

// Tool execution (and its edit events) happens inside each tool's execute;
// this only relays the model's text and the final outcome.
export async function runAgent({
  instructions,
  messages,
  tools,
  toolChoice,
  send,
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
      if (part.type === "text-delta") send("text_delta", { text: part.text })
      // Tool input that fails its schema never reaches execute; the SDK
      // reports it here and the model sees the same error and retries.
      if (part.type === "tool-error")
        send("tool_error", { message: String(part.error) })
      if (part.type === "error") throw part.error
    }
    send("done", {})
  } catch (error) {
    if (abortSignal?.aborted) return
    console.error("AI agent run failed", error)
    send("error", toStreamError(error))
  }
}

function toStreamError(error: unknown): StreamEventDataByName["error"] {
  const statusCode = providerStatusCode(error)
  if (statusCode === 401) {
    return { message: "API key invalid", code: "invalid_api_key" }
  }
  if (statusCode === 429) {
    return { message: "Rate limited, try again shortly", code: "rate_limited" }
  }
  return {
    message: "The AI request failed. Please try again.",
    code: "provider_error",
  }
}

function providerStatusCode(error: unknown) {
  // Retried calls wrap the provider error that finally failed.
  const providerError = RetryError.isInstance(error) ? error.lastError : error
  if (
    APICallError.isInstance(providerError) ||
    StreamProviderError.isInstance(providerError)
  ) {
    return providerError.statusCode
  }
  return undefined
}
