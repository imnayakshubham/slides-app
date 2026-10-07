"use client"

import { useEffect, useState, type ComponentProps } from "react"
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core"
import type { DragEndEvent, DragMoveEvent, DragOverEvent } from "@dnd-kit/core"
import { SortableContext, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { PlusIcon, SparklesIcon } from "lucide-react"
import { useShallow } from "zustand/react/shallow"

import { DropCursorBadge } from "@/components/canvas/DropCursorBadge"
import { EditableSlide } from "@/components/canvas/EditableSlide"
import { SelectionToolbar } from "@/components/canvas/SelectionToolbar"
import { SlideRail } from "@/components/canvas/SlideRail"
import { AddHereMenu } from "@/components/editor/AddBlockMenu"
import {
  SlideInsertionLine,
  insertionLineFor,
  keepSlidesInPlace,
  slideInsertionFor,
} from "@/components/editor/SlideInsertionLine"
import type { InsertionLine, SlideInsertion } from "@/components/editor/SlideInsertionLine"
import { Button } from "@/components/ui/button"
import { useCanvasGestures } from "@/hooks/UseCanvasGestures"
import { addBlankSlideAfterCurrent, addBlankSlideAt } from "@/lib/client/SlideActions"
import { cn } from "@/lib/utils"
import { selectSlideIds, useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

// A press only becomes a drag after this many pixels, so clicks never nudge anything.
const DRAG_START_DISTANCE_PX = 3
// Matches the canvas list's gap-8, so the insertion line sits mid-gap.
const SLIDE_GAP_PX = 32

// One drag context for both element gestures and slide reordering from the rail handle.
function slideOrderId(slideId: string) {
  return `slide-order:${slideId}`
}

function reorderSlideIdOf(dragData?: Record<string, unknown>) {
  const slideId = dragData?.reorderSlideId
  return typeof slideId === "string" ? slideId : null
}

export function SlideCanvas({ onOpenAgent }: { onOpenAgent: () => void }) {
  const slideIds = useDeckStore(useShallow(selectSlideIds))
  const currentSlideId = useEditorStore((state) => state.currentSlideId)
  const gestures = useCanvasGestures()
  const [insertion, setInsertion] = useState<SlideInsertion | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: DRAG_START_DISTANCE_PX },
    })
  )

  useEffect(() => {
    if (!currentSlideId) return
    document.querySelector(`[data-canvas-slide-id="${currentSlideId}"]`)?.scrollIntoView({ block: "nearest" })
  }, [currentSlideId])

  function handleDragMove(event: DragMoveEvent) {
    const isReorderingSlide = reorderSlideIdOf(event.active.data.current) !== null
    if (!isReorderingSlide) gestures.handleDragMove(event)
  }

  // Runs only when the slide under the pointer changes.
  function handleDragOver(event: DragOverEvent) {
    const draggedSlideId = reorderSlideIdOf(event.active.data.current)
    if (!draggedSlideId) return
    const targetSlideId = reorderSlideIdOf(event.over?.data.current)
    if (!targetSlideId) {
      setInsertion(null)
      return
    }
    setInsertion(slideInsertionFor(slideIds.indexOf(draggedSlideId), slideIds.indexOf(targetSlideId)))
  }

  function handleDragEnd(event: DragEndEvent) {
    const draggedSlideId = reorderSlideIdOf(event.active.data.current)
    if (!draggedSlideId) {
      gestures.handleDragEnd()
      return
    }
    setInsertion(null)
    const targetSlideId = reorderSlideIdOf(event.over?.data.current)
    if (!targetSlideId || targetSlideId === draggedSlideId) return
    useDeckStore.getState().applyEdit({
      type: "moveSlide",
      slideId: draggedSlideId,
      toIndex: slideIds.indexOf(targetSlideId),
    })
  }

  if (slideIds.length === 0) {
    return (
      <div className="grid flex-1 place-items-center p-6 text-center">
        <div className="flex max-w-sm flex-col items-center gap-3">
          <div className="flex flex-col gap-1">
            <p className="font-medium">No slides yet</p>
            <p className="text-sm text-muted-foreground">
              Describe your deck to the agent and it will plan the slides for you to review, or start from a blank
              slide.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={onOpenAgent}>
              <SparklesIcon />
              Describe your deck
            </Button>
            <Button variant="outline" onClick={addBlankSlideAfterCurrent}>
              <PlusIcon />
              Blank slide
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setInsertion(null)
        gestures.handleDragCancel()
      }}
    >
      <div
        data-slide-canvas
        className="relative flex min-w-0 flex-1 flex-col items-center gap-8 overflow-y-auto p-4 md:p-8"
      >
        <SortableContext items={slideIds.map(slideOrderId)} strategy={keepSlidesInPlace}>
          {slideIds.map((slideId, slideIndex) => (
            <SortableSlideRow
              key={slideId}
              slideId={slideId}
              slideNumber={slideIndex + 1}
              insertionLine={insertionLineFor(insertion, slideIndex, slideIds.length)}
              prepareGesture={gestures.prepareGesture}
            />
          ))}
        </SortableContext>
        <Button variant="outline" className="shrink-0 rounded-full" onClick={() => addBlankSlideAt(slideIds.length)}>
          <PlusIcon />
          Add slide
        </Button>
        <SelectionToolbar />
      </div>
      <DropCursorBadge />
      <AddHereMenu />
    </DndContext>
  )
}

// A slide with its rail; only the rail's handle starts a reorder.
function SortableSlideRow({
  slideId,
  slideNumber,
  insertionLine,
  prepareGesture,
}: {
  slideId: string
  slideNumber: number
  insertionLine: InsertionLine | null
  prepareGesture: ComponentProps<typeof EditableSlide>["prepareGesture"]
}) {
  const isCurrentSlide = useEditorStore((state) => state.currentSlideId === slideId)
  const { setNodeRef, setActivatorNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: slideOrderId(slideId),
    data: { reorderSlideId: slideId },
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "group relative flex w-full max-w-5xl shrink-0 flex-col gap-2 sm:max-w-[67rem] sm:flex-row sm:gap-3",
        isDragging && "z-10 opacity-60"
      )}
    >
      {insertionLine && <SlideInsertionLine line={insertionLine} gapPx={SLIDE_GAP_PX} />}
      <SlideRail
        slideId={slideId}
        slideNumber={slideNumber}
        dragHandleListeners={listeners}
        setDragHandleRef={setActivatorNodeRef}
        className={cn(
          "shrink-0 transition-opacity",
          !isCurrentSlide && !isDragging && "lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100"
        )}
      />
      <div className="flex min-w-0 flex-1">
        <EditableSlide slideId={slideId} slideNumber={slideNumber} prepareGesture={prepareGesture} />
      </div>
    </div>
  )
}
