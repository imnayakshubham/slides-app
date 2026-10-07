import { createId } from "@/lib/Ids"
import type { Deck } from "@/lib/schema/Deck"
import { deckThemeFor } from "@/lib/themes/Themes"

// A blank deck starts plain; generating from a prompt picks a theme.
export function createEmptyDeck(): Deck {
  return {
    id: createId(),
    title: "Untitled deck",
    aspectRatio: "16:9",
    theme: deckThemeFor("classic"),
    slides: [],
  }
}
