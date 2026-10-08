import "server-only"

import { tool, type ToolSet } from "ai"
import { z } from "zod"

import { applyDeckEdit, findElementLocation, type DeckEdit } from "@/lib/edits/DeckEdits"
import { estimateTextHeight, findFreeSpot, overlappingElementIds, placeWithoutOverlap } from "@/lib/edits/Geometry"
import type { Box } from "@/lib/edits/Geometry"
import { createId } from "@/lib/Ids"
import { newTimestamps } from "@/lib/Timestamps"
import { imagePlaceholderSrc } from "@/lib/layouts/ImagePlaceholder"
import { createSlide, duplicateSlide, slideLayoutSlots } from "@/lib/layouts/SlideLayouts"
import {
  ARTBOARD_HEIGHT,
  ARTBOARD_WIDTH,
  MIN_ELEMENT_SIZE,
  TEXT_ROLES,
  slideLayoutSchema,
  usesHeadingFont,
} from "@/lib/schema/Deck"
import type { Deck, ElementChanges, Slide, SlideElement } from "@/lib/schema/Deck"
import { paragraphText } from "@/lib/RichText"

const DEFAULT_TEXT_FONT_SIZE = 40
const DEFAULT_NEW_ELEMENT_WIDTH = 800
const DEFAULT_NEW_ELEMENT_HEIGHT = 450

const slideIdInput = z.string().describe("Slide id.")
const elementIdInput = z.string().describe("Element id.")

const boxInput = z
  .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
  .describe("[x, y, w, h] on the 1920x1080 artboard; w and h at least 40.")

const slotInput = z.string().optional().describe("A slot from the slide's slots in the deck context. Prefer over box.")

const chartTypeInput = z.enum(["bar", "line", "pie", "area", "stackedBar"])
const chartTitleInput = z.string().describe("Empty for no title.")
const chartCategoriesInput = z.array(z.string()).min(1).describe("X-axis labels, or pie slice names.")
const chartSeriesInput = z
  .array(
    z.object({
      name: z.string(),
      data: z.array(z.number()).describe("One number per category."),
      color: z.string().optional().describe("CSS color; omit for theme."),
    })
  )
  .min(1)
  .describe("A pie shows only the first.")

// All optional, so one tool covers text, image and shape elements.
const elementStyleInputs = {
  role: z.enum(TEXT_ROLES).optional().describe("Default body."),
  paragraphs: z.array(z.string()).optional().describe("One per paragraph or list item."),
  fontSize: z.number().positive().optional().describe("px."),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  color: z.string().optional().describe("Text CSS color."),
  align: z.enum(["left", "center", "right"]).optional(),
  listStyle: z.enum(["none", "bullet", "number"]).optional(),
  src: z.string().optional().describe("Image URL. Omit unless sure it works; alt makes a placeholder."),
  alt: z.string().optional().describe("What the image shows. Required without src."),
  fit: z.enum(["cover", "contain"]).optional(),
  shape: z.enum(["rect", "ellipse"]).optional(),
  fill: z.string().optional().describe("CSS color."),
  stroke: z.string().optional().describe("CSS color."),
  strokeWidth: z.number().min(0).optional(),
}

// A warning means the change was made but needs a fix, e.g. it overlaps because the slide is full.
// `label` is the line the chat shows for this change.
type ToolResult = { ok: true; label: string; createdIds: string[]; warning?: string } | { ok: false; error: string }

function overlapWarning(overlapsWith: string[]) {
  if (overlapsWith.length === 0) return undefined
  return `There was no free space, so it overlaps ${overlapsWith.join(", ")}. Move, shrink or remove something so nothing overlaps.`
}

function withWarning(result: ToolResult, warning: string | undefined) {
  if (!result.ok || !warning) return result
  return { ...result, warning }
}

// Text boxes are saved as tall as their text, so placement sees their real size.
function withTextHeight(element: SlideElement): SlideElement {
  if (element.type !== "text") return element
  const height = estimateTextHeight(
    element.paragraphs.map(paragraphText),
    element.fontSize,
    element.w,
    element.listStyle
  )
  return { ...element, h: Math.max(MIN_ELEMENT_SIZE, height) }
}

// Tools change `workingDeck` so later tool calls in the same request see earlier changes.
// `onEdit` sends each valid change to the browser as soon as it is made.
export function createAgentTools(deck: Deck, onEdit: (edit: DeckEdit, label: string) => void): ToolSet {
  let workingDeck = deck

  function applyChange(edit: DeckEdit, label: string, createdIds: string[] = []): ToolResult {
    const result = applyDeckEdit(workingDeck, edit)
    if (!result.ok) return reportError(result.error)

    workingDeck = result.deck
    onEdit(edit, label)
    return { ok: true, label, createdIds }
  }

  // Returned, not thrown, so the model reads the error and retries.
  function reportError(error: string): ToolResult {
    return { ok: false, error }
  }

  // Every element the agent adds lands in free space when there is any.
  function addElementToSlide(slideId: string, element: SlideElement, label: string) {
    const slide = findSlide(workingDeck, slideId)
    if (!slide) return reportError(`Slide "${slideId}" does not exist.`)
    const sizedElement = withTextHeight(element)
    const { box, overlapsWith } = placeWithoutOverlap(slide, sizedElement)
    const result = applyChange({ type: "addElement", slideId, element: { ...sizedElement, ...box } }, label, [
      element.id,
    ])
    return withWarning(result, overlapWarning(overlapsWith))
  }

  return {
    get_slide: tool({
      description: "Full details of a slide and its elements.",
      inputSchema: z.object({ slideId: slideIdInput }),
      execute: ({ slideId }) => {
        const slide = findSlide(workingDeck, slideId)
        if (!slide) return reportError(`Slide "${slideId}" does not exist.`)
        return slide
      },
    }),

    add_slide: tool({
      description: "Add a slide. Returns its id and its title element id.",
      inputSchema: z.object({
        layout: slideLayoutSchema,
        title: z.string(),
        index: z.number().int().optional().describe("0-based; omit for the end."),
      }),
      execute: ({ layout, title, index }) => {
        const slide = createSlide(layout, title, workingDeck.theme)
        const titleElementIds = slide.elements.map((element) => element.id)
        return applyChange({ type: "addSlide", slide, index }, `Added slide "${title}"`, [slide.id, ...titleElementIds])
      },
    }),

    update_slide: tool({
      description: "Change a slide's title, background or notes. For the title text on the slide, use update_element.",
      inputSchema: z.object({
        slideId: slideIdInput,
        title: z.string().optional(),
        background: z.string().optional().describe("CSS color."),
        notes: z.string().optional(),
      }),
      // Leaves out fields that weren't sent, so they aren't overwritten with undefined.
      execute: ({ slideId, background, ...otherChanges }) => {
        const changes = background
          ? {
              ...otherChanges,
              background: { type: "color" as const, color: background },
            }
          : otherChanges
        return applyChange({ type: "updateSlide", slideId, changes }, `Updated ${describeSlide(workingDeck, slideId)}`)
      },
    }),

    delete_slide: tool({
      description: "Delete a slide and everything on it.",
      inputSchema: z.object({ slideId: slideIdInput }),
      execute: ({ slideId }) =>
        applyChange({ type: "deleteSlide", slideId }, `Deleted ${describeSlide(workingDeck, slideId)}`),
    }),

    reorder_slides: tool({
      description: "Move a slide to a new position.",
      inputSchema: z.object({
        slideId: slideIdInput,
        toIndex: z.number().int().describe("0-based."),
      }),
      execute: ({ slideId, toIndex }) =>
        applyChange(
          { type: "moveSlide", slideId, toIndex },
          `Moved ${describeSlide(workingDeck, slideId)} to position ${toIndex + 1}`
        ),
    }),

    duplicate_slide: tool({
      description: "Copy a slide to right after it. Returns the copy's id.",
      inputSchema: z.object({ slideId: slideIdInput }),
      execute: ({ slideId }) => {
        const slideIndex = workingDeck.slides.findIndex((slide) => slide.id === slideId)
        if (slideIndex === -1) {
          return reportError(`Slide "${slideId}" does not exist.`)
        }

        const copy = duplicateSlide(workingDeck.slides[slideIndex])
        return applyChange(
          { type: "addSlide", slide: copy, index: slideIndex + 1 },
          `Duplicated slide ${slideIndex + 1}`,
          [copy.id]
        )
      },
    }),

    change_layout: tool({
      description: "Change a slide's layout. Elements keep their positions.",
      inputSchema: z.object({
        slideId: slideIdInput,
        layout: slideLayoutSchema,
      }),
      execute: ({ slideId, layout }) =>
        applyChange(
          { type: "updateSlide", slideId, changes: { layout } },
          `Changed ${describeSlide(workingDeck, slideId)} to the ${layout} layout`
        ),
    }),

    add_element: tool({
      description: "Add a text, image or shape. Returns its id.",
      inputSchema: z.object({
        slideId: slideIdInput,
        type: z.enum(["text", "image", "shape"]),
        slot: slotInput,
        box: boxInput.optional(),
        ...elementStyleInputs,
      }),
      execute: ({ slideId, type, slot, box, ...style }) => {
        const slide = findSlide(workingDeck, slideId)
        if (!slide) return reportError(`Slide "${slideId}" does not exist.`)
        const position = choosePosition(slide, slot, box)
        if (typeof position === "string") return reportError(position)

        const { colors } = workingDeck.theme
        const elementId = createId()
        let element: SlideElement

        if (type === "text") {
          const role = style.role ?? "body"
          element = {
            id: elementId,
            ...newTimestamps(),
            type: "text",
            role,
            ...position,
            paragraphs: style.paragraphs ?? [""],
            fontSize: style.fontSize ?? DEFAULT_TEXT_FONT_SIZE,
            bold: style.bold ?? false,
            italic: style.italic ?? false,
            color: style.color ?? (usesHeadingFont(role) ? colors.heading : colors.text),
            align: style.align ?? "left",
            listStyle: style.listStyle ?? "none",
          }
        } else if (type === "image") {
          const description = style.alt?.trim() ?? ""
          if (!style.src && !description) {
            return reportError("An image needs a src URL or an alt description for a placeholder.")
          }
          element = {
            id: elementId,
            ...newTimestamps(),
            type: "image",
            ...position,
            src: style.src ?? imagePlaceholderSrc(description, workingDeck.theme),
            alt: description,
            fit: style.fit ?? "cover",
          }
        } else {
          element = {
            id: elementId,
            ...newTimestamps(),
            type: "shape",
            ...position,
            shape: style.shape ?? "rect",
            fill: style.fill ?? colors.accent,
            stroke: style.stroke ?? colors.accent,
            strokeWidth: style.strokeWidth ?? 0,
          }
        }

        return addElementToSlide(slideId, element, `Added ${type} to ${describeSlide(workingDeck, slideId)}`)
      },
    }),

    update_element: tool({
      description: "Edit a text, image or shape. Send only the fields to change.",
      inputSchema: z.object({
        elementId: elementIdInput,
        changes: z.object(elementStyleInputs),
      }),
      execute: ({ elementId, changes }) => {
        const location = findElementLocation(workingDeck, elementId)
        // Fields from another element type fail validation in applyDeckEdit.
        let fullChanges = changes as ElementChanges
        let warning: string | undefined

        // Rewritten text gets its new height, and the model is told if it now overlaps something.
        const changesTextSize = changes.paragraphs || changes.fontSize || changes.listStyle
        if (location?.element.type === "text" && changesTextSize) {
          const resizedText = withTextHeight({
            ...location.element,
            ...fullChanges,
          } as SlideElement)
          fullChanges = { ...fullChanges, h: resizedText.h }
          warning = overlapWarning(overlappingElementIds(location.slide, resizedText, elementId))
        }

        const result = applyChange(
          { type: "updateElement", elementId, changes: fullChanges },
          `Edited ${describeElement(workingDeck, elementId)}`
        )
        return withWarning(result, warning)
      },
    }),

    delete_element: tool({
      description: "Delete an element.",
      inputSchema: z.object({ elementId: elementIdInput }),
      execute: ({ elementId }) =>
        applyChange({ type: "deleteElement", elementId }, `Deleted ${describeElement(workingDeck, elementId)}`),
    }),

    move_element: tool({
      description: "Move an element on its slide or to another slide.",
      inputSchema: z.object({
        elementId: elementIdInput,
        toSlideId: z.string().describe("Its own slide to move within it."),
        x: z.number().optional().describe("Omit to keep."),
        y: z.number().optional().describe("Omit to keep."),
      }),
      execute: ({ elementId, toSlideId, x, y }) => {
        const label = `Moved ${describeElement(workingDeck, elementId)} to ${describeSlide(workingDeck, toSlideId)}`
        const location = findElementLocation(workingDeck, elementId)
        const isMoveWithinSlide = location?.slide.id === toSlideId
        // Moves to another slide find free space in applyDeckEdit.
        if (!location || !isMoveWithinSlide) {
          return applyChange({ type: "moveElement", elementId, toSlideId, x, y }, label)
        }

        const { slide, element } = location
        const spot = findFreeSpot(slide, { ...element, x: x ?? element.x, y: y ?? element.y }, elementId)
        const result = applyChange({ type: "moveElement", elementId, toSlideId, x: spot.x, y: spot.y }, label)
        return withWarning(result, overlapWarning(overlappingElementIds(slide, spot, elementId)))
      },
    }),

    resize_element: tool({
      description: "Resize an element, and optionally move it on its slide.",
      inputSchema: z.object({
        elementId: elementIdInput,
        w: z.number(),
        h: z.number(),
        x: z.number().optional(),
        y: z.number().optional(),
      }),
      execute: ({ elementId, w, h, x, y }) => {
        const location = findElementLocation(workingDeck, elementId)
        if (!location) return reportError(`Element "${elementId}" does not exist.`)
        const { slide, element } = location
        // Keeps the asked-for size; only the position moves to free space.
        const spot = findFreeSpot(slide, { x: x ?? element.x, y: y ?? element.y, w, h }, elementId)
        const result = applyChange(
          { type: "updateElement", elementId, changes: spot },
          `Resized ${describeElement(workingDeck, elementId)}`
        )
        return withWarning(result, overlapWarning(overlappingElementIds(slide, spot, elementId)))
      },
    }),

    reorder_elements: tool({
      description: "Change z-order.",
      inputSchema: z.object({
        elementId: elementIdInput,
        direction: z
          .enum(["forward", "backward", "front", "back"])
          .describe("forward/backward one step; front/back all the way."),
      }),
      execute: ({ elementId, direction }) =>
        applyChange(
          { type: "reorderElement", elementId, direction },
          `Moved ${describeElement(workingDeck, elementId)} ${direction}`
        ),
    }),

    add_chart: tool({
      description: "Add a chart. Returns its id.",
      inputSchema: z.object({
        slideId: slideIdInput,
        slot: slotInput,
        box: boxInput.optional(),
        chartType: chartTypeInput,
        title: chartTitleInput,
        categories: chartCategoriesInput,
        series: chartSeriesInput,
        showLegend: z.boolean().optional().describe("Default: on when several series."),
        xAxisLabel: z.string().optional(),
        yAxisLabel: z.string().optional(),
      }),
      execute: (input) => {
        const slide = findSlide(workingDeck, input.slideId)
        if (!slide) {
          return reportError(`Slide "${input.slideId}" does not exist.`)
        }
        const position = choosePosition(slide, input.slot, input.box)
        if (typeof position === "string") return reportError(position)

        const chart: SlideElement = {
          id: createId(),
          ...newTimestamps(),
          type: "chart",
          ...position,
          chartType: input.chartType,
          title: input.title,
          categories: input.categories,
          series: input.series,
          showLegend: input.showLegend ?? input.series.length > 1,
          xAxisLabel: input.xAxisLabel,
          yAxisLabel: input.yAxisLabel,
        }
        return addElementToSlide(
          input.slideId,
          chart,
          `Added a ${input.chartType} chart to ${describeSlide(workingDeck, input.slideId)}`
        )
      },
    }),

    update_chart_data: tool({
      description: "Change a chart's title, data, legend or axis labels. Lists are replaced whole.",
      inputSchema: z.object({
        elementId: elementIdInput,
        title: chartTitleInput.optional(),
        categories: chartCategoriesInput.optional(),
        series: chartSeriesInput.optional(),
        showLegend: z.boolean().optional(),
        xAxisLabel: z.string().optional(),
        yAxisLabel: z.string().optional(),
      }),
      execute: ({ elementId, ...changes }) =>
        applyChange(
          { type: "updateElement", elementId, changes },
          `Updated the data of ${describeElement(workingDeck, elementId)}`
        ),
    }),

    change_chart_type: tool({
      description: "Switch chart type; data is kept.",
      inputSchema: z.object({
        elementId: elementIdInput,
        chartType: chartTypeInput,
      }),
      execute: ({ elementId, chartType }) =>
        applyChange(
          { type: "updateElement", elementId, changes: { chartType } },
          `Changed ${describeElement(workingDeck, elementId)} to a ${chartType} chart`
        ),
    }),

    add_table: tool({
      description: "Add a table. Returns its id.",
      inputSchema: z.object({
        slideId: slideIdInput,
        slot: slotInput,
        box: boxInput.optional(),
        rows: z.array(z.array(z.string()).min(1)).min(1).describe("First row is the header; same cell count per row."),
        headerRow: z.boolean().optional().describe("Default true."),
      }),
      execute: ({ slideId, slot, box, rows, headerRow }) => {
        const slide = findSlide(workingDeck, slideId)
        if (!slide) return reportError(`Slide "${slideId}" does not exist.`)
        const position = choosePosition(slide, slot, box)
        if (typeof position === "string") return reportError(position)

        const table: SlideElement = {
          id: createId(),
          ...newTimestamps(),
          type: "table",
          ...position,
          rows,
          headerRow: headerRow ?? true,
        }
        return addElementToSlide(slideId, table, `Added a table to ${describeSlide(workingDeck, slideId)}`)
      },
    }),
  }
}

function findSlide(deck: Deck, slideId: string) {
  return deck.slides.find((slide) => slide.id === slideId)
}

function describeSlide(deck: Deck, slideId: string) {
  const slideIndex = deck.slides.findIndex((slide) => slide.id === slideId)
  if (slideIndex === -1) return "a slide"
  return `slide ${slideIndex + 1}`
}

function describeElement(deck: Deck, elementId: string) {
  const location = findElementLocation(deck, elementId)
  if (!location) return "an element"
  return `the ${location.element.type} on ${describeSlide(deck, location.slide.id)}`
}

function choosePosition(slide: Slide, slotName: string | undefined, box: Box | undefined): Box | string {
  if (slotName) {
    const slotsOfLayout = slideLayoutSlots[slide.layout]
    const slotBox = slotsOfLayout[slotName]
    if (slotBox) return slotBox

    const availableSlots = Object.keys(slotsOfLayout).join(", ") || "none"
    return `The ${slide.layout} layout has no "${slotName}" slot. Its slots are: ${availableSlots}.`
  }

  if (box) return box

  return findFreeSpot(slide, {
    x: (ARTBOARD_WIDTH - DEFAULT_NEW_ELEMENT_WIDTH) / 2,
    y: (ARTBOARD_HEIGHT - DEFAULT_NEW_ELEMENT_HEIGHT) / 2,
    w: DEFAULT_NEW_ELEMENT_WIDTH,
    h: DEFAULT_NEW_ELEMENT_HEIGHT,
  })
}
