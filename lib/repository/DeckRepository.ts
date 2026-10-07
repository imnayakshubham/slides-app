import type { SlidesMessage } from "@/lib/ai/SlidesMessage"
import type { Deck } from "@/lib/schema/Deck"
import type { DeckRecord, DeckSummary } from "@/lib/schema/DeckRecord"

export type UploadedImage = { src: string; width: number; height: number }

// Components use only this interface, so IndexedDB can later be swapped for a server.
export interface DeckRepository {
  listDecks(): Promise<DeckSummary[]>
  // Gives null when the deck does not exist; throws when its saved data is broken.
  getDeck(deckId: string): Promise<DeckRecord | null>
  // Creates the deck on first save, then bumps its version on every later save.
  saveDeck(deck: Deck): Promise<DeckRecord>
  // Also deletes the deck's conversation.
  deleteDeck(deckId: string): Promise<void>
  // Gives an empty list when the deck has no conversation yet.
  getConversationMessages(deckId: string): Promise<SlidesMessage[]>
  saveConversationMessages(deckId: string, messages: SlidesMessage[]): Promise<void>
  // Gives the image's address and its size after any shrinking.
  uploadImage(file: File): Promise<UploadedImage>
}
