import "server-only"

import { tool, type ToolSet } from "ai"
import { z } from "zod"

import {
  applyDeckEdit,
  findElementLocation,
  type DeckEdit,
} from "@/lib/edits/DeckEdits"
import { findFreeSpot, type Box } from "@/lib/edits/Geometry"
import { createId } from "@/lib/Ids"
import {
  createSlide,
  duplicateSlide,
  slideLayoutSlots,
} from "@/lib/layouts/SlideLayouts"
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

const DEFAULT_TEXT_FONT_SIZE = 40
const DEFAULT_NEW_ELEMENT_WIDTH = 800
const DEFAULT_NEW_ELEMENT_HEIGHT = 450

const slideIdInput = z
  .string()
  .describe("Id of the slide, from the deck context.")
const elementIdInput = z
  .string()
  .describe("Id of the element, from the deck context.")

const boxInput = z
  .object({
    x: z.number().describe("Left edge, 0 to 1920."),
    y: z.number().describe("Top edge, 0 to 1080."),
    w: z.number().describe("Width, at least 40."),
    h: z.number().describe("Height, at least 40."),
  })
  .describe("Position and size on the 1920x1080 artboard.")

const slotInput = z
  .string()
  .optional()
  .describe(
    "Name of a layout slot to fill, such as 'body', 'visual', 'chart', 'left' or 'right'. The deck context lists each slide's slots. Prefer this over box."
  )

const chartTypeInput = z.enum(["bar", "line", "pie", "area", "stackedBar"])
const chartTitleInput = z
  .string()
  .describe("Title shown above the chart. Empty for no title.")
const chartCategoriesInput = z
  .array(z.string())
  .min(1)
  .describe(
    "Category names along the x-axis. For a pie chart, the slice names."
  )
const chartSeriesInput = z
  .array(
    z.object({
      name: z.string().describe("Series name shown in the legend."),
      data: z
        .array(z.number())
        .describe("One number per category, in the same order as categories."),
      color: z
        .string()
        .optional()
        .describe("CSS color. Leave out to use the theme colors."),
    })
  )
  .min(1)
  .describe("Data series. A pie chart only shows the first series.")

// All optional, so one tool covers text, image and shape elements.
const elementStyleInputs = {
  paragraphs: z
    .array(z.string())
    .optional()
    .describe("Text: one string per paragraph or list item."),
  fontSize: z.number().positive().optional().describe("Text: font size in px."),
  bold: z.boolean().optional().describe("Text"),
  italic: z.boolean().optional().describe("Text"),
  color: z.string().optional().describe("Text: CSS color."),
  align: z.enum(["left", "center", "right"]).optional().describe("Text"),
  listStyle: z.enum(["none", "bullet", "number"]).optional().describe("Text"),
  src: z.string().optional().describe("Image: URL."),
  alt: z.string().optional().describe("Image: short description."),
  fit: z.enum(["cover", "contain"]).optional().describe("Image"),
  shape: z.enum(["rect", "ellipse"]).optional().describe("Shape"),
  fill: z.string().optional().describe("Shape: CSS fill color."),
  stroke: z.string().optional().describe("Shape: CSS outline color."),
  strokeWidth: z.number().min(0).optional().describe("Shape: outline width."),
}

type ToolResult =
  { ok: true; createdIds: string[] } | { ok: false; error: string }

// Tools edit `workingDeck` so later calls in the same request see earlier changes.
export function createAgentTools(
  deck: Deck,
  sendEvent: SendStreamEvent
): ToolSet {
  let workingDeck = deck

  function applyChange(
    edit: DeckEdit,
    label: string,
    toolCallId: string,
    createdIds: string[] = []
  ): ToolResult {
    const result = applyDeckEdit(workingDeck, edit)
    if (!result.ok) return reportError(result.error)

    workingDeck = result.deck
    sendEvent({ event: "edit", data: { edit, label, toolCallId } })
    return { ok: true, createdIds }
  }

  // Returned, not thrown, so the model reads the error and retries.
  function reportError(error: string): ToolResult {
    sendEvent({ event: "tool_error", data: { message: error } })
    return { ok: false, error }
  }

  function addElementToSlide(
    slideId: string,
    element: SlideElement,
    label: string,
    toolCallId: string
  ) {
    return applyChange(
      { type: "addElement", slideId, element },
      label,
      toolCallId,
      [element.id]
    )
  }

  return {
    get_slide: tool({
      description:
        "Read the full details of one slide and all of its elements. Use it before editing details the deck context only summarizes.",
      inputSchema: z.object({ slideId: slideIdInput }),
      execute: ({ slideId }) => {
        const slide = findSlide(workingDeck, slideId)
        if (!slide) return reportError(`Slide "${slideId}" does not exist.`)
        return slide
      },
    }),

    add_slide: tool({
      description:
        "Add a new slide with a layout and a title. Returns the new slide id and the id of its title text.",
      inputSchema: z.object({
        layout: slideLayoutSchema,
        title: z.string(),
        index: z
          .number()
          .int()
          .optional()
          .describe("Position starting at 0. Leave out to add at the end."),
      }),
      execute: ({ layout, title, index }, { toolCallId }) => {
        const slide = createSlide(layout, title, workingDeck.theme)
        const titleElementIds = slide.elements.map((element) => element.id)
        return applyChange(
          { type: "addSlide", slide, index },
          `Added slide "${title}"`,
          toolCallId,
          [slide.id, ...titleElementIds]
        )
      },
    }),

    update_slide: tool({
      description:
        "Change a slide's title, background color or speaker notes. The slide title is not the title text on the slide; use update_element to change that text.",
      inputSchema: z.object({
        slideId: slideIdInput,
        title: z.string().optional(),
        background: z.string().optional().describe("CSS color."),
        notes: z.string().optional().describe("Speaker notes."),
      }),
      // Rest spread keeps unsent fields out, so they aren't overwritten with undefined.
      execute: ({ slideId, ...changes }, { toolCallId }) =>
        applyChange(
          { type: "updateSlide", slideId, changes },
          `Updated ${describeSlide(workingDeck, slideId)}`,
          toolCallId
        ),
    }),

    delete_slide: tool({
      description: "Delete a slide and everything on it.",
      inputSchema: z.object({ slideId: slideIdInput }),
      execute: ({ slideId }, { toolCallId }) =>
        applyChange(
          { type: "deleteSlide", slideId },
          `Deleted ${describeSlide(workingDeck, slideId)}`,
          toolCallId
        ),
    }),

    reorder_slides: tool({
      description: "Move a slide to a new position in the deck.",
      inputSchema: z.object({
        slideId: slideIdInput,
        toIndex: z.number().int().describe("New position, starting at 0."),
      }),
      execute: ({ slideId, toIndex }, { toolCallId }) =>
        applyChange(
          { type: "moveSlide", slideId, toIndex },
          `Moved ${describeSlide(workingDeck, slideId)} to position ${toIndex + 1}`,
          toolCallId
        ),
    }),

    duplicate_slide: tool({
      description:
        "Copy a slide and put the copy right after it. Returns the id of the copy.",
      inputSchema: z.object({ slideId: slideIdInput }),
      execute: ({ slideId }, { toolCallId }) => {
        const slideIndex = workingDeck.slides.findIndex(
          (slide) => slide.id === slideId
        )
        if (slideIndex === -1) {
          return reportError(`Slide "${slideId}" does not exist.`)
        }

        const copy = duplicateSlide(workingDeck.slides[slideIndex])
        return applyChange(
          { type: "addSlide", slide: copy, index: slideIndex + 1 },
          `Duplicated slide ${slideIndex + 1}`,
          toolCallId,
          [copy.id]
        )
      },
    }),

    change_layout: tool({
      description:
        "Change a slide's layout, which changes the slots it offers. Elements already on the slide keep their positions.",
      inputSchema: z.object({
        slideId: slideIdInput,
        layout: slideLayoutSchema,
      }),
      execute: ({ slideId, layout }, { toolCallId }) =>
        applyChange(
          { type: "updateSlide", slideId, changes: { layout } },
          `Changed ${describeSlide(workingDeck, slideId)} to the ${layout} layout`,
          toolCallId
        ),
    }),

    add_element: tool({
      description:
        "Add a text, image or shape element to a slide. Use add_chart for charts and add_table for tables. Returns the new element id.",
      inputSchema: z.object({
        slideId: slideIdInput,
        type: z.enum(["text", "image", "shape"]),
        slot: slotInput,
        box: boxInput.optional(),
        ...elementStyleInputs,
      }),
      execute: ({ slideId, type, slot, box, ...style }, { toolCallId }) => {
        const slide = findSlide(workingDeck, slideId)
        if (!slide) return reportError(`Slide "${slideId}" does not exist.`)
        const position = choosePosition(slide, slot, box)
        if (typeof position === "string") return reportError(position)

        const { colors } = workingDeck.theme
        const elementId = createId()
        let element: SlideElement

        if (type === "text") {
          element = {
            id: elementId,
            type: "text",
            ...position,
            paragraphs: style.paragraphs ?? [""],
            fontSize: style.fontSize ?? DEFAULT_TEXT_FONT_SIZE,
            bold: style.bold ?? false,
            italic: style.italic ?? false,
            color: style.color ?? colors.text,
            align: style.align ?? "left",
            listStyle: style.listStyle ?? "none",
          }
        } else if (type === "image") {
          if (!style.src) return reportError("An image needs a src URL.")
          element = {
            id: elementId,
            type: "image",
            ...position,
            src: style.src,
            alt: style.alt ?? "",
            fit: style.fit ?? "cover",
          }
        } else {
          element = {
            id: elementId,
            type: "shape",
            ...position,
            shape: style.shape ?? "rect",
            fill: style.fill ?? colors.accent,
            stroke: style.stroke ?? colors.accent,
            strokeWidth: style.strokeWidth ?? 0,
          }
        }

        return addElementToSlide(
          slideId,
          element,
          `Added ${type} to ${describeSlide(workingDeck, slideId)}`,
          toolCallId
        )
      },
    }),

    update_element: tool({
      description:
        "Change the content or style of a text, image or shape element. Send only the fields to change, and only fields that belong to that element's type. Use move_element or resize_element to change position or size.",
      inputSchema: z.object({
        elementId: elementIdInput,
        changes: z.object(elementStyleInputs),
      }),
      execute: ({ elementId, changes }, { toolCallId }) => {
        // Fields from another element type fail validation in applyDeckEdit.
        return applyChange(
          {
            type: "updateElement",
            elementId,
            changes: changes as ElementChanges,
          },
          `Edited ${describeElement(workingDeck, elementId)}`,
          toolCallId
        )
      },
    }),

    delete_element: tool({
      description: "Delete an element.",
      inputSchema: z.object({ elementId: elementIdInput }),
      execute: ({ elementId }, { toolCallId }) =>
        applyChange(
          { type: "deleteElement", elementId },
          `Deleted ${describeElement(workingDeck, elementId)}`,
          toolCallId
        ),
    }),

    move_element: tool({
      description:
        "Move an element to a new position on its slide, or to another slide. Always use this to move content between slides; never delete it and add it again.",
      inputSchema: z.object({
        elementId: elementIdInput,
        toSlideId: z
          .string()
          .describe(
            "Slide to move it to. Use its current slide to move it within that slide."
          ),
        x: z
          .number()
          .optional()
          .describe("New left edge. Leave out to keep it."),
        y: z
          .number()
          .optional()
          .describe("New top edge. Leave out to keep it."),
      }),
      execute: ({ elementId, toSlideId, x, y }, { toolCallId }) =>
        applyChange(
          { type: "moveElement", elementId, toSlideId, x, y },
          `Moved ${describeElement(workingDeck, elementId)} to ${describeSlide(workingDeck, toSlideId)}`,
          toolCallId
        ),
    }),

    resize_element: tool({
      description: "Resize an element, and optionally move it on its slide.",
      inputSchema: z.object({
        elementId: elementIdInput,
        w: z.number().describe("New width, at least 40."),
        h: z.number().describe("New height, at least 40."),
        x: z.number().optional(),
        y: z.number().optional(),
      }),
      execute: ({ elementId, ...changes }, { toolCallId }) =>
        applyChange(
          { type: "updateElement", elementId, changes },
          `Resized ${describeElement(workingDeck, elementId)}`,
          toolCallId
        ),
    }),

    reorder_elements: tool({
      description:
        "Change which elements are drawn on top of which on a slide.",
      inputSchema: z.object({
        elementId: elementIdInput,
        direction: z
          .enum(["forward", "backward", "front", "back"])
          .describe(
            "forward/backward move one step; front puts it on top of everything, back behind everything."
          ),
      }),
      execute: ({ elementId, direction }, { toolCallId }) =>
        applyChange(
          { type: "reorderElement", elementId, direction },
          `Moved ${describeElement(workingDeck, elementId)} ${direction}`,
          toolCallId
        ),
    }),

    add_chart: tool({
      description:
        "Add a chart with real numbers. Every series needs exactly one number per category. Returns the new element id.",
      inputSchema: z.object({
        slideId: slideIdInput,
        slot: slotInput,
        box: boxInput.optional(),
        chartType: chartTypeInput,
        title: chartTitleInput,
        categories: chartCategoriesInput,
        series: chartSeriesInput,
        showLegend: z
          .boolean()
          .optional()
          .describe("Leave out to show it only when there are several series."),
        xAxisLabel: z.string().optional(),
        yAxisLabel: z.string().optional(),
      }),
      execute: (input, { toolCallId }) => {
        const slide = findSlide(workingDeck, input.slideId)
        if (!slide) {
          return reportError(`Slide "${input.slideId}" does not exist.`)
        }
        const position = choosePosition(slide, input.slot, input.box)
        if (typeof position === "string") return reportError(position)

        const chart: SlideElement = {
          id: createId(),
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
          `Added a ${input.chartType} chart to ${describeSlide(workingDeck, input.slideId)}`,
          toolCallId
        )
      },
    }),

    update_chart_data: tool({
      description:
        "Change a chart's title, categories, series, legend or axis labels. Lists are replaced as a whole, and every series needs one number per category.",
      inputSchema: z.object({
        elementId: elementIdInput,
        title: chartTitleInput.optional(),
        categories: chartCategoriesInput.optional(),
        series: chartSeriesInput.optional(),
        showLegend: z.boolean().optional(),
        xAxisLabel: z.string().optional(),
        yAxisLabel: z.string().optional(),
      }),
      execute: ({ elementId, ...changes }, { toolCallId }) =>
        applyChange(
          { type: "updateElement", elementId, changes },
          `Updated the data of ${describeElement(workingDeck, elementId)}`,
          toolCallId
        ),
    }),

    change_chart_type: tool({
      description:
        "Switch a chart to another chart type. Its data stays the same.",
      inputSchema: z.object({
        elementId: elementIdInput,
        chartType: chartTypeInput,
      }),
      execute: ({ elementId, chartType }, { toolCallId }) =>
        applyChange(
          { type: "updateElement", elementId, changes: { chartType } },
          `Changed ${describeElement(workingDeck, elementId)} to a ${chartType} chart`,
          toolCallId
        ),
    }),

    add_table: tool({
      description:
        "Add a table. Every row needs the same number of cells. Returns the new element id.",
      inputSchema: z.object({
        slideId: slideIdInput,
        slot: slotInput,
        box: boxInput.optional(),
        rows: z
          .array(z.array(z.string()).min(1))
          .min(1)
          .describe("Rows of cell text. The first row is the header."),
        headerRow: z
          .boolean()
          .optional()
          .describe("Style the first row as a header. Leave out for yes."),
      }),
      execute: ({ slideId, slot, box, rows, headerRow }, { toolCallId }) => {
        const slide = findSlide(workingDeck, slideId)
        if (!slide) return reportError(`Slide "${slideId}" does not exist.`)
        const position = choosePosition(slide, slot, box)
        if (typeof position === "string") return reportError(position)

        const table: SlideElement = {
          id: createId(),
          type: "table",
          ...position,
          rows,
          headerRow: headerRow ?? true,
        }
        return addElementToSlide(
          slideId,
          table,
          `Added a table to ${describeSlide(workingDeck, slideId)}`,
          toolCallId
        )
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

function choosePosition(
  slide: Slide,
  slotName: string | undefined,
  box: Box | undefined
): Box | string {
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
