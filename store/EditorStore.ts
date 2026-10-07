import type { Editor } from "@tiptap/react"
import { create } from "zustand"

import { useDeckStore } from "@/store/DeckStore"

type Point = { x: number; y: number }

type AddHereMenu = {
  screenPoint: Point
  // Where the new element goes, in slide units (1920 x 1080).
  slidePoint: Point
}

type EditorStore = {
  currentSlideId: string | null
  selectedElementIds: string[]
  goToSlide: (slideId: string) => void
  setSelectedElementIds: (elementIds: string[]) => void
  editingElementId: string | null
  setEditingElementId: (elementId: string | null) => void
  activeTextEditor: Editor | null
  setActiveTextEditor: (editor: Editor | null) => void
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
      addHereMenu: null,
    }),

  setSelectedElementIds: (elementIds) => set({ selectedElementIds: elementIds }),

  editingElementId: null,
  setEditingElementId: (elementId) => set({ editingElementId: elementId }),

  activeTextEditor: null,
  setActiveTextEditor: (editor) => set({ activeTextEditor: editor }),

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
