import { openDB, type DBSchema, type IDBPDatabase } from "idb"
import { z } from "zod"

import type { DeckRepository } from "@/lib/repository/DeckRepository"
import type { Deck } from "@/lib/schema/Deck"
import {
  deckRecordSchema,
  type DeckRecord,
  type DeckSummary,
} from "@/lib/schema/DeckRecord"

const DATABASE_NAME = "ai-slides"
const DATABASE_VERSION = 1

interface SlidesDatabase extends DBSchema {
  decks: { key: string; value: DeckRecord }
  // Small summaries so /new can list decks without loading every deck.
  deckIndex: {
    key: string
    value: DeckSummary
    indexes: { updatedAt: string }
  }
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
        upgrade(database) {
          database.createObjectStore("decks", { keyPath: "deck.id" })
          const deckIndex = database.createObjectStore("deckIndex", {
            keyPath: "id",
          })
          deckIndex.createIndex("updatedAt", "updatedAt")
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
      ["decks", "deckIndex"],
      "readwrite"
    )
    await Promise.all([
      transaction.objectStore("decks").delete(deckId),
      transaction.objectStore("deckIndex").delete(deckId),
      transaction.done,
    ])
  }
}
