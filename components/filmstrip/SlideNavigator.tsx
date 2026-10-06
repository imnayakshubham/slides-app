"use client"

import { useEffect, useRef } from "react"
import { PlusIcon, XIcon } from "lucide-react"
import { useShallow } from "zustand/react/shallow"

import { Artboard } from "@/components/canvas/Artboard"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { selectSlideIds, useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

export function SlideNavigator({ onClose }: { onClose: () => void }) {
  const slideIds = useDeckStore(useShallow(selectSlideIds))

  return (
    <nav
      aria-label="Slides"
      className="m-2 flex w-40 shrink-0 flex-col gap-2 rounded-xl border bg-card p-2 shadow-sm"
    >
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" className="flex-1 rounded-full">
          <PlusIcon />
          Add
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close slides"
          title="Close slides"
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </div>
      {slideIds.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">No slides yet</p>
      ) : (
        <ol className="-mx-1 flex min-h-0 flex-col gap-3 overflow-y-auto px-1 py-1">
          {slideIds.map((slideId, slideIndex) => (
            <li key={slideId}>
              <SlideThumbnail slideId={slideId} slideNumber={slideIndex + 1} />
            </li>
          ))}
        </ol>
      )}
    </nav>
  )
}

function SlideThumbnail({
  slideId,
  slideNumber,
}: {
  slideId: string
  slideNumber: number
}) {
  const slideTitle = useDeckStore(
    (state) => state.deck?.slides.find((slide) => slide.id === slideId)?.title
  )
  const isCurrentSlide = useEditorStore(
    (state) => state.currentSlideId === slideId
  )
  const goToSlide = useEditorStore((state) => state.goToSlide)
  const thumbnailRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (isCurrentSlide) {
      thumbnailRef.current?.scrollIntoView({ block: "nearest" })
    }
  }, [isCurrentSlide])

  return (
    <button
      ref={thumbnailRef}
      type="button"
      data-slide-drop-id={slideId}
      aria-current={isCurrentSlide ? "true" : undefined}
      onClick={() => goToSlide(slideId)}
      className="group flex w-full flex-col gap-1 rounded-md text-start outline-none"
    >
      <Artboard
        slideId={slideId}
        isThumbnail
        className={cn(
          "pointer-events-none w-full rounded-sm border shadow-xs transition-shadow group-hover:shadow-sm group-focus-visible:ring-2 group-focus-visible:ring-ring",
          isCurrentSlide && "ring-2 ring-primary"
        )}
      />
      <span className="flex min-w-0 gap-1.5 px-0.5 text-xs">
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {slideNumber}
        </span>
        <span className="truncate">{slideTitle || "Untitled slide"}</span>
      </span>
    </button>
  )
}
