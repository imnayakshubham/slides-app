"use client"

import { useRef, type MouseEvent, type PointerEvent } from "react"
import { useDraggable } from "@dnd-kit/core"

import { AgentWorkingOverlay } from "@/components/canvas/AgentWorkingOverlay"
import { Artboard } from "@/components/canvas/Artboard"
import { SelectionFrame } from "@/components/canvas/SelectionFrame"
import { useAgentSlideActivity } from "@/hooks/UseAgentSlideActivity"
import { ARTBOARD_WIDTH } from "@/lib/schema/Deck"
import { cn } from "@/lib/utils"
import { useDragPreviewStore } from "@/store/DragPreviewStore"
import { useEditorStore } from "@/store/EditorStore"

// A press that moves further than this draws a selection box instead of opening "Add here".
const CLICK_MOVE_TOLERANCE_PX = 4

type EditableSlideProps = {
  slideId: string
  slideNumber: number
  prepareGesture: (event: PointerEvent<HTMLElement>, slideId: string) => boolean
}

// One slide on the canvas. A press on it moves, resizes or draws a selection box.
export function EditableSlide({ slideId, slideNumber, prepareGesture }: EditableSlideProps) {
  const isCurrentSlide = useEditorStore((state) => state.currentSlideId === slideId)
  const { setNodeRef, listeners } = useDraggable({ id: slideId })
  const agentActivity = useAgentSlideActivity(slideId)
  // Locked while the agent changes this slide, so edits can't collide.
  const isLockedByAgent = agentActivity !== null
  const dropTarget = useDragPreviewStore((state) => (state.dropTarget?.slideId === slideId ? state.dropTarget : null))
  // "Add here" opens only if nothing was selected or edited, so a deselect click stays a deselect.
  const pressRef = useRef<{
    x: number
    y: number
    canOpenAddHere: boolean
  } | null>(null)

  function rememberPress(event: PointerEvent<HTMLElement>) {
    const editor = useEditorStore.getState()
    pressRef.current = {
      x: event.clientX,
      y: event.clientY,
      canOpenAddHere:
        isCurrentSlide &&
        editor.selectedElementIds.length === 0 &&
        editor.editingElementId === null &&
        editor.addHereMenu === null,
    }
  }

  // A plain click on an empty spot opens "Add here" at that spot.
  function openAddHereOnEmptyClick(event: MouseEvent<HTMLElement>) {
    const press = pressRef.current
    pressRef.current = null
    if (!press?.canOpenAddHere || isLockedByAgent) return
    const movedDistance = Math.hypot(event.clientX - press.x, event.clientY - press.y)
    if (movedDistance > CLICK_MOVE_TOLERANCE_PX) return
    const target = event.target as HTMLElement
    if (target.closest("[data-element-id], [data-handle]")) return
    const artboard = event.currentTarget.querySelector<HTMLElement>("[data-artboard]")
    if (!artboard) return

    const artboardRect = artboard.getBoundingClientRect()
    const scale = artboardRect.width / ARTBOARD_WIDTH
    useEditorStore.getState().setAddHereMenu({
      screenPoint: { x: event.clientX, y: event.clientY },
      slidePoint: {
        x: Math.round((event.clientX - artboardRect.left) / scale),
        y: Math.round((event.clientY - artboardRect.top) / scale),
      },
    })
  }

  // Text boxes and tables are typed into in place.
  function startEditingInPlace(event: MouseEvent<HTMLElement>) {
    if (isLockedByAgent) return
    const elementNode = (event.target as HTMLElement).closest<HTMLElement>("[data-element-id]")
    const elementId = elementNode?.dataset.elementId
    const elementType = elementNode?.dataset.elementType
    if (!elementId || (elementType !== "text" && elementType !== "table")) {
      return
    }
    const { setSelectedElementIds, setEditingElementId } = useEditorStore.getState()
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
        if (isLockedByAgent) return
        rememberPress(event)
        if (prepareGesture(event, slideId)) listeners?.onPointerDown?.(event)
      }}
      onClick={openAddHereOnEmptyClick}
      onDoubleClick={startEditingInPlace}
      className={cn(
        "relative w-full max-w-5xl shrink-0 scroll-m-4 rounded-lg shadow-sm ring-1 ring-foreground/10 transition-shadow select-none md:scroll-m-8",
        isCurrentSlide && "shadow-lg ring-2 ring-primary/60",
        dropTarget && "ring-4 ring-primary"
      )}
    >
      <Artboard slideId={slideId} className="rounded-lg">
        {isCurrentSlide && <SelectionFrame />}
      </Artboard>
      {agentActivity && <AgentWorkingOverlay size="slide" label={agentActivity} isLocked />}
      {dropTarget && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 grid place-items-center rounded-lg bg-primary/10"
        >
          <span className="rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-md">
            {dropTarget.isCopy ? "Copy" : "Move"} to slide {dropTarget.slideNumber}
          </span>
        </div>
      )}
    </article>
  )
}
