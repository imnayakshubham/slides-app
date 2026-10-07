import { clampBox, findFreeSpot } from "@/lib/edits/Geometry"
import { createId } from "@/lib/Ids"
import { TEXT_PRESETS, type TextPresetName } from "@/lib/layouts/TextPresets"
import type { UploadedImage } from "@/lib/repository/DeckRepository"
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH, MIN_ELEMENT_SIZE, usesHeadingFont } from "@/lib/schema/Deck"
import type { Deck, SlideElement } from "@/lib/schema/Deck"
import { useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

type Theme = Deck["theme"]
type Point = { x: number; y: number }

const CHART_SIZE = { width: 960, height: 540 }
const TABLE_SIZE = { width: 960, height: 300 }
const SHAPE_SIZE = { width: 400, height: 400 }
const MAX_IMAGE_WIDTH = 800

// Starts centered; insertElement then moves it to the nearest spot that covers nothing.
function centeredBox(width: number, height: number) {
  return {
    x: (ARTBOARD_WIDTH - width) / 2,
    y: (ARTBOARD_HEIGHT - height) / 2,
    w: width,
    h: height,
  }
}

export function createTextBlock(presetName: TextPresetName, theme: Theme): SlideElement {
  const preset = TEXT_PRESETS[presetName]
  return {
    id: createId(),
    type: "text",
    role: preset.role,
    ...centeredBox(preset.width, preset.height),
    paragraphs: preset.startingParagraphs,
    fontSize: preset.fontSize,
    bold: preset.bold,
    italic: false,
    color: usesHeadingFont(preset.role) ? theme.colors.heading : theme.colors.text,
    align: "left",
    listStyle: preset.listStyle,
  }
}

type ChartElement = Extract<SlideElement, { type: "chart" }>

export function createChartBlock(chartType: ChartElement["chartType"], theme: Theme): SlideElement {
  const series: ChartElement["series"] = [{ name: "Value", data: [10, 14, 19, 24], color: theme.colors.accent }]
  // A stacked bar with one series looks like a plain bar, so add a second one (it gets the next theme color).
  if (chartType === "stackedBar") {
    series.push({ name: "Other", data: [6, 8, 9, 12] })
  }
  return {
    id: createId(),
    type: "chart",
    ...centeredBox(CHART_SIZE.width, CHART_SIZE.height),
    chartType,
    title: "",
    categories: ["Q1", "Q2", "Q3", "Q4"],
    series,
    showLegend: chartType === "pie" || series.length > 1,
  }
}

export function createTableBlock(): SlideElement {
  return {
    id: createId(),
    type: "table",
    ...centeredBox(TABLE_SIZE.width, TABLE_SIZE.height),
    rows: [
      ["Column 1", "Column 2", "Column 3"],
      ["", "", ""],
      ["", "", ""],
    ],
    headerRow: true,
  }
}

export function createShapeBlock(shape: "rect" | "ellipse", theme: Theme): SlideElement {
  return {
    id: createId(),
    type: "shape",
    ...centeredBox(SHAPE_SIZE.width, SHAPE_SIZE.height),
    shape,
    fill: theme.colors.accent,
    stroke: theme.colors.accent,
    strokeWidth: 0,
  }
}

export function createImageBlock(image: UploadedImage): SlideElement {
  const width = Math.max(MIN_ELEMENT_SIZE, Math.min(image.width, MAX_IMAGE_WIDTH))
  const height = Math.max(MIN_ELEMENT_SIZE, (width / image.width) * image.height)
  return {
    id: createId(),
    type: "image",
    ...centeredBox(width, height),
    src: image.src,
    alt: "",
    fit: "cover",
  }
}

// Adds and selects the element in one undo step, at `at` (slide units) or the nearest free spot.
export function insertElement(element: SlideElement, at?: Point) {
  const { deck, applyEdit } = useDeckStore.getState()
  const { currentSlideId, setSelectedElementIds } = useEditorStore.getState()
  const currentSlide = deck?.slides.find((slide) => slide.id === currentSlideId)
  if (!currentSlide) return

  const box = at ? clampBox({ x: at.x, y: at.y, w: element.w, h: element.h }) : findFreeSpot(currentSlide, element)
  const result = applyEdit({
    type: "addElement",
    slideId: currentSlide.id,
    element: { ...element, ...box },
  })
  if (result.ok) setSelectedElementIds([element.id])
}
