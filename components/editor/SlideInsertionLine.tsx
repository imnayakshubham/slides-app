import type { SortingStrategy } from "@dnd-kit/sortable"

// Other slides stay still while dragging; the line shows the drop spot.
export const keepSlidesInPlace: SortingStrategy = () => null

export type SlideInsertion = {
  // The line sits before the slide at this index; the slide count means after the last slide.
  lineIndex: number
  landingSlideNumber: number
}

export type InsertionLine = { side: "before" | "after"; landingSlideNumber: number }

export function slideInsertionFor(activeIndex: number, overIndex: number): SlideInsertion | null {
  if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) return null
  const isMovingDown = overIndex > activeIndex
  return { lineIndex: isMovingDown ? overIndex + 1 : overIndex, landingSlideNumber: overIndex + 1 }
}

// The line for the slide at `index` in a list of `count` slides.
export function insertionLineFor(insertion: SlideInsertion | null, index: number, count: number): InsertionLine | null {
  if (!insertion) return null
  const { lineIndex, landingSlideNumber } = insertion
  if (lineIndex === index) return { side: "before", landingSlideNumber }
  const isLastSlide = index === count - 1
  if (isLastSlide && lineIndex === count) return { side: "after", landingSlideNumber }
  return null
}

export function SlideInsertionLine({ line, gapPx }: { line: InsertionLine; gapPx: number }) {
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
