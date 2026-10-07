"use client"

import { useLayoutEffect, useRef } from "react"
import { BringToFrontIcon, CopyIcon, SendToBackIcon, Trash2Icon } from "lucide-react"
import { useShallow } from "zustand/react/shallow"

import { ChartControls } from "@/components/canvas/toolbar/ChartControls"
import { ImageControls } from "@/components/canvas/toolbar/ImageControls"
import { ShapeControls } from "@/components/canvas/toolbar/ShapeControls"
import { TableControls } from "@/components/canvas/toolbar/TableControls"
import { TextControls } from "@/components/canvas/toolbar/TextControls"
import { ToolbarDivider, ToolbarToggle } from "@/components/canvas/toolbar/ToolbarInputs"
import {
  deleteSelectedElements,
  duplicateSelectedElements,
  moveSelectedElementInStack,
} from "@/lib/client/SelectedElementActions"
import { findElementLocation } from "@/lib/edits/DeckEdits"
import type { SlideElement } from "@/lib/schema/Deck"
import { useDragPreviewStore } from "@/store/DragPreviewStore"
import { useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

const GAP_TO_SELECTION_PX = 10
const GAP_TO_EDGE_PX = 8

function getSelectedElementNodes() {
  return useEditorStore
    .getState()
    .selectedElementIds.map((elementId) =>
      document.querySelector<HTMLElement>(`[data-canvas-slide-id] [data-element-id="${elementId}"]`)
    )
    .filter((node) => node !== null)
}

// Floats above the selection (below if there's no room) with controls for that element type.
export function SelectionToolbar() {
  const isGestureActive = useDragPreviewStore((state) => state.isActive)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const selectedElementIds = useEditorStore((state) => state.selectedElementIds)
  const selectedElements = useDeckStore(
    useShallow((state) =>
      selectedElementIds
        .map((elementId) => (state.deck ? findElementLocation(state.deck, elementId)?.element : undefined))
        .filter((element) => element !== undefined)
    )
  )

  // Moved by setting its style directly, so it doesn't re-render.
  useLayoutEffect(() => {
    function placeToolbar() {
      const toolbar = toolbarRef.current
      const canvas = toolbar?.closest<HTMLElement>("[data-slide-canvas]")
      const selectionRects = getSelectedElementNodes().map((node) => node.getBoundingClientRect())
      if (!toolbar || !canvas || selectionRects.length === 0) return

      const canvasRect = canvas.getBoundingClientRect()
      const selectionTop = Math.min(...selectionRects.map((rect) => rect.top))
      const selectionBottom = Math.max(...selectionRects.map((rect) => rect.bottom))
      const selectionLeft = Math.min(...selectionRects.map((rect) => rect.left))
      const selectionRight = Math.max(...selectionRects.map((rect) => rect.right))

      const fitsAbove = selectionTop - canvasRect.top >= toolbar.offsetHeight + GAP_TO_SELECTION_PX
      const top = fitsAbove
        ? selectionTop - toolbar.offsetHeight - GAP_TO_SELECTION_PX
        : selectionBottom + GAP_TO_SELECTION_PX

      const centeredLeft = (selectionLeft + selectionRight) / 2 - toolbar.offsetWidth / 2
      const maxLeft = canvasRect.left + canvas.clientWidth - toolbar.offsetWidth - GAP_TO_EDGE_PX
      const left = Math.max(canvasRect.left + GAP_TO_EDGE_PX, Math.min(centeredLeft, maxLeft))

      toolbar.style.top = `${top - canvasRect.top + canvas.scrollTop}px`
      toolbar.style.left = `${left - canvasRect.left + canvas.scrollLeft}px`
      toolbar.style.visibility = "visible"
    }

    placeToolbar()
    window.addEventListener("resize", placeToolbar)
    return () => window.removeEventListener("resize", placeToolbar)
  }, [selectedElements, isGestureActive])

  if (selectedElements.length === 0 || isGestureActive) return null

  const singleElement = selectedElements.length === 1 ? selectedElements[0] : null

  return (
    <div
      ref={toolbarRef}
      data-selection-toolbar
      role="toolbar"
      aria-label="Element"
      // Keeps focus (and an open text edit) where it is when a button is pressed.
      onMouseDown={(event) => {
        const target = event.target as HTMLElement
        if (!target.closest("input, select")) event.preventDefault()
      }}
      className="invisible absolute z-10 flex max-w-[calc(100%-1rem)] animate-in flex-wrap items-center gap-0.5 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg duration-150 fade-in"
    >
      {singleElement && (
        <>
          <ElementTypeControls element={singleElement} />
          <ToolbarDivider />
          <ToolbarToggle label="Bring forward" onClick={() => moveSelectedElementInStack("forward")}>
            <BringToFrontIcon />
          </ToolbarToggle>
          <ToolbarToggle label="Send backward" onClick={() => moveSelectedElementInStack("backward")}>
            <SendToBackIcon />
          </ToolbarToggle>
        </>
      )}
      <ToolbarToggle label="Duplicate" onClick={duplicateSelectedElements}>
        <CopyIcon />
      </ToolbarToggle>
      <ToolbarToggle label="Delete" onClick={deleteSelectedElements}>
        <Trash2Icon />
      </ToolbarToggle>
    </div>
  )
}

function ElementTypeControls({ element }: { element: SlideElement }) {
  switch (element.type) {
    case "text":
      return <TextControls element={element} />
    case "shape":
      return <ShapeControls key={element.id} element={element} />
    case "image":
      return <ImageControls element={element} />
    case "chart":
      return <ChartControls element={element} />
    case "table":
      return <TableControls element={element} />
  }
}
