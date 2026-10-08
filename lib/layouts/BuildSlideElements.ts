import { estimateTextHeight, findFreeSpot, type Box } from "@/lib/edits/Geometry"
import { createId, newTimestamps } from "@/lib/utils"
import { slideLayoutSlots } from "@/lib/layouts/SlideLayouts"
import { paragraphFromMarkdown } from "@/lib/ParagraphFromMarkdown"
import { paragraphText } from "@/lib/RichText"
import { ARTBOARD_HEIGHT, MIN_ELEMENT_SIZE, usesHeadingFont } from "@/lib/schema/deck"
import type { Deck, Slide, SlideElement, TextRole } from "@/lib/schema/deck"
import type { SlideContent } from "@/lib/schema/SlideContent"

// Turns the AI's content for one slide into placed elements, shrinking text until it all fits.

type Theme = Deck["theme"]

const SUBTITLE_FONT_SIZE = 36
const BODY_FONT_SIZE = 32
const COLUMN_HEADING_FONT_SIZE = 36
const TAKEAWAY_FONT_SIZE = 28
const EYEBROW_FONT_SIZE = 26
const MIN_FONT_SIZE = 20
const FONT_SIZE_STEP = 2
// Space between pieces stacked in one slot.
const GAP = 32
// A table row at the table's 28px text, with its cell padding.
const TABLE_ROW_HEIGHT = 64

type TextStyle = {
  fontSize: number
  bold?: boolean
  italic?: boolean
  listStyle?: "none" | "bullet"
  align?: "left" | "center"
  role: TextRole
  // Left out: the theme's heading color for title and heading roles, text color otherwise.
  color?: string
}

// Steps the font size down until the text fits the area; the box is as tall as the text.
function fittedText(paragraphs: string[], area: Box, style: TextStyle, theme: Theme): SlideElement {
  const styledParagraphs = paragraphs.map(paragraphFromMarkdown)
  const plainParagraphs = styledParagraphs.map(paragraphText)
  const listStyle = style.listStyle ?? "none"
  let fontSize = style.fontSize
  while (fontSize > MIN_FONT_SIZE && estimateTextHeight(plainParagraphs, fontSize, area.w, listStyle) > area.h) {
    fontSize -= FONT_SIZE_STEP
  }
  const height = estimateTextHeight(plainParagraphs, fontSize, area.w, listStyle)
  return {
    id: createId(),
    ...newTimestamps(),
    type: "text",
    role: style.role,
    x: area.x,
    y: area.y,
    w: area.w,
    h: Math.max(MIN_ELEMENT_SIZE, height),
    paragraphs: styledParagraphs,
    fontSize,
    bold: style.bold ?? false,
    italic: style.italic ?? false,
    color: style.color ?? (usesHeadingFont(style.role) ? theme.colors.heading : theme.colors.text),
    align: style.align ?? "left",
    listStyle,
  }
}

function chartElement(chart: NonNullable<SlideContent["chart"]>, area: Box): SlideElement {
  return {
    id: createId(),
    ...newTimestamps(),
    type: "chart",
    ...area,
    chartType: chart.chartType,
    title: chart.title,
    categories: chart.categories,
    series: chart.series,
    showLegend: chart.series.length > 1 || chart.chartType === "pie",
  }
}

// Only as tall as its rows need, up to the area.
function tableElement(table: NonNullable<SlideContent["table"]>, area: Box): SlideElement {
  return {
    id: createId(),
    ...newTimestamps(),
    type: "table",
    ...area,
    h: Math.min(area.h, table.rows.length * TABLE_ROW_HEIGHT),
    rows: table.rows,
    headerRow: true,
  }
}

function bottomOf(element: SlideElement) {
  return element.y + element.h
}

function areaBelow(area: Box, element: SlideElement): Box {
  const top = bottomOf(element) + GAP
  return { ...area, y: top, h: area.y + area.h - top }
}

// A heading with its bullets right under it, inside one column.
function column(content: NonNullable<SlideContent["left"]>, area: Box, theme: Theme) {
  const heading = fittedText(
    [content.heading],
    { ...area, h: COLUMN_HEADING_FONT_SIZE * 3 },
    { fontSize: COLUMN_HEADING_FONT_SIZE, bold: true, role: "heading" },
    theme
  )
  const bullets = fittedText(
    content.bullets,
    areaBelow(area, heading),
    { fontSize: BODY_FONT_SIZE, listStyle: "bullet", role: "body" },
    theme
  )
  return [heading, bullets]
}

// A visual with an optional one-line takeaway under it.
function visualWithTakeaway(content: SlideContent, area: Box, theme: Theme): SlideElement[] {
  const takeaway = content.takeaway
    ? fittedText([content.takeaway], area, { fontSize: TAKEAWAY_FONT_SIZE, italic: true, role: "body" }, theme)
    : null
  const visualArea = takeaway ? { ...area, h: area.h - takeaway.h - GAP } : area

  const elements: SlideElement[] = []
  if (content.chart) elements.push(chartElement(content.chart, visualArea))
  if (content.table) elements.push(tableElement(content.table, visualArea))
  if (takeaway) {
    const visualBottom = Math.max(...elements.map(bottomOf), area.y)
    elements.push({ ...takeaway, y: visualBottom + GAP })
  }
  return elements
}

function layoutContent(slide: Slide, content: SlideContent, theme: Theme) {
  const slots = slideLayoutSlots[slide.layout]

  switch (slide.layout) {
    case "title":
    case "section": {
      if (!content.subtitle) return []
      // Right under the title, however many lines the title took.
      const title = slide.elements.find((element) => element.type === "text")
      const subtitleArea = title ? { ...slots.subtitle, y: bottomOf(title) + GAP } : slots.subtitle
      return [
        fittedText(
          [content.subtitle],
          { ...subtitleArea, h: ARTBOARD_HEIGHT - 60 - subtitleArea.y },
          { fontSize: SUBTITLE_FONT_SIZE, role: "subtitle" },
          theme
        ),
      ]
    }

    case "two-column":
    case "comparison":
      if (!content.left || !content.right) return []
      return [...column(content.left, slots.left, theme), ...column(content.right, slots.right, theme)]

    case "chart-forward":
      return visualWithTakeaway(content, slots.chart, theme)

    case "content": {
      const fullWidth: Box = {
        ...slots.body,
        w: slots.visual.x + slots.visual.w - slots.body.x,
      }
      const bullets = content.bullets ?? []

      // A chart sits beside the bullets.
      if (content.chart) {
        return [
          fittedText(bullets, slots.body, { fontSize: BODY_FONT_SIZE, listStyle: "bullet", role: "body" }, theme),
          chartElement(content.chart, slots.visual),
        ]
      }
      // A table needs the width, so it goes under the bullets.
      if (content.table) {
        const bulletText = fittedText(
          bullets,
          { ...fullWidth, h: fullWidth.h / 3 },
          { fontSize: BODY_FONT_SIZE, listStyle: "bullet", role: "body" },
          theme
        )
        return [bulletText, tableElement(content.table, areaBelow(fullWidth, bulletText))]
      }
      // Text alone uses the whole width.
      return [fittedText(bullets, fullWidth, { fontSize: BODY_FONT_SIZE, listStyle: "bullet", role: "body" }, theme)]
    }

    case "blank":
      return []
  }
}

// A small uppercase label in the accent color, just above the title.
function eyebrowElement(slide: Slide, content: SlideContent, theme: Theme): SlideElement[] {
  const slot = slideLayoutSlots[slide.layout].eyebrow
  const title = slide.elements.find((element) => element.type === "text")
  if (!content.eyebrow || !slot) return []
  const area = title ? { ...slot, y: title.y - slot.h - 12 } : slot
  return [
    fittedText(
      [content.eyebrow.toUpperCase()],
      area,
      { fontSize: EYEBROW_FONT_SIZE, bold: true, role: "eyebrow", color: theme.colors.accent },
      theme
    ),
  ]
}

export function buildSlideElements(slide: Slide, content: SlideContent, theme: Theme): SlideElement[] {
  // Safety net: each piece is checked against the title and the pieces placed before it.
  const placedElements: SlideElement[] = []
  const elements = [...eyebrowElement(slide, content, theme), ...layoutContent(slide, content, theme)]
  for (const element of elements) {
    const slideSoFar = {
      ...slide,
      elements: [...slide.elements, ...placedElements],
    }
    placedElements.push({ ...element, ...findFreeSpot(slideSoFar, element) })
  }
  return placedElements
}
