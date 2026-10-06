import "server-only"

import { tool, type ToolSet } from "ai"
import { z } from "zod"

import { createId } from "@/lib/Ids"
import {
  createSlide,
  duplicateSlide,
  slideLayoutSlots,
} from "@/lib/layouts/SlideLayouts"
import {
  applyDeckEdit,
  findElementLocation,
  type DeckEdit,
} from "@/lib/edits/DeckEdits"
import { findFreeSpot, type Box } from "@/lib/edits/Geometry"
import {
  ARTBOARD_HEIGHT,
  ARTBOARD_WIDTH,
  slideLayoutSchema,
  type Deck,
  type ElementChanges,
  type Slide,
  type SlideElement,
} from "@/lib/schema/Deck"
import type { SendStreamEvent } from "@/lib/StreamEvents"

const DEFAULT_BODY_FONT_SIZE = 40
const DEFAULT_ELEMENT_SIZE = { w: 800, h: 450 }

// What one edit tool call turns into, or an error message the model reads.
type ToolEditPlan = { edit: DeckEdit; label: string; createdIds?: string[] }
type EditTool<Input> = {
  description: string
  inputSchema: z.ZodType<Input>
  toEdit: (input: Input, deck: Deck) => ToolEditPlan | string
}

// Only exists so TypeScript infers each tool's Input from its schema.
function editTool<Input>(definition: EditTool<Input>) {
  return definition
}

const slideIdField = z
  .string()
  .describe("Id of the slide, from the deck context.")
const elementIdField = z
  .string()
  .describe("Id of the element, from the deck context.")

const boxSchema = z
  .object({
    x: z.number().describe("Left edge, 0 to 1920."),
    y: z.number().describe("Top edge, 0 to 1080."),
    w: z.number().describe("Width (min 40)."),
    h: z.number().describe("Height (min 40)."),
  })
  .describe("Position and size in 1920×1080 artboard units.")

const placementFields = {
  slot: z
    .string()
    .optional()
    .describe(
      "Named layout slot to fill, e.g. 'body', 'visual', 'chart', 'left', 'right'. The deck context lists each slide's slots. Prefer this over box."
    ),
  box: boxSchema
    .optional()
    .describe("Exact position and size. Use only when no slot fits."),
}

const chartSeriesSchema = z.object({
  name: z.string().describe("Series name shown in the legend."),
  data: z
    .array(z.number())
    .describe("One number per category, in the same order as categories."),
  color: z.string().optional().describe("CSS color. Omit to use the theme."),
})

const chartFields = {
  chartType: z.enum(["bar", "line", "pie", "area", "stackedBar"]),
  title: z.string().describe("Chart title shown above it. Empty for none."),
  categories: z
    .array(z.string())
    .min(1)
    .describe("X-axis categories (pie: slice names)."),
  series: z
    .array(chartSeriesSchema)
    .min(1)
    .describe("Data series. A pie chart shows only the first series."),
}

const textFields = {
  paragraphs: z
    .array(z.string())
    .describe("One string per paragraph or list item."),
  fontSize: z.number().positive().describe("Font size in artboard px."),
  bold: z.boolean(),
  italic: z.boolean(),
  color: z.string().describe("CSS color."),
  align: z.enum(["left", "center", "right"]),
  listStyle: z.enum(["none", "bullet", "number"]),
}

const imageFields = {
  src: z.string().describe("Image URL."),
  alt: z.string().describe("Short description of the image."),
  fit: z.enum(["cover", "contain"]),
}

const shapeFields = {
  shape: z.enum(["rect", "ellipse"]),
  fill: z.string().describe("CSS fill color."),
  stroke: z.string().describe("CSS outline color."),
  strokeWidth: z.number().min(0),
}

function allOptional<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.object(shape).partial()
}

const editTools = {
  add_slide: editTool({
    description:
      "Add a new slide with a layout and a title. Returns the new slide id and its title element id.",
    inputSchema: z.object({
      layout: slideLayoutSchema,
      title: z.string(),
      index: z
        .number()
        .int()
        .optional()
        .describe("0-based position. Omit to add at the end."),
    }),
    toEdit: ({ layout, title, index }, deck) => {
      const slide = createSlide(layout, title, deck.theme)
      return {
        edit: { type: "addSlide", slide, index },
        label: `Added slide “${title}”`,
        createdIds: [slide.id, ...slide.elements.map((element) => element.id)],
      }
    },
  }),

  update_slide: editTool({
    description:
      "Change a slide's title, background color or speaker notes. Changing the title does not edit the title text element; use update_element for that.",
    inputSchema: z.object({
      slideId: slideIdField,
      title: z.string().optional(),
      background: z.string().optional().describe("CSS color."),
      notes: z.string().optional().describe("Speaker notes."),
    }),
    toEdit: ({ slideId, ...changes }, deck) => ({
      edit: { type: "updateSlide", slideId, changes },
      label: `Updated ${slideLabel(deck, slideId)}`,
    }),
  }),

  delete_slide: editTool({
    description: "Delete a slide and everything on it.",
    inputSchema: z.object({ slideId: slideIdField }),
    toEdit: ({ slideId }, deck) => ({
      edit: { type: "deleteSlide", slideId },
      label: `Deleted ${slideLabel(deck, slideId)}`,
    }),
  }),

  reorder_slides: editTool({
    description: "Move a slide to a new position in the deck.",
    inputSchema: z.object({
      slideId: slideIdField,
      toIndex: z.number().int().describe("New 0-based position."),
    }),
    toEdit: ({ slideId, toIndex }, deck) => ({
      edit: { type: "moveSlide", slideId, toIndex },
      label: `Moved ${slideLabel(deck, slideId)} to position ${toIndex + 1}`,
    }),
  }),

  duplicate_slide: editTool({
    description:
      "Copy a slide (with new ids) right after the original. Returns the copy's slide id.",
    inputSchema: z.object({ slideId: slideIdField }),
    toEdit: ({ slideId }, deck) => {
      const slideIndex = deck.slides.findIndex((slide) => slide.id === slideId)
      if (slideIndex === -1) return `Slide "${slideId}" does not exist.`

      const copy = duplicateSlide(deck.slides[slideIndex])
      return {
        edit: { type: "addSlide", slide: copy, index: slideIndex + 1 },
        label: `Duplicated ${slideLabel(deck, slideId)}`,
        createdIds: [copy.id],
      }
    },
  }),

  change_layout: editTool({
    description:
      "Change a slide's layout, which changes its named slots. Existing elements keep their positions.",
    inputSchema: z.object({ slideId: slideIdField, layout: slideLayoutSchema }),
    toEdit: ({ slideId, layout }, deck) => ({
      edit: { type: "updateSlide", slideId, changes: { layout } },
      label: `Changed ${slideLabel(deck, slideId)} to the ${layout} layout`,
    }),
  }),

  add_element: editTool({
    description:
      "Add a text, image or shape element to a slide. For charts use add_chart, for tables add_table. Returns the new element id.",
    inputSchema: z.object({
      slideId: slideIdField,
      type: z.enum(["text", "image", "shape"]),
      ...placementFields,
      ...allOptional({ ...textFields, ...imageFields, ...shapeFields }).shape,
    }),
    toEdit: ({ slideId, type, slot, box, ...fields }, deck) => {
      const slide = findSlide(deck, slideId)
      if (!slide) return `Slide "${slideId}" does not exist.`
      const placedBox = resolveBox(slide, slot, box)
      if (typeof placedBox === "string") return placedBox

      const { colors } = deck.theme
      const base = { id: createId(), ...placedBox }
      let element: SlideElement
      if (type === "text") {
        element = {
          ...base,
          type,
          paragraphs: fields.paragraphs ?? [""],
          fontSize: fields.fontSize ?? DEFAULT_BODY_FONT_SIZE,
          bold: fields.bold ?? false,
          italic: fields.italic ?? false,
          color: fields.color ?? colors.text,
          align: fields.align ?? "left",
          listStyle: fields.listStyle ?? "none",
        }
      } else if (type === "image") {
        if (!fields.src) return "An image element needs a src URL."
        element = {
          ...base,
          type,
          src: fields.src,
          alt: fields.alt ?? "",
          fit: fields.fit ?? "cover",
        }
      } else {
        element = {
          ...base,
          type,
          shape: fields.shape ?? "rect",
          fill: fields.fill ?? colors.accent,
          stroke: fields.stroke ?? colors.accent,
          strokeWidth: fields.strokeWidth ?? 0,
        }
      }

      return {
        edit: { type: "addElement", slideId, element },
        label: `Added ${type} to ${slideLabel(deck, slideId)}`,
        createdIds: [element.id],
      }
    },
  }),

  update_element: editTool({
    description:
      "Change an element's content or style. Only send the fields to change, and only fields that belong to that element type (text: paragraphs, fontSize, bold, italic, color, align, listStyle; image: src, alt, fit; shape: shape, fill, stroke, strokeWidth). Use move_element or resize_element for position and size.",
    inputSchema: z.object({
      elementId: elementIdField,
      changes: allOptional({ ...textFields, ...imageFields, ...shapeFields }),
    }),
    toEdit: ({ elementId, changes }, deck) => ({
      // The edit validates the merged element against its type's strict
      // schema, so fields from another type come back as an error.
      edit: {
        type: "updateElement",
        elementId,
        changes: changes as ElementChanges,
      },
      label: `Edited ${elementLabel(deck, elementId)}`,
    }),
  }),

  delete_element: editTool({
    description: "Delete an element.",
    inputSchema: z.object({ elementId: elementIdField }),
    toEdit: ({ elementId }, deck) => ({
      edit: { type: "deleteElement", elementId },
      label: `Deleted ${elementLabel(deck, elementId)}`,
    }),
  }),

  move_element: editTool({
    description:
      "Move an element to a new position, on the same slide or another slide. Use this (never delete + re-add) to move content between slides.",
    inputSchema: z.object({
      elementId: elementIdField,
      toSlideId: z
        .string()
        .describe(
          "Slide to move it to. Use its current slide to move within it."
        ),
      x: z.number().optional().describe("New left edge. Omit to keep it."),
      y: z.number().optional().describe("New top edge. Omit to keep it."),
    }),
    toEdit: ({ elementId, toSlideId, x, y }, deck) => ({
      edit: { type: "moveElement", elementId, toSlideId, x, y },
      label: `Moved ${elementLabel(deck, elementId)} to ${slideLabel(deck, toSlideId)}`,
    }),
  }),

  resize_element: editTool({
    description: "Resize an element, optionally moving it on its slide.",
    inputSchema: z.object({
      elementId: elementIdField,
      w: z.number().describe("New width (min 40)."),
      h: z.number().describe("New height (min 40)."),
      x: z.number().optional(),
      y: z.number().optional(),
    }),
    toEdit: ({ elementId, ...changes }, deck) => ({
      edit: { type: "updateElement", elementId, changes },
      label: `Resized ${elementLabel(deck, elementId)}`,
    }),
  }),

  reorder_elements: editTool({
    description: "Change an element's stacking order on its slide.",
    inputSchema: z.object({
      elementId: elementIdField,
      direction: z
        .enum(["forward", "backward", "front", "back"])
        .describe("front = on top of everything, back = behind everything."),
    }),
    toEdit: ({ elementId, direction }, deck) => ({
      edit: { type: "reorderElement", elementId, direction },
      label: `Brought ${elementLabel(deck, elementId)} ${direction}`,
    }),
  }),

  add_chart: editTool({
    description:
      "Add a chart with real numeric data. Every series needs exactly one value per category. Returns the new element id.",
    inputSchema: z.object({
      slideId: slideIdField,
      ...placementFields,
      ...chartFields,
      showLegend: z
        .boolean()
        .optional()
        .describe("Defaults to true when there is more than one series."),
      xAxisLabel: z.string().optional(),
      yAxisLabel: z.string().optional(),
    }),
    toEdit: ({ slideId, slot, box, showLegend, ...chart }, deck) => {
      const slide = findSlide(deck, slideId)
      if (!slide) return `Slide "${slideId}" does not exist.`
      const placedBox = resolveBox(slide, slot, box)
      if (typeof placedBox === "string") return placedBox

      const element: SlideElement = {
        id: createId(),
        type: "chart",
        ...placedBox,
        ...chart,
        showLegend: showLegend ?? chart.series.length > 1,
      }
      return {
        edit: { type: "addElement", slideId, element },
        label: `Added a ${chart.chartType} chart to ${slideLabel(deck, slideId)}`,
        createdIds: [element.id],
      }
    },
  }),

  update_chart_data: editTool({
    description:
      "Replace a chart's title, categories, series or labels. Arrays are replaced whole; every series needs one value per category.",
    inputSchema: z.object({
      elementId: elementIdField,
      title: chartFields.title.optional(),
      categories: chartFields.categories.optional(),
      series: chartFields.series.optional(),
      showLegend: z.boolean().optional(),
      xAxisLabel: z.string().optional(),
      yAxisLabel: z.string().optional(),
    }),
    toEdit: ({ elementId, ...changes }, deck) => ({
      edit: { type: "updateElement", elementId, changes },
      label: `Updated data of ${elementLabel(deck, elementId)}`,
    }),
  }),

  change_chart_type: editTool({
    description: "Switch a chart to another chart type, keeping its data.",
    inputSchema: z.object({
      elementId: elementIdField,
      chartType: chartFields.chartType,
    }),
    toEdit: ({ elementId, chartType }, deck) => ({
      edit: { type: "updateElement", elementId, changes: { chartType } },
      label: `Changed ${elementLabel(deck, elementId)} to a ${chartType} chart`,
    }),
  }),

  add_table: editTool({
    description:
      "Add a table. Every row needs the same number of cells. Returns the new element id.",
    inputSchema: z.object({
      slideId: slideIdField,
      ...placementFields,
      rows: z
        .array(z.array(z.string()).min(1))
        .min(1)
        .describe("Rows of cell text; the first row is the header."),
      headerRow: z
        .boolean()
        .optional()
        .describe("Style the first row as a header. Defaults to true."),
    }),
    toEdit: ({ slideId, slot, box, rows, headerRow }, deck) => {
      const slide = findSlide(deck, slideId)
      if (!slide) return `Slide "${slideId}" does not exist.`
      const placedBox = resolveBox(slide, slot, box)
      if (typeof placedBox === "string") return placedBox

      const element: SlideElement = {
        id: createId(),
        type: "table",
        ...placedBox,
        rows,
        headerRow: headerRow ?? true,
      }
      return {
        edit: { type: "addElement", slideId, element },
        label: `Added a table to ${slideLabel(deck, slideId)}`,
        createdIds: [element.id],
      }
    },
  }),
}

export type AgentToolName = keyof typeof editTools | "get_slide"

// Tools for one request. They read and update `scratch.deck` so later calls
// in the same turn see earlier ones (e.g. an element added a step ago).
export function createAgentTools(
  scratch: { deck: Deck },
  send: SendStreamEvent
): ToolSet {
  const tools: ToolSet = {
    get_slide: tool({
      description:
        "Read the full JSON of one slide, including every element's fields. Use it before editing details the deck context summarizes.",
      inputSchema: z.object({ slideId: slideIdField }),
      execute: ({ slideId }) =>
        findSlide(scratch.deck, slideId) ?? {
          ok: false,
          error: `Slide "${slideId}" does not exist.`,
        },
    }),
  }

  for (const [toolName, definition] of Object.entries(editTools)) {
    const { description, inputSchema, toEdit } = definition as EditTool<unknown>
    tools[toolName] = tool({
      description,
      inputSchema,
      execute: (input, { toolCallId }) => {
        // Errors are returned, not thrown, so the model reads them and retries.
        const rejectCall = (error: string) => {
          send("tool_error", { message: error })
          return { ok: false, error }
        }

        const plan = toEdit(input, scratch.deck)
        if (typeof plan === "string") return rejectCall(plan)
        const result = applyDeckEdit(scratch.deck, plan.edit)
        if (!result.ok) return rejectCall(result.error)

        scratch.deck = result.deck
        send("edit", { edit: plan.edit, label: plan.label, toolCallId })
        return { ok: true, createdIds: plan.createdIds ?? [] }
      },
    })
  }
  return tools
}

function findSlide(deck: Deck, slideId: string) {
  return deck.slides.find((slide) => slide.id === slideId)
}

function slideLabel(deck: Deck, slideId: string) {
  const slideIndex = deck.slides.findIndex((slide) => slide.id === slideId)
  return slideIndex === -1 ? "a slide" : `slide ${slideIndex + 1}`
}

function elementLabel(deck: Deck, elementId: string) {
  const location = findElementLocation(deck, elementId)
  if (!location) return "an element"
  return `the ${location.element.type} on ${slideLabel(deck, location.slide.id)}`
}

// Slot first (consistent layouts), then an explicit box, then the nearest
// free spot to the slide's center.
function resolveBox(
  slide: Slide,
  slot: string | undefined,
  box: Box | undefined
): Box | string {
  if (slot) {
    const slots = slideLayoutSlots[slide.layout]
    const slotBox = slots[slot]
    if (slotBox) return slotBox
    const slotNames = Object.keys(slots)
    return `Slot "${slot}" does not exist on the ${slide.layout} layout. Available slots: ${slotNames.join(", ") || "none (use box)"}.`
  }
  if (box) return box

  return findFreeSpot(slide, {
    ...DEFAULT_ELEMENT_SIZE,
    x: (ARTBOARD_WIDTH - DEFAULT_ELEMENT_SIZE.w) / 2,
    y: (ARTBOARD_HEIGHT - DEFAULT_ELEMENT_SIZE.h) / 2,
  })
}
