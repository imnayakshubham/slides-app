import type { Slide } from "@/lib/schema/deck"
import { useDeckStore } from "@/store/deck-store"

// Stable empty array: a fresh [] per render would make the store selector loop.
const NO_SLIDES: Slide[] = []

// All slides stacked vertically; element rendering arrives in Phase 4.
export function SlideCanvas() {
  const slides = useDeckStore((state) => state.deck?.slides ?? NO_SLIDES)

  if (slides.length === 0) {
    return (
      <div className="grid flex-1 place-items-center p-6 text-center">
        <div className="flex max-w-sm flex-col gap-1">
          <p className="font-medium">No slides yet</p>
          <p className="text-sm text-muted-foreground">
            Ask the agent to build the deck, or add a blank slide.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-8 overflow-y-auto p-4 md:p-8">
      {slides.map((slide) => (
        <article
          key={slide.id}
          aria-label={slide.title}
          className="aspect-video w-full max-w-5xl shrink-0 rounded-sm shadow-md"
          style={{ background: slide.background }}
        />
      ))}
    </div>
  )
}
