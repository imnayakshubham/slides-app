"use client"

import { useEffect, useState, type CSSProperties } from "react"
import { useShallow } from "zustand/react/shallow"

import { findElementLocation } from "@/lib/edits/DeckEdits"
import { unionBox, type Box, type ResizeHandle, type SnapGuide } from "@/lib/edits/Geometry"
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH } from "@/lib/schema/deck"
import { useDragPreviewStore } from "@/store/DragPreviewStore"
import { useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

const RESIZE_HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]
// A text box's height follows its text, so it has no top or bottom handle.
const TEXT_RESIZE_HANDLES: ResizeHandle[] = ["nw", "ne", "e", "se", "sw", "w"]

export const RESIZE_CURSORS: Record<ResizeHandle, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
}

// Dividing by --artboard-scale keeps lines and handles the same size on screen at any zoom.
const LINE_WIDTH = "calc(1.5px / var(--artboard-scale))"
const HANDLE_HIT_SIZE = "calc(16px / var(--artboard-scale))"
const HANDLE_DOT_SIZE = "calc(10px / var(--artboard-scale))"

// Selection frames, resize handles, snap guides and the selection box, drawn in slide units.
export function SelectionFrame() {
  const selectedElementIds = useEditorStore((state) => state.selectedElementIds)
  const editingElementId = useEditorStore((state) => state.editingElementId)
  const previewBoxes = useDragPreviewStore((state) => state.previewBoxes)
  const guides = useDragPreviewStore((state) => state.guides)
  const marqueeBox = useDragPreviewStore((state) => state.marqueeBox)
  const selectedElements = useDeckStore(
    useShallow((state) =>
      selectedElementIds
        .map((elementId) => (state.deck ? findElementLocation(state.deck, elementId)?.element : undefined))
        .filter((element) => element !== undefined)
    )
  )
  const textHeights = useTextHeights(
    selectedElements.filter((element) => element.type === "text").map((element) => element.id)
  )

  const selectedBoxes = selectedElements.map((element) => {
    const box = previewBoxes[element.id] ?? element
    const h = element.type === "text" ? (textHeights[element.id] ?? box.h) : box.h
    return {
      elementId: element.id,
      isText: element.type === "text",
      box: { ...box, h },
    }
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
        (singleSelection.isText ? TEXT_RESIZE_HANDLES : RESIZE_HANDLES).map((handle) => (
          <ResizeHandleDot
            key={handle}
            handle={handle}
            elementId={singleSelection.elementId}
            box={singleSelection.box}
          />
        ))}

      {guides.map((guide, guideIndex) => (
        <div key={guideIndex} className="absolute bg-primary" style={guideStyle(guide)} />
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

function ResizeHandleDot({ handle, elementId, box }: { handle: ResizeHandle; elementId: string; box: Box }) {
  let left = box.x + box.w / 2
  if (handle.includes("w")) left = box.x
  if (handle.includes("e")) left = box.x + box.w
  let top = box.y + box.h / 2
  if (handle.includes("n")) top = box.y
  if (handle.includes("s")) top = box.y + box.h

  return (
    <div
      data-handle={handle}
      data-handle-element-id={elementId}
      className="pointer-events-auto absolute grid -translate-x-1/2 -translate-y-1/2 touch-none place-items-center"
      style={{
        left,
        top,
        width: HANDLE_HIT_SIZE,
        height: HANDLE_HIT_SIZE,
        cursor: RESIZE_CURSORS[handle],
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

// Text boxes grow with their text, so the frame follows the height as it changes.
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
      const node = document.querySelector(`[data-canvas-slide-id] [data-element-id="${elementId}"]`)
      if (node) resizeObserver.observe(node)
    }
    return () => resizeObserver.disconnect()
  }, [idsKey])

  return heights
}
