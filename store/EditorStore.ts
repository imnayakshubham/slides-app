import { create } from "zustand"

import type { TextBoxStyle } from "@/lib/RichText"
import { useDeckStore } from "@/store/DeckStore"

type Point = { x: number; y: number }

type AddHereMenu = {
  screenPoint: Point
  // In artboard units: where the new element goes.
  slidePoint: Point
}

type EditorStore = {
  currentSlideId: string | null
  selectedElementIds: string[]
  goToSlide: (slideId: string) => void
  setSelectedElementIds: (elementIds: string[]) => void
  editingElementId: string | null
  setEditingElementId: (elementId: string | null) => void
  // Null when no words are highlighted: toolbar settings then style the whole box.
  highlightedTextStyle: TextBoxStyle | null
  setHighlightedTextStyle: (style: TextBoxStyle | null) => void
  addHereMenu: AddHereMenu | null
  setAddHereMenu: (menu: AddHereMenu | null) => void
}

export const useEditorStore = create<EditorStore>()((set) => ({
  currentSlideId: null,
  selectedElementIds: [],

  goToSlide: (slideId) =>
    set({
      currentSlideId: slideId,
      selectedElementIds: [],
      editingElementId: null,
      highlightedTextStyle: null,
      addHereMenu: null,
    }),

  setSelectedElementIds: (elementIds) => set({ selectedElementIds: elementIds }),

  editingElementId: null,
  setEditingElementId: (elementId) => set({ editingElementId: elementId, highlightedTextStyle: null }),

  highlightedTextStyle: null,
  setHighlightedTextStyle: (style) => set({ highlightedTextStyle: style }),

  addHereMenu: null,
  setAddHereMenu: (menu) => set({ addHereMenu: menu }),
}))

// After any deck change, keep the current slide and selection pointing at things that still exist.
useDeckStore.subscribe((deckState, previousDeckState) => {
  const slides = deckState.deck?.slides ?? []
  const { currentSlideId, selectedElementIds } = useEditorStore.getState()
  const currentSlide = slides.find((slide) => slide.id === currentSlideId)

  if (!currentSlide) {
    // Open the slide that took the removed one's place.
    const removedIndex = previousDeckState.deck?.slides.findIndex((slide) => slide.id === currentSlideId) ?? 0
    const nearestIndex = Math.min(Math.max(removedIndex, 0), slides.length - 1)
    useEditorStore.setState({ currentSlideId: slides[nearestIndex]?.id ?? null, selectedElementIds: [] })
    return
  }

  const stillExistingSelection = selectedElementIds.filter((elementId) =>
    currentSlide.elements.some((element) => element.id === elementId)
  )
  if (stillExistingSelection.length !== selectedElementIds.length) {
    useEditorStore.setState({ selectedElementIds: stillExistingSelection })
  }
})
