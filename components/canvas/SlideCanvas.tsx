"use client"

import { useEffect, type ComponentProps } from "react"
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { PlusIcon, SparklesIcon } from "lucide-react"
import { useShallow } from "zustand/react/shallow"

import { DropCursorBadge } from "@/components/canvas/DropCursorBadge"
import { EditableSlide } from "@/components/canvas/EditableSlide"
import { SelectionToolbar } from "@/components/canvas/SelectionToolbar"
import { SlideRail } from "@/components/canvas/SlideRail"
import { Button } from "@/components/ui/button"
import { useCanvasGestures } from "@/hooks/UseCanvasGestures"
import { addBlankSlideAfterCurrent } from "@/lib/client/SlideActions"
import { cn } from "@/lib/utils"
import { selectSlideIds, useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

// A press only becomes a drag after this many screen pixels, so clicks
// never nudge anything.
const DRAG_START_DISTANCE_PX = 3

// The canvas has two kinds of drag in one DndContext: element gestures
// (each slide is a draggable with its slide id) and slide reordering from
// the rail's handle (sortable rows with these ids).
type SlideOrderData = { kind: "slideOrder"; slideId: string }

function slideOrderId(slideId: string) {
  return `slide-order:${slideId}`
}

function slideOrderData(data: unknown): SlideOrderData | null {
  const candidate = data as Partial<SlideOrderData> | undefined
  return candidate?.kind === "slideOrder" ? (candidate as SlideOrderData) : null
}

export function SlideCanvas({ onOpenAgent }: { onOpenAgent: () => void }) {
  const slideIds = useDeckStore(useShallow(selectSlideIds))
  const currentSlideId = useEditorStore((state) => state.currentSlideId)
  const gestures = useCanvasGestures()
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: DRAG_START_DISTANCE_PX },
    })
  )

  useEffect(() => {
    if (!currentSlideId) return
    document
      .querySelector(`[data-canvas-slide-id="${currentSlideId}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [currentSlideId])

  // Set while the rail's handle drags a slide, so the element gesture
  // handlers stay out of it.
  function isReorderingSlide(event: DragMoveEvent) {
    return slideOrderData(event.active.data.current) !== null
  }

  function handleDragMove(event: DragMoveEvent) {
    if (!isReorderingSlide(event)) gestures.handleDragMove(event)
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!isReorderingSlide(event)) {
      gestures.handleDragEnd()
      return
    }
    const draggedSlide = slideOrderData(event.active.data.current)
    const targetSlide = slideOrderData(event.over?.data.current)
    if (!draggedSlide || !targetSlide) return
    if (draggedSlide.slideId === targetSlide.slideId) return
    useDeckStore.getState().applyEdit({
      type: "moveSlide",
      slideId: draggedSlide.slideId,
      toIndex: slideIds.indexOf(targetSlide.slideId),
    })
  }

  if (slideIds.length === 0) {
    return (
      <div className="grid flex-1 place-items-center p-6 text-center">
        <div className="flex max-w-sm flex-col items-center gap-3">
          <div className="flex flex-col gap-1">
            <p className="font-medium">No slides yet</p>
            <p className="text-sm text-muted-foreground">
              Describe your deck to the agent and it will plan the slides for
              you to review, or start from a blank slide.
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
      onDragEnd={handleDragEnd}
      onDragCancel={gestures.handleDragCancel}
    >
      <div
        data-slide-canvas
        className="relative flex min-w-0 flex-1 flex-col items-center gap-8 overflow-y-auto p-4 md:p-8"
      >
        <SortableContext
          items={slideIds.map(slideOrderId)}
          strategy={verticalListSortingStrategy}
        >
          {slideIds.map((slideId, slideIndex) => (
            <SortableSlideRow
              key={slideId}
              slideId={slideId}
              slideNumber={slideIndex + 1}
              prepareGesture={gestures.prepareGesture}
            />
          ))}
        </SortableContext>
        <SelectionToolbar />
      </div>
      <DropCursorBadge />
    </DndContext>
  )
}

// A slide with its rail. Only the rail's handle starts a reorder; presses on
// the slide itself stay element gestures.
function SortableSlideRow({
  slideId,
  slideNumber,
  prepareGesture,
}: {
  slideId: string
  slideNumber: number
  prepareGesture: ComponentProps<typeof EditableSlide>["prepareGesture"]
}) {
  const isCurrentSlide = useEditorStore(
    (state) => state.currentSlideId === slideId
  )
  const {
    setNodeRef,
    setActivatorNodeRef,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: slideOrderId(slideId),
    data: { kind: "slideOrder", slideId } satisfies SlideOrderData,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "group flex w-full max-w-5xl shrink-0 flex-col gap-2 sm:max-w-[67rem] sm:flex-row sm:gap-3",
        isDragging && "z-10 opacity-80"
      )}
    >
      <SlideRail
        slideId={slideId}
        slideNumber={slideNumber}
        dragHandleListeners={listeners}
        setDragHandleRef={setActivatorNodeRef}
        className={cn(
          "shrink-0 transition-opacity",
          !isCurrentSlide &&
            !isDragging &&
            "lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100"
        )}
      />
      <div className="flex min-w-0 flex-1">
        <EditableSlide
          slideId={slideId}
          slideNumber={slideNumber}
          prepareGesture={prepareGesture}
        />
      </div>
    </div>
  )
}
