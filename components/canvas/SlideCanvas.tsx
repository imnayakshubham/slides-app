"use client"

import { useEffect } from "react"
import { useShallow } from "zustand/react/shallow"

import { Artboard } from "@/components/canvas/Artboard"
import { cn } from "@/lib/utils"
import { selectSlideIds, useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

export function SlideCanvas() {
  const slideIds = useDeckStore(useShallow(selectSlideIds))
  const currentSlideId = useEditorStore((state) => state.currentSlideId)
  const goToSlide = useEditorStore((state) => state.goToSlide)

  useEffect(() => {
    if (!currentSlideId) return
    document
      .querySelector(`[data-canvas-slide-id="${currentSlideId}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [currentSlideId])

  if (slideIds.length === 0) {
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
      {slideIds.map((slideId, slideIndex) => (
        <article
          key={slideId}
          data-canvas-slide-id={slideId}
          aria-label={`Slide ${slideIndex + 1}`}
          aria-current={slideId === currentSlideId ? "true" : undefined}
          onPointerDown={() => goToSlide(slideId)}
          className={cn(
            "w-full max-w-5xl shrink-0 scroll-m-4 rounded-sm shadow-md ring-offset-4 ring-offset-muted md:scroll-m-8",
            slideId === currentSlideId && "ring-2 ring-primary"
          )}
        >
          <Artboard slideId={slideId} animate className="rounded-sm" />
        </article>
      ))}
    </div>
  )
}
