"use client"

import { useEffect, useRef, useState } from "react"
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { CopyIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
import { useShallow } from "zustand/react/shallow"

import { AgentWorkingOverlay } from "@/components/canvas/AgentWorkingOverlay"
import { Artboard } from "@/components/canvas/Artboard"
import { DeckTitleInput } from "@/components/editor/DeckTitleInput"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { useAgentSlideActivity } from "@/hooks/UseAgentSlideActivity"
import {
  addBlankSlideAfterCurrent,
  duplicateSlideAfterItself,
} from "@/lib/client/SlideActions"
import { cn } from "@/lib/utils"
import { selectSlideIds, useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

// A mouse press only becomes a drag after this many pixels, so clicking a
// thumbnail still opens the slide. On touch a short hold starts the drag,
// so a swipe still scrolls the list.
const DRAG_START_DISTANCE_PX = 3
const TOUCH_DRAG_HOLD_MS = 250
const TOUCH_DRAG_TOLERANCE_PX = 5

export function SlideNavigator({ onClose }: { onClose: () => void }) {
  const slideIds = useDeckStore(useShallow(selectSlideIds))
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: DRAG_START_DISTANCE_PX },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: TOUCH_DRAG_HOLD_MS,
        tolerance: TOUCH_DRAG_TOLERANCE_PX,
      },
    })
  )

  function moveDraggedSlide({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    useDeckStore.getState().applyEdit({
      type: "moveSlide",
      slideId: String(active.id),
      toIndex: slideIds.indexOf(String(over.id)),
    })
  }

  return (
    <nav
      aria-label="Slides"
      className="m-2 flex w-40 shrink-0 flex-col gap-2 rounded-xl border bg-card p-2 shadow-sm"
    >
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 rounded-full"
          title="Add a blank slide after the current one"
          onClick={addBlankSlideAfterCurrent}
        >
          <PlusIcon />
          Add
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close slides"
          title="Close slides"
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </div>
      {slideIds.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">No slides yet</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={moveDraggedSlide}
        >
          <SortableContext
            items={slideIds}
            strategy={verticalListSortingStrategy}
          >
            <ol className="-mx-1 flex min-h-0 flex-col gap-3 overflow-y-auto px-1 py-1">
              {slideIds.map((slideId, slideIndex) => (
                <SlideThumbnail
                  key={slideId}
                  slideId={slideId}
                  slideNumber={slideIndex + 1}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
    </nav>
  )
}

function SlideThumbnail({
  slideId,
  slideNumber,
}: {
  slideId: string
  slideNumber: number
}) {
  const slideTitle = useDeckStore(
    (state) => state.deck?.slides.find((slide) => slide.id === slideId)?.title
  )
  const isCurrentSlide = useEditorStore(
    (state) => state.currentSlideId === slideId
  )
  const goToSlide = useEditorStore((state) => state.goToSlide)
  const agentActivity = useAgentSlideActivity(slideId)
  const thumbnailRef = useRef<HTMLButtonElement>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const { setNodeRef, listeners, transform, transition, isDragging } =
    useSortable({ id: slideId })

  useEffect(() => {
    if (isCurrentSlide) {
      thumbnailRef.current?.scrollIntoView({ block: "nearest" })
    }
  }, [isCurrentSlide])

  const slideName = slideTitle || "Untitled slide"

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("group relative", isDragging && "z-10 opacity-80")}
    >
      <button
        ref={thumbnailRef}
        {...listeners}
        type="button"
        data-slide-drop-id={slideId}
        aria-current={isCurrentSlide ? "true" : undefined}
        onClick={() => goToSlide(slideId)}
        className="relative block w-full rounded-md outline-none"
      >
        <Artboard
          slideId={slideId}
          isThumbnail
          className={cn(
            "pointer-events-none w-full rounded-sm border shadow-xs transition-shadow group-hover:shadow-sm group-has-focus-visible:ring-2 group-has-focus-visible:ring-ring",
            isCurrentSlide && "ring-2 ring-primary"
          )}
        />
        {agentActivity && <AgentWorkingOverlay size="thumbnail" />}
      </button>
      <div className="mt-1 flex min-w-0 items-center gap-1.5 px-0.5 text-xs">
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {slideNumber}
        </span>
        {isRenaming ? (
          <DeckTitleInput
            title={slideTitle ?? ""}
            label={`Slide ${slideNumber} name`}
            autoFocus
            onRename={(title) =>
              useDeckStore.getState().applyEdit({
                type: "updateSlide",
                slideId,
                changes: { title },
              })
            }
            onFinishEditing={() => setIsRenaming(false)}
            className="-my-0.5 w-full px-1 py-0 font-normal"
          />
        ) : (
          <span className="truncate" onDoubleClick={() => setIsRenaming(true)}>
            {slideName}
          </span>
        )}
      </div>
      <div className="absolute end-1 top-1 flex gap-0.5 lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
        <Button
          variant="secondary"
          size="icon-xs"
          aria-label={`Rename slide ${slideNumber}`}
          title="Rename"
          onClick={() => setIsRenaming(true)}
        >
          <PencilIcon />
        </Button>
        <Button
          variant="secondary"
          size="icon-xs"
          aria-label={`Duplicate slide ${slideNumber}`}
          title="Duplicate"
          onClick={() => duplicateSlideAfterItself(slideId)}
        >
          <CopyIcon />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="secondary"
                size="icon-xs"
                aria-label={`Delete slide ${slideNumber}`}
                title="Delete"
              />
            }
          >
            <Trash2Icon />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete slide {slideNumber}, “{slideName}”?
              </AlertDialogTitle>
              <AlertDialogDescription>
                You can bring it back with Undo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() =>
                  useDeckStore
                    .getState()
                    .applyEdit({ type: "deleteSlide", slideId })
                }
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  )
}
