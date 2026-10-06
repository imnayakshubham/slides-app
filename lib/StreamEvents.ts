import type { DeckEdit } from "@/lib/edits/DeckEdits"

export type StreamErrorCode =
  "invalid_api_key" | "rate_limited" | "provider_error" | "http_error"

// The SSE contract between the AI routes and the browser (HLD §8.2).
export type StreamEventDataByName = {
  status: { message: string }
  text_delta: { text: string }
  edit: { edit: DeckEdit; label: string; toolCallId: string }
  tool_error: { message: string }
  done: Record<string, never>
  error: { message: string; code: StreamErrorCode }
}

export type StreamEventName = keyof StreamEventDataByName

export type StreamEvent = {
  [Name in StreamEventName]: { event: Name; data: StreamEventDataByName[Name] }
}[StreamEventName]

export type SendStreamEvent = <Name extends StreamEventName>(
  event: Name,
  data: StreamEventDataByName[Name]
) => void
