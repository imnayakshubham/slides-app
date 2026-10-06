import { openDB, type DBSchema, type IDBPDatabase } from "idb"
import { z } from "zod"

import type { DeckRepository } from "@/lib/repository/DeckRepository"
import {
  conversationRecordSchema,
  type ChatMessage,
  type ConversationRecord,
} from "@/lib/schema/Conversation"
import type { Deck } from "@/lib/schema/Deck"
import {
  deckRecordSchema,
  type DeckRecord,
  type DeckSummary,
} from "@/lib/schema/DeckRecord"

const DATABASE_NAME = "ai-slides"
const DATABASE_VERSION = 2

interface SlidesDatabase extends DBSchema {
  decks: { key: string; value: DeckRecord }
  // Small summaries so /new can list decks without loading every deck.
  deckIndex: {
    key: string
    value: DeckSummary
    indexes: { updatedAt: string }
  }
  conversations: { key: string; value: ConversationRecord }
}

function toDeckSummary(record: DeckRecord): DeckSummary {
  return {
    id: record.deck.id,
    title: record.deck.title,
    updatedAt: record.updatedAt,
  }
}

export class IndexedDbDeckRepository implements DeckRepository {
  private databasePromise: Promise<IDBPDatabase<SlidesDatabase>> | null = null

  // Opened lazily: this module is also evaluated during server rendering,
  // where IndexedDB does not exist.
  private openDatabase() {
    this.databasePromise ??= openDB<SlidesDatabase>(
      DATABASE_NAME,
      DATABASE_VERSION,
      {
        upgrade(database, oldVersion) {
          if (oldVersion < 1) {
            database.createObjectStore("decks", { keyPath: "deck.id" })
            const deckIndex = database.createObjectStore("deckIndex", {
              keyPath: "id",
            })
            deckIndex.createIndex("updatedAt", "updatedAt")
          }
          if (oldVersion < 2) {
            database.createObjectStore("conversations", { keyPath: "deckId" })
          }
        },
      }
    )
    return this.databasePromise
  }

  async listDecks() {
    const database = await this.openDatabase()
    const oldestFirst = await database.getAllFromIndex("deckIndex", "updatedAt")
    return oldestFirst.reverse()
  }

  async getDeck(deckId: string) {
    const database = await this.openDatabase()
    const storedRecord = await database.get("decks", deckId)
    if (!storedRecord) return null

    const parsedRecord = deckRecordSchema.safeParse(storedRecord)
    if (!parsedRecord.success) {
      throw new Error(
        `Saved data for deck "${deckId}" is invalid: ${z.prettifyError(parsedRecord.error)}`
      )
    }
    return parsedRecord.data
  }

  async saveDeck(deck: Deck) {
    const database = await this.openDatabase()
    const transaction = database.transaction(
      ["decks", "deckIndex"],
      "readwrite"
    )
    const existingRecord = await transaction.objectStore("decks").get(deck.id)
    const now = new Date().toISOString()

    const record: DeckRecord = {
      schemaVersion: 1,
      version: (existingRecord?.version ?? 0) + 1,
      createdAt: existingRecord?.createdAt ?? now,
      updatedAt: now,
      deck,
    }
    await Promise.all([
      transaction.objectStore("decks").put(record),
      transaction.objectStore("deckIndex").put(toDeckSummary(record)),
      transaction.done,
    ])
    return record
  }

  async deleteDeck(deckId: string) {
    const database = await this.openDatabase()
    const transaction = database.transaction(
      ["decks", "deckIndex", "conversations"],
      "readwrite"
    )
    await Promise.all([
      transaction.objectStore("decks").delete(deckId),
      transaction.objectStore("deckIndex").delete(deckId),
      transaction.objectStore("conversations").delete(deckId),
      transaction.done,
    ])
  }

  async getConversationMessages(deckId: string) {
    const database = await this.openDatabase()
    const storedRecord = await database.get("conversations", deckId)
    if (!storedRecord) return []

    // A broken chat history should not stop the deck from opening.
    const parsedRecord = conversationRecordSchema.safeParse(storedRecord)
    if (!parsedRecord.success) {
      console.error(
        `Saved chat for deck "${deckId}" is invalid`,
        parsedRecord.error
      )
      return []
    }
    return parsedRecord.data.messages
  }

  async saveConversationMessages(deckId: string, messages: ChatMessage[]) {
    const record = conversationRecordSchema.parse({
      schemaVersion: 1,
      deckId,
      updatedAt: new Date().toISOString(),
      messages,
    })
    const database = await this.openDatabase()
    await database.put("conversations", record)
  }
}
