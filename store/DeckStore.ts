import { create } from "zustand"

import { applyDeckEdit } from "@/lib/edits/DeckEdits"
import type { DeckEdit, DeckEditResult } from "@/lib/edits/DeckEdits"
import type { Deck } from "@/lib/schema/Deck"

const MAX_UNDO_STEPS = 100

type DeckStore = {
  deck: Deck | null
  past: Deck[]
  future: Deck[]
  // Saved when an undo group starts (e.g. one AI reply), so the whole group undoes in one step.
  deckBeforeGroup: Deck | null
  loadDeck: (deck: Deck) => void
  applyEdit: (edit: DeckEdit) => DeckEditResult
  undo: () => void
  redo: () => void
  startUndoGroup: () => void
  finishUndoGroup: () => void
}

export function selectSlideIds(state: DeckStore) {
  if (!state.deck) return []
  return state.deck.slides.map((slide) => slide.id)
}

function addToHistory(past: Deck[], deck: Deck) {
  return [...past, deck].slice(-MAX_UNDO_STEPS)
}

function logEdit(edit: DeckEdit, result: DeckEditResult) {
  if (process.env.NODE_ENV !== "development") return
  if (result.ok) console.log(`[deck edit] ${edit.type}`, edit)
  else console.log(`[deck edit] ${edit.type} rejected: ${result.error}`, edit)
}

export const useDeckStore = create<DeckStore>()((set, get) => ({
  deck: null,
  past: [],
  future: [],
  deckBeforeGroup: null,

  loadDeck: (deck) => set({ deck, past: [], future: [], deckBeforeGroup: null }),

  applyEdit: (edit) => {
    const { deck, past, deckBeforeGroup } = get()
    if (!deck) return { ok: false, error: "No deck is loaded." }

    const result = applyDeckEdit(deck, edit)
    logEdit(edit, result)
    if (!result.ok) return result

    // Inside a group, undo history is saved once, when the group finishes.
    if (deckBeforeGroup) {
      set({ deck: result.deck })
    } else {
      set({ deck: result.deck, past: addToHistory(past, deck), future: [] })
    }
    return result
  },

  undo: () => {
    const { deck, past, future, deckBeforeGroup } = get()
    const previousDeck = past.at(-1)
    if (!deck || !previousDeck || deckBeforeGroup) return
    set({ deck: previousDeck, past: past.slice(0, -1), future: [...future, deck] })
  },

  redo: () => {
    const { deck, past, future, deckBeforeGroup } = get()
    const nextDeck = future.at(-1)
    if (!deck || !nextDeck || deckBeforeGroup) return
    set({ deck: nextDeck, past: [...past, deck], future: future.slice(0, -1) })
  },

  startUndoGroup: () => {
    const { deck, deckBeforeGroup } = get()
    if (deckBeforeGroup) return
    set({ deckBeforeGroup: deck })
  },

  finishUndoGroup: () => {
    const { deck, past, deckBeforeGroup } = get()
    if (!deckBeforeGroup) return
    const groupChangedDeck = deck !== deckBeforeGroup
    if (groupChangedDeck) {
      set({ past: addToHistory(past, deckBeforeGroup), future: [], deckBeforeGroup: null })
    } else {
      set({ deckBeforeGroup: null })
    }
  },
}))
