import { createId } from "@/lib/Ids"
import type { Deck } from "@/lib/schema/Deck"

const DEFAULT_THEME: Deck["theme"] = {
  fontFamily: "Inter",
  colors: { background: "#FFFFFF", text: "#111827", accent: "#4F46E5" },
}

export function createEmptyDeck(): Deck {
  return {
    id: createId(),
    title: "Untitled deck",
    aspectRatio: "16:9",
    theme: DEFAULT_THEME,
    slides: [],
  }
}
