import type { UIMessage, UIMessageStreamWriter } from "ai"

import type { DeckEdit } from "@/lib/edits/DeckEdits"
import type { Outline } from "@/lib/schema/Outline"

// Custom parts the AI routes send alongside text and tool calls.
type SlidesDataParts = {
  edit: { edit: DeckEdit; label: string }
  outline: { outline: Outline }
}

export type SlidesMessage = UIMessage<never, SlidesDataParts>

export type SlidesStreamWriter = UIMessageStreamWriter<SlidesMessage>
