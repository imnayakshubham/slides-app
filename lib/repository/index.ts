import type { DeckRepository } from "@/lib/repository/DeckRepository"
import { indexedDbDeckRepository } from "@/lib/repository/IndexedDbDeckRepository"

// The one place that picks where decks are stored. Use only in browser code.
export const deckRepository: DeckRepository = indexedDbDeckRepository
