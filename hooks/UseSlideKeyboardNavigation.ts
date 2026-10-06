import { useEffect } from "react"

import { isTypingTarget } from "@/lib/IsTypingTarget"
import { useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

const PREVIOUS_SLIDE_KEYS = ["ArrowUp", "PageUp"]
const NEXT_SLIDE_KEYS = ["ArrowDown", "PageDown"]

// Arrow keys move the selected element once canvas editing lands (Phase 8),
// so slide navigation only applies while nothing is selected.
export function useSlideKeyboardNavigation() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const step = PREVIOUS_SLIDE_KEYS.includes(event.key)
        ? -1
        : NEXT_SLIDE_KEYS.includes(event.key)
          ? 1
          : 0
      if (step === 0 || event.altKey || event.ctrlKey || event.metaKey) return
      if (isTypingTarget(event.target)) return

      const { currentSlideId, selectedElementIds, goToSlide } =
        useEditorStore.getState()
      if (selectedElementIds.length > 0) return

      const slides = useDeckStore.getState().deck?.slides ?? []
      const currentIndex = slides.findIndex(
        (slide) => slide.id === currentSlideId
      )
      const targetSlide = slides[currentIndex + step]
      if (!targetSlide) return

      event.preventDefault()
      goToSlide(targetSlide.id)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])
}
