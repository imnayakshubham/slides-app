import { createId } from "@/lib/Ids"
import type { Deck } from "@/lib/schema/Deck"
import { deckThemeFor } from "@/lib/themes/Themes"
import { newTimestamps } from "@/lib/Timestamps"

// A blank deck starts plain; generating from a prompt picks a theme.
export function createEmptyDeck(): Deck {
  return {
    id: createId(),
    ...newTimestamps(),
    title: "Untitled deck",
    aspectRatio: "16:9",
    theme: deckThemeFor("classic"),
    slides: [],
  }
}
