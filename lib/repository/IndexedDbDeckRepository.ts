import { openDB, type DBSchema, type IDBPDatabase } from "idb"
import { z } from "zod"

import type { DeckRepository, UploadedImage } from "@/lib/repository/DeckRepository"
import { conversationRecordSchema } from "@/lib/schema/Conversation"
import type { ChatMessage, ConversationRecord } from "@/lib/schema/Conversation"
import type { Deck } from "@/lib/schema/Deck"
import { deckRecordSchema } from "@/lib/schema/DeckRecord"
import type { DeckRecord, DeckSummary } from "@/lib/schema/DeckRecord"

const DATABASE_NAME = "ai-slides"
const DATABASE_VERSION = 2
const MAX_IMAGE_SIDE_PX = 1600
const JPEG_QUALITY = 0.9

interface SlidesDatabase extends DBSchema {
  decks: { key: string; value: DeckRecord }
  // Small summaries so /new can list decks without loading every deck.
  deckIndex: { key: string; value: DeckSummary; indexes: { updatedAt: string } }
  conversations: { key: string; value: ConversationRecord }
}

let databasePromise: Promise<IDBPDatabase<SlidesDatabase>> | null = null

// Opened on first use, because this file also runs on the server where IndexedDB doesn't exist.
function openDatabase() {
  databasePromise ??= openDB<SlidesDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains("decks")) {
        database.createObjectStore("decks", { keyPath: "deck.id" })
      }
      if (!database.objectStoreNames.contains("deckIndex")) {
        const deckIndex = database.createObjectStore("deckIndex", { keyPath: "id" })
        deckIndex.createIndex("updatedAt", "updatedAt")
      }
      if (!database.objectStoreNames.contains("conversations")) {
        database.createObjectStore("conversations", { keyPath: "deckId" })
      }
    },
  })
  return databasePromise
}

async function listDecks() {
  const database = await openDatabase()
  const oldestFirst = await database.getAllFromIndex("deckIndex", "updatedAt")
  return oldestFirst.reverse()
}

async function getDeck(deckId: string) {
  const database = await openDatabase()
  const savedRecord = await database.get("decks", deckId)
  if (!savedRecord) return null

  const parsedRecord = deckRecordSchema.safeParse(savedRecord)
  if (!parsedRecord.success) {
    throw new Error(`Saved data for deck "${deckId}" is invalid: ${z.prettifyError(parsedRecord.error)}`)
  }
  return parsedRecord.data
}

async function saveDeck(deck: Deck) {
  const database = await openDatabase()
  const transaction = database.transaction(["decks", "deckIndex"], "readwrite")
  const previousRecord = await transaction.objectStore("decks").get(deck.id)
  const now = new Date().toISOString()

  const record: DeckRecord = {
    schemaVersion: 1,
    version: (previousRecord?.version ?? 0) + 1,
    createdAt: previousRecord?.createdAt ?? now,
    updatedAt: now,
    deck,
  }
  const summary: DeckSummary = { id: deck.id, title: deck.title, updatedAt: now }

  await Promise.all([
    transaction.objectStore("decks").put(record),
    transaction.objectStore("deckIndex").put(summary),
    transaction.done,
  ])
  return record
}

// Also deletes the deck's chat.
async function deleteDeck(deckId: string) {
  const database = await openDatabase()
  const transaction = database.transaction(["decks", "deckIndex", "conversations"], "readwrite")
  await Promise.all([
    transaction.objectStore("decks").delete(deckId),
    transaction.objectStore("deckIndex").delete(deckId),
    transaction.objectStore("conversations").delete(deckId),
    transaction.done,
  ])
}

async function getConversationMessages(deckId: string) {
  const database = await openDatabase()
  const savedRecord = await database.get("conversations", deckId)
  if (!savedRecord) return []

  // A broken chat history should not stop the deck from opening.
  const parsedRecord = conversationRecordSchema.safeParse(savedRecord)
  if (!parsedRecord.success) {
    console.error(`Saved chat for deck "${deckId}" is invalid`, parsedRecord.error)
    return []
  }
  return parsedRecord.data.messages
}

async function saveConversationMessages(deckId: string, messages: ChatMessage[]) {
  const record = conversationRecordSchema.parse({
    schemaVersion: 1,
    deckId,
    updatedAt: new Date().toISOString(),
    messages,
  })
  const database = await openDatabase()
  await database.put("conversations", record)
}

// No file storage yet, so the image is shrunk and kept inside the deck as a data URL.
async function uploadImage(file: File): Promise<UploadedImage> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_IMAGE_SIDE_PX / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  // PNG keeps transparency; everything else becomes a smaller JPEG.
  const isPng = file.type === "image/png"
  const src = isPng ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", JPEG_QUALITY)
  return { src, width, height }
}

export const indexedDbDeckRepository: DeckRepository = {
  listDecks,
  getDeck,
  saveDeck,
  deleteDeck,
  getConversationMessages,
  saveConversationMessages,
  uploadImage,
}
