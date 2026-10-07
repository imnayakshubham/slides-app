import type { DeckRepository } from "@/lib/repository/DeckRepository"
import { indexedDbDeckRepository } from "@/lib/repository/IndexedDbDeckRepository"

// The one place that picks the storage backend. Use only from client code.
export const deckRepository: DeckRepository = indexedDbDeckRepository
