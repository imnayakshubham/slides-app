"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { isAgentWorkingOnDeck } from "@/lib/client/AgentRun"
import { deckRepository } from "@/lib/repository"
import type { Deck } from "@/lib/schema/deck"
import { useDeckStore } from "@/store/DeckStore"
import { agentFor, useAgentStore } from "@/store/AgentStore"

const AUTOSAVE_DELAY_MS = 1000

export type SaveStatus = "saved" | "saving" | "error"

// Saves 1s after the last change, when the tab is hidden, on close, and once the agent finishes.
export function useAutosave() {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved")
  const unsavedDeckRef = useRef<Deck | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const saveUnsavedDeck = useCallback(async () => {
    clearTimeout(saveTimeoutRef.current)
    const deckToSave = unsavedDeckRef.current
    if (!deckToSave) return

    unsavedDeckRef.current = null
    try {
      const savedRecord = await deckRepository.saveDeck(deckToSave)
      if (process.env.NODE_ENV === "development") {
        console.log(`[deck saved] ${savedRecord.deck.title} v${savedRecord.version}`, savedRecord)
      }
      const changedWhileSaving = unsavedDeckRef.current !== null
      setSaveStatus(changedWhileSaving ? "saving" : "saved")
    } catch {
      unsavedDeckRef.current ??= deckToSave
      setSaveStatus("error")
    }
  }, [])

  useEffect(() => {
    const unsubscribe = useDeckStore.subscribe((state, previousState) => {
      const changedDeck = state.deck
      const isEditOfSameDeck =
        changedDeck !== null && changedDeck !== previousState.deck && changedDeck.id === previousState.deck?.id
      if (!isEditOfSameDeck) return

      unsavedDeckRef.current = changedDeck
      setSaveStatus("saving")
      clearTimeout(saveTimeoutRef.current)
      if (isAgentWorkingOnDeck(changedDeck.id)) return
      saveTimeoutRef.current = setTimeout(saveUnsavedDeck, AUTOSAVE_DELAY_MS)
    })

    // Saves once when the open deck's agent run ends.
    const unsubscribeFromAgent = useAgentStore.subscribe((state, previousState) => {
      const deckId = useDeckStore.getState().deck?.id
      const wasRunning = agentFor(previousState.agents, deckId).run
      const isRunning = agentFor(state.agents, deckId).run
      if (wasRunning && !isRunning) void saveUnsavedDeck()
    })

    const saveWhenTabHidden = () => {
      if (document.visibilityState === "hidden") void saveUnsavedDeck()
    }
    document.addEventListener("visibilitychange", saveWhenTabHidden)

    return () => {
      unsubscribe()
      unsubscribeFromAgent()
      document.removeEventListener("visibilitychange", saveWhenTabHidden)
      void saveUnsavedDeck()
    }
  }, [saveUnsavedDeck])

  return { saveStatus, retrySave: saveUnsavedDeck }
}
