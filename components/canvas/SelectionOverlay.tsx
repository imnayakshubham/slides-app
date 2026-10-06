"use client"

import { useEffect, useState, type CSSProperties } from "react"
import { useShallow } from "zustand/react/shallow"

import { findElementLocation } from "@/lib/edits/DeckEdits"
import {
  unionBox,
  type Box,
  type Corner,
  type SnapGuide,
} from "@/lib/edits/Geometry"
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH } from "@/lib/schema/Deck"
import { useCanvasGestureStore } from "@/store/CanvasGestureStore"
import { useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

const CORNERS: Corner[] = ["nw", "ne", "sw", "se"]
const CORNER_CURSORS: Record<Corner, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
}

// The artboard is scaled down; dividing by --artboard-scale keeps these
// lines and handles the same size on screen at any zoom.
const LINE_WIDTH = "calc(1.5px / var(--artboard-scale))"
const HANDLE_HIT_SIZE = "calc(16px / var(--artboard-scale))"
const HANDLE_DOT_SIZE = "calc(10px / var(--artboard-scale))"

// Drawn inside the current slide's artboard, in slide units: selection
// frames, resize handles, snap guides and the selection box.
export function SelectionOverlay() {
  const selectedElementIds = useEditorStore((state) => state.selectedElementIds)
  const editingElementId = useEditorStore((state) => state.editingElementId)
  const previewBoxes = useCanvasGestureStore((state) => state.previewBoxes)
  const guides = useCanvasGestureStore((state) => state.guides)
  const marqueeBox = useCanvasGestureStore((state) => state.marqueeBox)
  const selectedElements = useDeckStore(
    useShallow((state) =>
      selectedElementIds
        .map((elementId) =>
          state.deck
            ? findElementLocation(state.deck, elementId)?.element
            : undefined
        )
        .filter((element) => element !== undefined)
    )
  )
  const textHeights = useTextHeights(
    selectedElements
      .filter((element) => element.type === "text")
      .map((element) => element.id)
  )

  const selectedBoxes = selectedElements.map((element) => {
    const box = previewBoxes[element.id] ?? element
    const h =
      element.type === "text" ? (textHeights[element.id] ?? box.h) : box.h
    return { elementId: element.id, box: { ...box, h } }
  })
  const singleSelection = selectedBoxes.length === 1 ? selectedBoxes[0] : null
  const showHandles = singleSelection && editingElementId === null

  return (
    <div className="pointer-events-none absolute inset-0">
      {selectedBoxes.map(({ elementId, box }) => (
        <div
          key={elementId}
          className="absolute"
          style={{
            ...boxStyle(box),
            outline: `${LINE_WIDTH} solid var(--primary)`,
          }}
        />
      ))}

      {selectedBoxes.length > 1 && (
        <div
          className="absolute"
          style={{
            ...boxStyle(unionBox(selectedBoxes.map(({ box }) => box))),
            outline: `${LINE_WIDTH} dashed var(--primary)`,
          }}
        />
      )}

      {showHandles &&
        CORNERS.map((corner) => (
          <ResizeHandle
            key={corner}
            corner={corner}
            elementId={singleSelection.elementId}
            box={singleSelection.box}
          />
        ))}

      {guides.map((guide, guideIndex) => (
        <div
          key={guideIndex}
          className="absolute bg-primary"
          style={guideStyle(guide)}
        />
      ))}

      {marqueeBox && (
        <div
          className="absolute bg-primary/10"
          style={{
            ...boxStyle(marqueeBox),
            outline: `${LINE_WIDTH} solid var(--primary)`,
          }}
        />
      )}
    </div>
  )
}

function ResizeHandle({
  corner,
  elementId,
  box,
}: {
  corner: Corner
  elementId: string
  box: Box
}) {
  const left = corner === "nw" || corner === "sw" ? box.x : box.x + box.w
  const top = corner === "nw" || corner === "ne" ? box.y : box.y + box.h

  return (
    <div
      data-handle={corner}
      data-handle-element-id={elementId}
      className="pointer-events-auto absolute grid -translate-x-1/2 -translate-y-1/2 touch-none place-items-center"
      style={{
        left,
        top,
        width: HANDLE_HIT_SIZE,
        height: HANDLE_HIT_SIZE,
        cursor: CORNER_CURSORS[corner],
      }}
    >
      <span
        className="rounded-full bg-background shadow-sm"
        style={{
          width: HANDLE_DOT_SIZE,
          height: HANDLE_DOT_SIZE,
          border: `${LINE_WIDTH} solid var(--primary)`,
        }}
      />
    </div>
  )
}

function boxStyle(box: Box): CSSProperties {
  return { left: box.x, top: box.y, width: box.w, height: box.h }
}

function guideStyle(guide: SnapGuide): CSSProperties {
  if (guide.orientation === "vertical") {
    return {
      left: guide.position,
      top: 0,
      width: LINE_WIDTH,
      height: ARTBOARD_HEIGHT,
    }
  }
  return {
    left: 0,
    top: guide.position,
    width: ARTBOARD_WIDTH,
    height: LINE_WIDTH,
  }
}

// Text boxes grow with their text, so the frame follows the laid-out height
// (it changes while resizing, typing or changing the font size).
function useTextHeights(textElementIds: string[]) {
  const [heights, setHeights] = useState<Record<string, number>>({})
  const idsKey = textElementIds.join(",")

  useEffect(() => {
    if (!idsKey) return
    const resizeObserver = new ResizeObserver((entries) => {
      setHeights((current) => {
        const next = { ...current }
        for (const entry of entries) {
          const node = entry.target as HTMLElement
          const elementId = node.dataset.elementId
          if (elementId) next[elementId] = node.offsetHeight
        }
        return next
      })
    })
    for (const elementId of idsKey.split(",")) {
      const node = document.querySelector(
        `[data-canvas-slide-id] [data-element-id="${elementId}"]`
      )
      if (node) resizeObserver.observe(node)
    }
    return () => resizeObserver.disconnect()
  }, [idsKey])

  return heights
}
