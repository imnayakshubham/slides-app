"use client"

import { useEffect, useRef, useState } from "react"
import { useShallow } from "zustand/react/shallow"

import { ElementRenderer } from "@/components/elements/ElementRenderer"
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH, type Deck } from "@/lib/schema/Deck"
import { cn } from "@/lib/utils"
import { useDeckStore } from "@/store/DeckStore"

type ArtboardProps = {
  slideId: string
  // Thumbnails turn this off: no chart animations, no position transitions.
  animate: boolean
  className?: string
}

// One slide at its true 1920×1080 size, scaled to fit the container's width.
// The canvas and the navigator thumbnails both render through this.
export function Artboard({ slideId, animate, className }: ArtboardProps) {
  const { containerRef, scale } = useArtboardScale()
  const theme = useDeckStore((state) => state.deck?.theme)
  const background = useDeckStore(
    (state) => findSlide(state.deck, slideId)?.background
  )
  const elementIds = useDeckStore(
    useShallow(
      (state) =>
        findSlide(state.deck, slideId)?.elements.map((element) => element.id) ??
        []
    )
  )

  return (
    <div
      ref={containerRef}
      className={cn("relative aspect-video overflow-hidden", className)}
    >
      {theme && (
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{
            width: ARTBOARD_WIDTH,
            height: ARTBOARD_HEIGHT,
            transform: `scale(${scale})`,
            background: background || theme.colors.background,
            color: theme.colors.text,
            // The deck's font first; the app font if it is not installed.
            fontFamily: `${theme.fontFamily}, var(--font-sans)`,
          }}
        >
          {elementIds.map((elementId) => (
            <PositionedElement
              key={elementId}
              slideId={slideId}
              elementId={elementId}
              theme={theme}
              animate={animate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Subscribes to its own element only: edits keep unchanged element references,
// so editing one element does not re-render the rest of the slide.
function PositionedElement({
  slideId,
  elementId,
  theme,
  animate,
}: {
  slideId: string
  elementId: string
  theme: Deck["theme"]
  animate: boolean
}) {
  const element = useDeckStore((state) =>
    findSlide(state.deck, slideId)?.elements.find(
      (slideElement) => slideElement.id === elementId
    )
  )
  if (!element) return null

  return (
    <div
      data-element-id={element.id}
      className={cn(
        "absolute",
        animate &&
          "transition-[left,top,width,height] duration-300 ease-out motion-reduce:transition-none"
      )}
      style={{
        left: element.x,
        top: element.y,
        width: element.w,
        height: element.h,
      }}
    >
      <ElementRenderer element={element} theme={theme} animate={animate} />
    </div>
  )
}

function findSlide(deck: Deck | null, slideId: string) {
  return deck?.slides.find((slide) => slide.id === slideId)
}

function useArtboardScale() {
  const containerRef = useRef<HTMLDivElement>(null)
  // 0 until measured, so nothing flashes at full size before the first layout.
  const [scale, setScale] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setScale(Math.min(width / ARTBOARD_WIDTH, height / ARTBOARD_HEIGHT))
    })
    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [])

  return { containerRef, scale }
}
