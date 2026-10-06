import { create } from "zustand"

import { applyOp, type ApplyOpResult, type DeckOp } from "@/lib/ops/apply-op"
import type { Deck } from "@/lib/schema/deck"

const MAX_UNDO_STEPS = 100

type DeckStore = {
  deck: Deck | null
  past: Deck[]
  future: Deck[]
  // Deck as it was when a group (e.g. one AI turn) began; dispatches inside a
  // group skip history so the whole group undoes in one step.
  groupStart: Deck | null
  hydrate: (deck: Deck) => void
  dispatch: (op: DeckOp) => ApplyOpResult
  undo: () => void
  redo: () => void
  beginGroup: () => void
  endGroup: () => void
}

export const useDeckStore = create<DeckStore>()((set, get) => ({
  deck: null,
  past: [],
  future: [],
  groupStart: null,

  hydrate: (deck) => set({ deck, past: [], future: [], groupStart: null }),

  dispatch: (op) => {
    const { deck, past, groupStart } = get()
    if (!deck) return { ok: false, error: "No deck is loaded." }

    const result = applyOp(deck, op)
    if (!result.ok) return result

    if (groupStart) {
      set({ deck: result.deck })
    } else {
      set({
        deck: result.deck,
        past: [...past, deck].slice(-MAX_UNDO_STEPS),
        future: [],
      })
    }
    return result
  },

  undo: () => {
    const { deck, past, future, groupStart } = get()
    const previousDeck = past.at(-1)
    if (!deck || !previousDeck || groupStart) return

    set({
      deck: previousDeck,
      past: past.slice(0, -1),
      future: [...future, deck],
    })
  },

  redo: () => {
    const { deck, past, future, groupStart } = get()
    const nextDeck = future.at(-1)
    if (!deck || !nextDeck || groupStart) return

    set({ deck: nextDeck, past: [...past, deck], future: future.slice(0, -1) })
  },

  beginGroup: () => {
    if (get().groupStart) return
    set({ groupStart: get().deck })
  },

  endGroup: () => {
    const { deck, past, groupStart } = get()
    if (!groupStart) return

    const groupChangedDeck = deck !== groupStart
    if (groupChangedDeck) {
      set({
        past: [...past, groupStart].slice(-MAX_UNDO_STEPS),
        future: [],
        groupStart: null,
      })
    } else {
      set({ groupStart: null })
    }
  },
}))
