"use client"

import { useEffect, useRef, useState } from "react"
import { useShallow } from "zustand/react/shallow"

import { ElementRenderer } from "@/components/elements/ElementRenderer"
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH, type Deck } from "@/lib/schema/Deck"
import { cn } from "@/lib/utils"
import { useDeckStore } from "@/store/DeckStore"

type ArtboardProps = {
  slideId: string
  animate: boolean
  className?: string
}

export function Artboard({ slideId, animate, className }: ArtboardProps) {
  const { containerRef, scale } = useArtboardScale()
  const theme = useDeckStore((state) => state.deck?.theme)
  const background = useDeckStore(
    (state) => findSlide(state.deck, slideId)?.background
  )
  // useShallow: the list is rebuilt each time, so compare it by contents.
  const elementIds = useDeckStore(
    useShallow((state) => getElementIds(state.deck, slideId))
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

// Reads only its own element, so editing one element doesn't re-render the others.
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

function getElementIds(deck: Deck | null, slideId: string) {
  const slide = findSlide(deck, slideId)
  if (!slide) return []
  return slide.elements.map((element) => element.id)
}

function useArtboardScale() {
  const containerRef = useRef<HTMLDivElement>(null)
  // 0 until measured, so the slide never flashes at full size.
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
