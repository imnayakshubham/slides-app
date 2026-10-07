import type { SortingStrategy } from "@dnd-kit/sortable"

// Slide reordering shows where the slide will land with a line instead of
// shifting the other slides around, so the other slides stay still.
export const keepSlidesInPlace: SortingStrategy = () => null

export type SlideInsertion = {
  // The line sits right before the slide at this index (the slide count
  // means after the last slide).
  lineIndex: number
  // The dragged slide's number once dropped.
  landingSlideNumber: number
}

// Null when the slide would land where it already is.
export function slideInsertionFor(
  activeIndex: number,
  overIndex: number
): SlideInsertion | null {
  if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) {
    return null
  }
  const isMovingDown = overIndex > activeIndex
  return {
    lineIndex: isMovingDown ? overIndex + 1 : overIndex,
    landingSlideNumber: overIndex + 1,
  }
}

export type InsertionLine = {
  side: "before" | "after"
  landingSlideNumber: number
}

// The line to draw on the slide at `slideIndex`: above it, below it (only
// the last slide), or none.
export function insertionLineFor(
  insertion: SlideInsertion | null,
  slideIndex: number,
  slideCount: number
): InsertionLine | null {
  if (!insertion) return null
  const { lineIndex, landingSlideNumber } = insertion
  if (lineIndex === slideIndex) return { side: "before", landingSlideNumber }
  const isLastSlide = slideIndex === slideCount - 1
  if (isLastSlide && lineIndex === slideCount) {
    return { side: "after", landingSlideNumber }
  }
  return null
}

// Drawn centered in the gap above or below a slide; `gapPx` is the space
// between two slides in that list.
export function SlideInsertionLine({
  line,
  gapPx,
}: {
  line: InsertionLine
  gapPx: number
}) {
  const { side, landingSlideNumber } = line
  const offset = -gapPx / 2
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
      style={
        side === "before"
          ? { top: offset, transform: "translateY(-50%)" }
          : { bottom: offset, transform: "translateY(50%)" }
      }
    >
      <span className="size-2.5 shrink-0 rounded-full bg-primary" />
      <span className="h-1 flex-1 rounded-full bg-primary" />
      <span className="ms-1 shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground shadow-sm">
        Slide {landingSlideNumber}
      </span>
    </div>
  )
}
