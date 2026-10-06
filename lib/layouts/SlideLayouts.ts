import { createId } from "@/lib/Ids"
import type { Box } from "@/lib/edits/Geometry"
import type { Deck, Slide, SlideElement, SlideLayout } from "@/lib/schema/Deck"

const standardTitleSlot: Box = { x: 120, y: 80, w: 1680, h: 140 }
const leftColumnSlot: Box = { x: 120, y: 260, w: 820, h: 740 }
const rightColumnSlot: Box = { x: 980, y: 260, w: 820, h: 740 }

export const slideLayoutSlots: Record<SlideLayout, Record<string, Box>> = {
  title: {
    title: { x: 160, y: 380, w: 1600, h: 200 },
    subtitle: { x: 160, y: 600, w: 1600, h: 120 },
  },
  section: {
    title: { x: 160, y: 420, w: 1600, h: 160 },
    subtitle: { x: 160, y: 600, w: 1600, h: 100 },
  },
  content: {
    title: standardTitleSlot,
    body: { x: 120, y: 260, w: 880, h: 740 },
    visual: { x: 1060, y: 260, w: 740, h: 740 },
  },
  "two-column": {
    title: standardTitleSlot,
    left: leftColumnSlot,
    right: rightColumnSlot,
  },
  comparison: {
    title: standardTitleSlot,
    left: leftColumnSlot,
    right: rightColumnSlot,
  },
  "chart-forward": {
    title: standardTitleSlot,
    chart: { x: 120, y: 260, w: 1680, h: 740 },
  },
  blank: {},
}

const titleFontSizeByLayout: Record<SlideLayout, number> = {
  title: 96,
  section: 80,
  content: 56,
  "two-column": 56,
  comparison: 56,
  "chart-forward": 56,
  blank: 56,
}

export function createSlide(
  layout: SlideLayout,
  title: string,
  theme: Deck["theme"]
): Slide {
  const titleSlot = slideLayoutSlots[layout].title
  const isCenteredLayout = layout === "title" || layout === "section"

  return {
    id: createId(),
    title,
    layout,
    background: theme.colors.background,
    notes: "",
    elements: titleSlot
      ? [
          {
            id: createId(),
            type: "text",
            ...titleSlot,
            paragraphs: [title],
            fontSize: titleFontSizeByLayout[layout],
            bold: true,
            italic: false,
            color: theme.colors.text,
            align: isCenteredLayout ? "center" : "left",
            listStyle: "none",
          },
        ]
      : [],
  }
}

export function duplicateSlide(slide: Slide): Slide {
  return {
    ...slide,
    id: createId(),
    elements: slide.elements.map((element) => ({
      ...element,
      id: createId(),
    })),
  }
}

const DUPLICATE_OFFSET = 20

export function duplicateElement(element: SlideElement): SlideElement {
  return {
    ...element,
    id: createId(),
    x: element.x + DUPLICATE_OFFSET,
    y: element.y + DUPLICATE_OFFSET,
  }
}
