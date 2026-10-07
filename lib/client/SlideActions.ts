import { createSlide, duplicateSlide } from "@/lib/layouts/SlideLayouts"
import { useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

// Slide actions for the navigator and canvas; each is one undo step and opens the new slide.

// `index` is where the new slide goes; the slide count adds it at the end.
export function addBlankSlideAt(index: number) {
  const { deck, applyEdit } = useDeckStore.getState()
  if (!deck) return
  const newSlide = createSlide("blank", "", deck.theme)
  const result = applyEdit({ type: "addSlide", slide: newSlide, index })
  if (result.ok) useEditorStore.getState().goToSlide(newSlide.id)
}

// With no current slide, the new slide goes at the end.
export function addBlankSlideAfterCurrent() {
  const deck = useDeckStore.getState().deck
  if (!deck) return
  const currentSlideIndex = deck.slides.findIndex((slide) => slide.id === useEditorStore.getState().currentSlideId)
  addBlankSlideAt(currentSlideIndex === -1 ? deck.slides.length : currentSlideIndex + 1)
}

export function duplicateSlideAfterItself(slideId: string) {
  const { deck, applyEdit } = useDeckStore.getState()
  if (!deck) return
  const slideIndex = deck.slides.findIndex((slide) => slide.id === slideId)
  if (slideIndex === -1) return
  const copy = duplicateSlide(deck.slides[slideIndex])
  const result = applyEdit({
    type: "addSlide",
    slide: copy,
    index: slideIndex + 1,
  })
  if (result.ok) useEditorStore.getState().goToSlide(copy.id)
}
