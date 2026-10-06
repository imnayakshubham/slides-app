import type { DeckEdit } from "@/lib/edits/DeckEdits"

export type StreamErrorCode =
  "invalid_api_key" | "rate_limited" | "provider_error" | "http_error"

export type StreamEvent =
  | { event: "status"; data: { message: string } }
  | { event: "text_delta"; data: { text: string } }
  | {
      event: "edit"
      data: { edit: DeckEdit; label: string; toolCallId: string }
    }
  | { event: "tool_error"; data: { message: string } }
  | { event: "done" }
  | { event: "error"; data: { message: string; code: StreamErrorCode } }

export type SendStreamEvent = (streamEvent: StreamEvent) => void
