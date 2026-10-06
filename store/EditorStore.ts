import { create } from "zustand"

import { useDeckStore } from "@/store/DeckStore"

type EditorStore = {
  currentSlideId: string | null
  selectedElementIds: string[]
  goToSlide: (slideId: string) => void
  setSelectedElementIds: (elementIds: string[]) => void
}

export const useEditorStore = create<EditorStore>()((set) => ({
  currentSlideId: null,
  selectedElementIds: [],

  goToSlide: (slideId) =>
    set({ currentSlideId: slideId, selectedElementIds: [] }),

  setSelectedElementIds: (elementIds) =>
    set({ selectedElementIds: elementIds }),
}))

// Keep the editor pointing at things that still exist after any deck change
// (hydrate, delete, undo, AI edits).
useDeckStore.subscribe((deckState, previousDeckState) => {
  const slides = deckState.deck?.slides ?? []
  const { currentSlideId, selectedElementIds } = useEditorStore.getState()
  const currentSlide = slides.find((slide) => slide.id === currentSlideId)

  if (!currentSlide) {
    const previousSlideIndex =
      previousDeckState.deck?.slides.findIndex(
        (slide) => slide.id === currentSlideId
      ) ?? -1
    const nearestSlide =
      slides[Math.min(Math.max(previousSlideIndex, 0), slides.length - 1)]
    useEditorStore.setState({
      currentSlideId: nearestSlide?.id ?? null,
      selectedElementIds: [],
    })
    return
  }

  const stillExistingSelection = selectedElementIds.filter((elementId) =>
    currentSlide.elements.some((element) => element.id === elementId)
  )
  if (stillExistingSelection.length !== selectedElementIds.length) {
    useEditorStore.setState({ selectedElementIds: stillExistingSelection })
  }
})
