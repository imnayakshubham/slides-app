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
import { TableElement } from "@/components/elements/TableElement"
import { TextElement } from "@/components/elements/TextElement"
import {
  ARTBOARD_HEIGHT,
  ARTBOARD_WIDTH,
  type Deck,
  type Paragraph,
  type SlideBackground,
} from "@/lib/schema/Deck"
import { cn } from "@/lib/utils"
import { useDragPreviewStore } from "@/store/DragPreviewStore"
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
            ...slideBackgroundStyle(background, theme),
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
  const isEditing = useEditorStore(
    (state) => !isThumbnail && state.editingElementId === elementId
  )
  const isAgentTouched = useEditorStore(
    (state) => !isThumbnail && state.agentTouchedElementIds.includes(elementId)
  )
  // During a drag or resize the live box comes from the gesture store.
  const previewBox = useDragPreviewStore((state) =>
    isThumbnail ? undefined : state.previewBoxes[elementId]
  )
  if (!element) return null
  const box = previewBox ?? element

  function finishEditingTable(rows: string[][]) {
    useEditorStore.getState().setEditingElementId(null)
    if (element?.type === "table" && sameRows(element.rows, rows)) return
    useDeckStore.getState().applyEdit({
      type: "updateElement",
      elementId,
      changes: { rows },
    })
  }

  function finishEditingText(paragraphs: Paragraph[], height: number) {
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
      // except while it is being typed into.
      className={cn(
        "absolute",
        !isEditing && "*:pointer-events-none",
        !isThumbnail && "touch-none",
        !isThumbnail && (isEditing ? "cursor-text" : "cursor-move"),
        // A brief glow where the agent just added or changed something.
        "outline-[6px] outline-offset-4 transition-[outline-color] duration-700 outline-solid",
        isAgentTouched ? "outline-primary/70" : "outline-transparent"
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
          isEditing={isEditing}
          onFinishEditing={finishEditingText}
        />
      ) : element.type === "table" && isEditing ? (
        <TableElement
          element={element}
          theme={theme}
          isEditing
          onFinishEditing={finishEditingTable}
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

function sameRows(rows: string[][], otherRows: string[][]) {
  return JSON.stringify(rows) === JSON.stringify(otherRows)
}

// Compares styling too, so restyling words without retyping still saves.
function sameText(paragraphs: Paragraph[], otherParagraphs: Paragraph[]) {
  return JSON.stringify(paragraphs) === JSON.stringify(otherParagraphs)
}

function slideBackgroundStyle(
  background: SlideBackground | undefined,
  theme: Deck["theme"]
): CSSProperties {
  if (!background) return { background: theme.colors.background }
  if (background.type === "color") return { background: background.color }
  if (background.type === "gradient") {
    return {
      background: `linear-gradient(${background.angle}deg, ${background.from}, ${background.to})`,
    }
  }
  return {
    backgroundColor: theme.colors.background,
    backgroundImage: `url("${background.src}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  }
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
