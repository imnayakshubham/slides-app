import { createId } from "@/lib/Ids"
import { estimateTextHeight, type Box } from "@/lib/edits/Geometry"
import { MIN_ELEMENT_SIZE, type Deck, type Slide, type SlideElement, type SlideLayout } from "@/lib/schema/Deck"

// Every layout with a title leaves room for a short eyebrow label above it.
const standardEyebrowSlot: Box = { x: 120, y: 64, w: 1680, h: 48 }
const standardTitleSlot: Box = { x: 120, y: 120, w: 1680, h: 130 }
const leftColumnSlot: Box = { x: 120, y: 290, w: 820, h: 710 }
const rightColumnSlot: Box = { x: 980, y: 290, w: 820, h: 710 }

export const slideLayoutSlots: Record<SlideLayout, Record<string, Box>> = {
  // Cover and section slides sit low and left, like a magazine cover.
  title: {
    eyebrow: { x: 160, y: 420, w: 1600, h: 48 },
    title: { x: 160, y: 480, w: 1600, h: 240 },
    subtitle: { x: 160, y: 750, w: 1400, h: 140 },
  },
  section: {
    eyebrow: { x: 160, y: 440, w: 1600, h: 48 },
    title: { x: 160, y: 500, w: 1600, h: 200 },
    subtitle: { x: 160, y: 730, w: 1400, h: 120 },
  },
  content: {
    eyebrow: standardEyebrowSlot,
    title: standardTitleSlot,
    body: { x: 120, y: 290, w: 880, h: 710 },
    visual: { x: 1060, y: 290, w: 740, h: 710 },
  },
  "two-column": {
    eyebrow: standardEyebrowSlot,
    title: standardTitleSlot,
    left: leftColumnSlot,
    right: rightColumnSlot,
  },
  comparison: {
    eyebrow: standardEyebrowSlot,
    title: standardTitleSlot,
    left: leftColumnSlot,
    right: rightColumnSlot,
  },
  "chart-forward": {
    eyebrow: standardEyebrowSlot,
    title: standardTitleSlot,
    chart: { x: 120, y: 290, w: 1680, h: 710 },
  },
  blank: {},
}

const titleFontSizeByLayout: Record<SlideLayout, number> = {
  title: 104,
  section: 88,
  content: 60,
  "two-column": 60,
  comparison: 60,
  "chart-forward": 60,
  blank: 60,
}

// The title is in the theme's heading font and color, and its box is as
// tall as the text needs, so content placed under it never overlaps.
export function createSlide(layout: SlideLayout, title: string, theme: Deck["theme"]): Slide {
  const titleSlot = slideLayoutSlots[layout].title
  const fontSize = titleFontSizeByLayout[layout]

  return {
    id: createId(),
    title,
    layout,
    notes: "",
    elements: titleSlot
      ? [
          {
            id: createId(),
            type: "text",
            ...titleSlot,
            h: Math.max(MIN_ELEMENT_SIZE, estimateTextHeight([title], fontSize, titleSlot.w, "none")),
            paragraphs: [title],
            fontSize,
            bold: true,
            italic: false,
            color: theme.colors.heading,
            align: "left",
            listStyle: "none",
            font: "heading",
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
