import type { DeckRepository } from "@/lib/repository/deck-repository"
import { IndexedDbDeckRepository } from "@/lib/repository/indexeddb-deck-repository"

// The one place that picks the storage backend. Use only from client code.
export const deckRepository: DeckRepository = new IndexedDbDeckRepository()
