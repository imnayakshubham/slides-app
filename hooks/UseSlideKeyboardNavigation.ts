import { useEffect } from "react"

import { isTypingTarget } from "@/lib/IsTypingTarget"
import { useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

const PREVIOUS_SLIDE_KEYS = ["ArrowUp", "PageUp"]
const NEXT_SLIDE_KEYS = ["ArrowDown", "PageDown"]

// Skipped while an element is selected: the arrows will move it (Phase 8).
export function useSlideKeyboardNavigation() {
  useEffect(() => {
    function goToNeighborSlide(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (isTypingTarget(event.target)) return

      let direction = 0
      if (PREVIOUS_SLIDE_KEYS.includes(event.key)) direction = -1
      if (NEXT_SLIDE_KEYS.includes(event.key)) direction = 1
      if (direction === 0) return

      const { currentSlideId, selectedElementIds, goToSlide } =
        useEditorStore.getState()
      if (selectedElementIds.length > 0) return

      const slides = useDeckStore.getState().deck?.slides ?? []
      const currentIndex = slides.findIndex(
        (slide) => slide.id === currentSlideId
      )
      const neighborSlide = slides[currentIndex + direction]
      if (!neighborSlide) return

      event.preventDefault()
      goToSlide(neighborSlide.id)
    }

    window.addEventListener("keydown", goToNeighborSlide)
    return () => window.removeEventListener("keydown", goToNeighborSlide)
  }, [])
}
