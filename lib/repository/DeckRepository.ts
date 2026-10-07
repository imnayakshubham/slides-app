import type { SlidesMessage } from "@/lib/ai/SlidesMessage"
import type { Deck } from "@/lib/schema/Deck"
import type { DeckRecord, DeckSummary } from "@/lib/schema/DeckRecord"

export type UploadedImage = { src: string; width: number; height: number }

// Components use only this interface, so IndexedDB can later be swapped for a server backend.
export interface DeckRepository {
  listDecks(): Promise<DeckSummary[]>
  // Resolves null when the deck does not exist; rejects when its saved data is invalid.
  getDeck(deckId: string): Promise<DeckRecord | null>
  // Creates the deck on first save, then bumps its version on every later save.
  saveDeck(deck: Deck): Promise<DeckRecord>
  // Also deletes the deck's conversation.
  deleteDeck(deckId: string): Promise<void>
  // Resolves an empty list when the deck has no conversation yet.
  getConversationMessages(deckId: string): Promise<SlidesMessage[]>
  saveConversationMessages(deckId: string, messages: SlidesMessage[]): Promise<void>
  // Resolves the image's address and its size after any downscaling.
  uploadImage(file: File): Promise<UploadedImage>
}
