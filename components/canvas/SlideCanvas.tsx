"use client"

import { useEffect } from "react"
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import { PlusIcon, SparklesIcon } from "lucide-react"
import { useShallow } from "zustand/react/shallow"

import { EditableSlide } from "@/components/canvas/EditableSlide"
import { SelectionToolbar } from "@/components/canvas/SelectionToolbar"
import { Button } from "@/components/ui/button"
import { useCanvasGestures } from "@/hooks/UseCanvasGestures"
import { addBlankSlideAfterCurrent } from "@/lib/client/SlideActions"
import { selectSlideIds, useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

// A press only becomes a drag after this many screen pixels, so clicks
// never nudge anything.
const DRAG_START_DISTANCE_PX = 3

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
      onDragMove={gestures.handleDragMove}
      onDragEnd={gestures.handleDragEnd}
      onDragCancel={gestures.handleDragCancel}
    >
      <div
        data-slide-canvas
        className="relative flex min-w-0 flex-1 flex-col items-center gap-8 overflow-y-auto p-4 md:p-8"
      >
        {slideIds.map((slideId, slideIndex) => (
          <EditableSlide
            key={slideId}
            slideId={slideId}
            slideNumber={slideIndex + 1}
            prepareGesture={gestures.prepareGesture}
          />
        ))}
        <SelectionToolbar />
      </div>
    </DndContext>
  )
}
