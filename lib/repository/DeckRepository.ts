import type { Deck } from "@/lib/schema/Deck"
import type { DeckRecord, DeckSummary } from "@/lib/schema/DeckRecord"

// Components talk only to this interface, so IndexedDB can later be swapped
// for an HTTP backend without touching them.
export interface DeckRepository {
  listDecks(): Promise<DeckSummary[]>
  // Resolves null when the deck does not exist; rejects when its saved data is invalid.
  getDeck(deckId: string): Promise<DeckRecord | null>
  // Creates the deck on first save, then bumps its version on every later save.
  saveDeck(deck: Deck): Promise<DeckRecord>
  deleteDeck(deckId: string): Promise<void>
}
