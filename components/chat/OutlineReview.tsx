"use client"

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVerticalIcon, SparklesIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  discardOutline,
  generateApprovedOutline,
  moveOutlineSlide,
  removeOutlineSlide,
  renameOutlineSlide,
} from "@/lib/client/AgentActions"
import type { OutlineSlide } from "@/lib/schema/Outline"
import { cn } from "@/lib/utils"
import { useEditorStore } from "@/store/EditorStore"

const LAYOUT_LABELS: Record<OutlineSlide["layout"], string> = {
  title: "Title",
  section: "Section",
  content: "Content",
  "two-column": "Two columns",
  comparison: "Comparison",
  "chart-forward": "Chart",
}

// The planned slides, editable before anything is added to the deck:
// rename, drag to reorder, remove, then Generate (or Cmd/Ctrl+Enter).
export function OutlineReview({ messageId }: { messageId: string }) {
  const outlineReview = useEditorStore((state) =>
    state.outlineReview?.messageId === messageId ? state.outlineReview : null
  )
  const isAgentRunning = useEditorStore((state) => state.isAgentRunning)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )
  if (!outlineReview) return null

  const { outline, slideKeys } = outlineReview
  const hasUntitledSlide = outline.slides.some((slide) => !slide.title.trim())
  const canGenerate =
    !isAgentRunning && outline.slides.length > 0 && !hasUntitledSlide

  function moveDraggedSlide({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    moveOutlineSlide(
      slideKeys.indexOf(String(active.id)),
      slideKeys.indexOf(String(over.id))
    )
  }

  return (
    <section
      aria-label="Outline review"
      onKeyDown={(event) => {
        const isGenerateShortcut =
          event.key === "Enter" && (event.metaKey || event.ctrlKey)
        if (isGenerateShortcut && canGenerate) void generateApprovedOutline()
      }}
      className="flex flex-col gap-2 rounded-xl border bg-card p-2"
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={moveDraggedSlide}
      >
        <SortableContext
          items={slideKeys}
          strategy={verticalListSortingStrategy}
        >
          <ol className="flex flex-col gap-1">
            {outline.slides.map((slide, slideIndex) => (
              <OutlineSlideRow
                key={slideKeys[slideIndex]}
                rowKey={slideKeys[slideIndex]}
                slide={slide}
                slideIndex={slideIndex}
                canRemove={outline.slides.length > 1}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <div className="flex flex-wrap items-center gap-2 border-t pt-2">
        <Button
          size="sm"
          disabled={!canGenerate}
          onClick={() => void generateApprovedOutline()}
          title="Generate (Cmd/Ctrl+Enter)"
        >
          <SparklesIcon />
          Generate {outline.slides.length} slides
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={isAgentRunning}
          onClick={discardOutline}
        >
          Cancel
        </Button>
        {hasUntitledSlide && (
          <span className="text-xs text-muted-foreground">
            Every slide needs a title.
          </span>
        )}
      </div>
    </section>
  )
}

function OutlineSlideRow({
  rowKey,
  slide,
  slideIndex,
  canRemove,
}: {
  rowKey: string
  slide: OutlineSlide
  slideIndex: number
  canRemove: boolean
}) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rowKey })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "flex items-start gap-1 rounded-lg bg-card py-1 pe-1",
        isDragging && "relative z-10 shadow-md"
      )}
    >
      <button
        type="button"
        aria-label={`Reorder slide ${slideIndex + 1}`}
        title="Drag to reorder"
        className="mt-1 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-muted"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <span className="mt-1 w-4 shrink-0 text-xs text-muted-foreground tabular-nums">
        {slideIndex + 1}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <input
          aria-label={`Slide ${slideIndex + 1} title`}
          value={slide.title}
          onChange={(event) =>
            renameOutlineSlide(slideIndex, event.target.value)
          }
          className="w-full rounded-md bg-transparent px-1 py-0.5 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="flex flex-wrap gap-1 px-1 text-xs text-muted-foreground">
          <span>{LAYOUT_LABELS[slide.layout]}</span>
          {slide.wantsChart && <OutlineBadge>Chart</OutlineBadge>}
          {slide.wantsTable && <OutlineBadge>Table</OutlineBadge>}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove slide ${slideIndex + 1}`}
        title="Remove slide"
        disabled={!canRemove}
        onClick={() => removeOutlineSlide(slideIndex)}
      >
        <XIcon />
      </Button>
    </li>
  )
}

function OutlineBadge({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-muted px-1.5 text-[0.7rem] text-foreground">
      {children}
    </span>
  )
}
