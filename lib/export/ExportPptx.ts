import type PptxGenJS from "pptxgenjs"

import { colorToHex, gradientToPngData, imageToPngData } from "@/lib/export/ExportImages"
import { imagePlaceholderSrc } from "@/lib/layouts/ImagePlaceholder"
import { paragraphRuns } from "@/lib/RichText"
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH, usesHeadingFont } from "@/lib/schema/Deck"
import type { Deck, Slide, SlideElement, Theme } from "@/lib/schema/Deck"
import { seriesColorFor } from "@/lib/themes/Themes"

type Presentation = InstanceType<typeof PptxGenJS>
type PptxSlide = ReturnType<Presentation["addSlide"]>
type TextElement = Extract<SlideElement, { type: "text" }>
type ImageElement = Extract<SlideElement, { type: "image" }>
type ChartElement = Extract<SlideElement, { type: "chart" }>
type TableElement = Extract<SlideElement, { type: "table" }>
type ShapeElement = Extract<SlideElement, { type: "shape" }>

// The 1920 x 1080 slide maps onto PowerPoint's 13.333 x 7.5 inch wide layout.
const PIXELS_PER_INCH = ARTBOARD_WIDTH / 13.333
const POINTS_PER_PIXEL = 72 / PIXELS_PER_INCH
// Same sizes the canvas uses, so the export looks the same.
const LINE_SPACING = 1.25
const TABLE_FONT_SIZE_PX = 28
const CHART_LABEL_FONT_SIZE_PX = 24
const CHART_TITLE_FONT_SIZE_PX = 36

const BULLET_BY_LIST_STYLE = {
  none: false,
  bullet: true,
  number: { type: "number" },
} as const

function inches(pixels: number) {
  return pixels / PIXELS_PER_INCH
}

function points(pixels: number) {
  return Math.round(pixels * POINTS_PER_PIXEL * 10) / 10
}

function boxInInches(element: SlideElement) {
  return {
    x: inches(element.x),
    y: inches(element.y),
    w: inches(element.w),
    h: inches(element.h),
  }
}

function mixHex(color: string, otherColor: string, amount: number) {
  const first = colorToHex(color)
  const second = colorToHex(otherColor)
  return [0, 2, 4]
    .map((offset) => {
      const channel =
        parseInt(first.slice(offset, offset + 2), 16) * amount +
        parseInt(second.slice(offset, offset + 2), 16) * (1 - amount)
      return Math.round(channel).toString(16).padStart(2, "0")
    })
    .join("")
    .toUpperCase()
}

function addText(pptxSlide: PptxSlide, element: TextElement, theme: Theme) {
  const box = {
    bold: element.bold,
    italic: element.italic,
    underline: element.underline ?? false,
    color: element.color,
    fontSize: element.fontSize,
  }
  const fontFace = usesHeadingFont(element.role) ? theme.headingFont : theme.fontFamily
  const bullet = BULLET_BY_LIST_STYLE[element.listStyle]

  const textRuns = element.paragraphs.flatMap((paragraph, paragraphIndex) => {
    const runs = paragraphRuns(paragraph)
    const isLastParagraph = paragraphIndex === element.paragraphs.length - 1
    return runs.map((run, runIndex) => ({
      text: run.text,
      options: {
        bold: run.bold ?? box.bold,
        italic: run.italic ?? box.italic,
        underline: (run.underline ?? box.underline) ? { style: "sng" as const } : undefined,
        color: colorToHex(run.color ?? box.color),
        fontSize: points(run.fontSize ?? box.fontSize),
        fontFace,
        bullet,
        align: element.align,
        breakLine: runIndex === runs.length - 1 && !isLastParagraph,
      },
    }))
  })
  if (textRuns.every((textRun) => textRun.text === "")) return

  pptxSlide.addText(textRuns, {
    ...boxInInches(element),
    margin: 0,
    valign: "top",
    fit: "none",
    lineSpacingMultiple: LINE_SPACING,
  })
}

function addShape(presentation: Presentation, pptxSlide: PptxSlide, element: ShapeElement) {
  const shapeType = element.shape === "ellipse" ? presentation.ShapeType.ellipse : presentation.ShapeType.rect
  pptxSlide.addShape(shapeType, {
    ...boxInInches(element),
    fill: { color: colorToHex(element.fill) },
    line:
      element.strokeWidth > 0
        ? {
            color: colorToHex(element.stroke),
            width: points(element.strokeWidth),
          }
        : { type: "none" },
  })
}

// A broken or blocked image becomes a placeholder instead of failing the whole export.
async function addImage(pptxSlide: PptxSlide, element: ImageElement, theme: Theme) {
  let data: string
  try {
    data = await imageToPngData(element.src, element.w, element.h, element.fit)
  } catch {
    data = await imageToPngData(imagePlaceholderSrc(element.alt || "Image", theme), element.w, element.h, "cover")
  }
  pptxSlide.addImage({
    data,
    ...boxInInches(element),
    altText: element.alt,
  })
}

function addTable(pptxSlide: PptxSlide, element: TableElement, theme: Theme) {
  const { colors } = theme
  const columnCount = element.rows[0]?.length ?? 1
  const rows = element.rows.map((row, rowIndex) => {
    const isHeader = element.headerRow && rowIndex === 0
    return row.map((cellText) => ({
      text: cellText,
      options: isHeader
        ? {
            bold: true,
            color: colorToHex(colors.heading),
            fill: { color: mixHex(colors.accent, colors.background, 0.18) },
          }
        : { color: colorToHex(colors.text) },
    }))
  })

  pptxSlide.addTable(rows, {
    ...boxInInches(element),
    colW: Array(columnCount).fill(inches(element.w) / columnCount),
    rowH: inches(element.h) / element.rows.length,
    fontSize: points(TABLE_FONT_SIZE_PX),
    fontFace: theme.fontFamily,
    valign: "middle",
    border: {
      type: "solid",
      pt: 0.75,
      color: mixHex(colors.text, colors.background, 0.2),
    },
  })
}

function addChart(presentation: Presentation, pptxSlide: PptxSlide, element: ChartElement, theme: Theme) {
  const textColor = colorToHex(theme.colors.text)
  const isPie = element.chartType === "pie"
  // The canvas pie shows only the first series.
  const series = isPie ? element.series.slice(0, 1) : element.series
  const chartData = series.map((oneSeries) => ({
    name: oneSeries.name,
    labels: element.categories,
    values: oneSeries.data,
  }))
  const chartColors = isPie
    ? element.categories.map((_, sliceIndex) => colorToHex(seriesColorFor(theme, sliceIndex)))
    : series.map((oneSeries, seriesIndex) => colorToHex(oneSeries.color ?? seriesColorFor(theme, seriesIndex)))

  const chartNameByType = {
    bar: "bar",
    stackedBar: "bar",
    line: "line",
    area: "area",
    pie: "pie",
  } as const
  const labelFontSize = points(CHART_LABEL_FONT_SIZE_PX)

  pptxSlide.addChart(chartNameByType[element.chartType], chartData, {
    ...boxInInches(element),
    chartColors,
    barDir: "col",
    barGrouping: element.chartType === "stackedBar" ? "stacked" : "clustered",
    showTitle: Boolean(element.title),
    title: element.title,
    titleFontSize: points(CHART_TITLE_FONT_SIZE_PX),
    titleColor: textColor,
    titleFontFace: theme.fontFamily,
    showLegend: element.showLegend,
    legendPos: "b",
    legendFontSize: labelFontSize,
    legendColor: textColor,
    legendFontFace: theme.fontFamily,
    catAxisLabelColor: textColor,
    catAxisLabelFontSize: labelFontSize,
    catAxisLabelFontFace: theme.fontFamily,
    valAxisLabelColor: textColor,
    valAxisLabelFontSize: labelFontSize,
    valAxisLabelFontFace: theme.fontFamily,
    valGridLine: {
      color: mixHex(theme.colors.text, theme.colors.background, 0.15),
      size: 0.5,
    },
    showCatAxisTitle: Boolean(element.xAxisLabel),
    catAxisTitle: element.xAxisLabel,
    catAxisTitleColor: textColor,
    showValAxisTitle: Boolean(element.yAxisLabel),
    valAxisTitle: element.yAxisLabel,
    valAxisTitleColor: textColor,
  })
}

async function slideBackground(slide: Slide, theme: Theme): Promise<PptxGenJS.BackgroundProps> {
  const background = slide.background
  if (!background) return { color: colorToHex(theme.colors.background) }
  if (background.type === "color") {
    return { color: colorToHex(background.color) }
  }
  if (background.type === "gradient") {
    return {
      data: gradientToPngData(background.from, background.to, background.angle, ARTBOARD_WIDTH, ARTBOARD_HEIGHT),
    }
  }
  try {
    return {
      data: await imageToPngData(background.src, ARTBOARD_WIDTH, ARTBOARD_HEIGHT, "cover"),
    }
  } catch {
    return { color: colorToHex(theme.colors.background) }
  }
}

async function buildPresentation(deck: Deck, presentation: Presentation) {
  presentation.layout = "LAYOUT_WIDE"
  presentation.title = deck.title

  for (const slide of deck.slides) {
    const pptxSlide = presentation.addSlide()
    pptxSlide.background = await slideBackground(slide, deck.theme)

    for (const element of slide.elements) {
      switch (element.type) {
        case "text":
          addText(pptxSlide, element, deck.theme)
          break
        case "shape":
          addShape(presentation, pptxSlide, element)
          break
        case "image":
          await addImage(pptxSlide, element, deck.theme)
          break
        case "table":
          addTable(pptxSlide, element, deck.theme)
          break
        case "chart":
          addChart(presentation, pptxSlide, element, deck.theme)
          break
      }
    }
  }
  return presentation
}

function fileNameFor(title: string) {
  const safeTitle = title.replace(/[\\/:*?"<>|]+/g, " ").trim()
  return `${safeTitle || "Presentation"}.pptx`
}

// Loaded only when needed, so opening the editor doesn't download the export library.
export async function exportDeckToPptx(deck: Deck) {
  const { default: PptxGenJSClass } = await import("pptxgenjs")
  const presentation = await buildPresentation(deck, new PptxGenJSClass())
  await presentation.writeFile({ fileName: fileNameFor(deck.title) })
}
