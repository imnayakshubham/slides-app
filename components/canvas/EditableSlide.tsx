"use client"

import type { MouseEvent, PointerEvent } from "react"
import { useDraggable } from "@dnd-kit/core"

import { Artboard } from "@/components/canvas/Artboard"
import { SelectionOverlay } from "@/components/canvas/SelectionOverlay"
import { cn } from "@/lib/utils"
import { useEditorStore } from "@/store/EditorStore"

type EditableSlideProps = {
  slideId: string
  slideNumber: number
  prepareGesture: (event: PointerEvent<HTMLElement>, slideId: string) => boolean
}

// One slide on the canvas. The whole slide is a single dnd-kit draggable:
// prepareGesture picks what the drag does (move, resize or selection box)
// before dnd-kit starts tracking the pointer.
export function EditableSlide({
  slideId,
  slideNumber,
  prepareGesture,
}: EditableSlideProps) {
  const isCurrentSlide = useEditorStore(
    (state) => state.currentSlideId === slideId
  )
  const { setNodeRef, listeners } = useDraggable({ id: slideId })

  // Text boxes and tables are typed into in place.
  function startEditingInPlace(event: MouseEvent<HTMLElement>) {
    const elementNode = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-element-id]"
    )
    const elementId = elementNode?.dataset.elementId
    const elementType = elementNode?.dataset.elementType
    if (!elementId || (elementType !== "text" && elementType !== "table")) {
      return
    }
    const { setSelectedElementIds, setEditingElementId } =
      useEditorStore.getState()
    setSelectedElementIds([elementId])
    setEditingElementId(elementId)
  }

  return (
    <article
      ref={setNodeRef}
      data-canvas-slide-id={slideId}
      aria-label={`Slide ${slideNumber}`}
      aria-current={isCurrentSlide ? "true" : undefined}
      onPointerDown={(event) => {
        if (prepareGesture(event, slideId)) listeners?.onPointerDown?.(event)
      }}
      onDoubleClick={startEditingInPlace}
      className={cn(
        "w-full max-w-5xl shrink-0 scroll-m-4 rounded-sm shadow-md ring-offset-4 ring-offset-muted select-none md:scroll-m-8",
        isCurrentSlide && "ring-2 ring-primary"
      )}
    >
      <Artboard slideId={slideId} className="rounded-sm">
        {isCurrentSlide && <SelectionOverlay />}
      </Artboard>
    </article>
  )
}
