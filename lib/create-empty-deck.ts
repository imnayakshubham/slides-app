import { createId } from "@/lib/ids"
import type { Deck } from "@/lib/schema/deck"

const DEFAULT_THEME: Deck["theme"] = {
  fontFamily: "Inter",
  colors: { background: "#FFFFFF", text: "#111827", accent: "#4F46E5" },
}

export function createEmptyDeck(): Deck {
  return {
    id: createId("deck"),
    title: "Untitled deck",
    aspectRatio: "16:9",
    theme: DEFAULT_THEME,
    slides: [],
  }
}
