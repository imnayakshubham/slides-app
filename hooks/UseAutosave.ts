"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { deckRepository } from "@/lib/repository"
import type { Deck } from "@/lib/schema/Deck"
import { useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

const AUTOSAVE_DELAY_MS = 1000

export type SaveStatus = "saved" | "saving" | "error"

// Saves the open deck 1s after the last change, when the tab is hidden, and on unmount.
// While the agent runs it waits, then saves once when the agent finishes.
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
      await deckRepository.saveDeck(deckToSave)
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
        changedDeck !== null &&
        changedDeck !== previousState.deck &&
        changedDeck.id === previousState.deck?.id
      if (!isEditOfSameDeck) return

      unsavedDeckRef.current = changedDeck
      setSaveStatus("saving")
      clearTimeout(saveTimeoutRef.current)
      if (useEditorStore.getState().isAgentRunning) return
      saveTimeoutRef.current = setTimeout(saveUnsavedDeck, AUTOSAVE_DELAY_MS)
    })

    const unsubscribeFromAgent = useEditorStore.subscribe(
      (state, previousState) => {
        const agentJustFinished =
          previousState.isAgentRunning && !state.isAgentRunning
        if (agentJustFinished) void saveUnsavedDeck()
      }
    )

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
