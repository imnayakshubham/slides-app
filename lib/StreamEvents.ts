import type { DeckEdit } from "@/lib/edits/DeckEdits"
import type { Outline } from "@/lib/schema/Outline"

type StreamErrorCode = "missing_api_key" | "invalid_api_key" | "rate_limited" | "provider_error" | "http_error"

export type StreamEvent =
  | { event: "status"; data: { message: string } }
  | { event: "text_delta"; data: { text: string } }
  | {
      event: "edit"
      data: { edit: DeckEdit; label: string; toolCallId: string }
    }
  | { event: "tool_error"; data: { message: string } }
  // The planned deck, waiting for the user to approve it.
  | { event: "outline"; data: { outline: Outline } }
  | { event: "done" }
  | { event: "error"; data: { message: string; code: StreamErrorCode } }

export type SendStreamEvent = (streamEvent: StreamEvent) => void
