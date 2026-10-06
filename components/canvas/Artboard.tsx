"use client"

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { useShallow } from "zustand/react/shallow"

import { ElementRenderer } from "@/components/elements/ElementRenderer"
import { TextElement } from "@/components/elements/TextElement"
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH, type Deck } from "@/lib/schema/Deck"
import { cn } from "@/lib/utils"
import { useCanvasGestureStore } from "@/store/CanvasGestureStore"
import { useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

type ArtboardProps = {
  slideId: string
  isThumbnail?: boolean
  className?: string
  // Drawn on top of the elements, in slide units (the selection overlay).
  children?: ReactNode
}

export function Artboard({
  slideId,
  isThumbnail = false,
  className,
  children,
}: ArtboardProps) {
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
          data-artboard
          className="absolute top-0 left-0 origin-top-left"
          style={{
            width: ARTBOARD_WIDTH,
            height: ARTBOARD_HEIGHT,
            transform: `scale(${scale})`,
            // Lets the overlay keep lines and handles a fixed size on screen.
            ...({ "--artboard-scale": scale } as CSSProperties),
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
              isThumbnail={isThumbnail}
            />
          ))}
          {children}
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
  isThumbnail,
}: {
  slideId: string
  elementId: string
  theme: Deck["theme"]
  isThumbnail: boolean
}) {
  const element = useDeckStore((state) =>
    findSlide(state.deck, slideId)?.elements.find(
      (slideElement) => slideElement.id === elementId
    )
  )
  const isEditingText = useEditorStore(
    (state) => !isThumbnail && state.editingElementId === elementId
  )
  // During a drag or resize the live box comes from the gesture store.
  const previewBox = useCanvasGestureStore((state) =>
    isThumbnail ? undefined : state.previewBoxes[elementId]
  )
  if (!element) return null
  const box = previewBox ?? element

  function finishEditingText(paragraphs: string[], height: number) {
    useEditorStore.getState().setEditingElementId(null)
    if (element?.type === "text" && sameText(element.paragraphs, paragraphs)) {
      return
    }
    useDeckStore.getState().applyEdit({
      type: "updateElement",
      elementId,
      changes: { paragraphs, h: Math.round(height) },
    })
  }

  return (
    <div
      data-element-id={element.id}
      data-element-type={element.type}
      // Content ignores the pointer so clicks and drags land on this box,
      // except while its text is being typed into.
      className={cn(
        "absolute",
        !isEditingText && "*:pointer-events-none",
        !isThumbnail && "touch-none",
        !isThumbnail && (isEditingText ? "cursor-text" : "cursor-move")
      )}
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        // Text boxes grow with their text instead of overflowing.
        height: element.type === "text" ? "auto" : box.h,
      }}
    >
      {element.type === "text" ? (
        <TextElement
          element={element}
          isEditing={isEditingText}
          onFinishEditing={finishEditingText}
        />
      ) : (
        <ElementRenderer
          element={element}
          theme={theme}
          animate={!isThumbnail}
        />
      )}
    </div>
  )
}

function sameText(paragraphs: string[], otherParagraphs: string[]) {
  return paragraphs.join("\n") === otherParagraphs.join("\n")
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
