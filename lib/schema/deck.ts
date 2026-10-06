import { z } from "zod"

export const ARTBOARD_WIDTH = 1920
export const ARTBOARD_HEIGHT = 1080
export const MIN_ELEMENT_SIZE = 40

const boxFields = {
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
  w: z.number().min(MIN_ELEMENT_SIZE),
  h: z.number().min(MIN_ELEMENT_SIZE),
}

const textElementSchema = z.strictObject({
  ...boxFields,
  type: z.literal("text"),
  paragraphs: z.array(z.string()),
  fontSize: z.number().positive(),
  bold: z.boolean(),
  italic: z.boolean(),
  color: z.string(),
  align: z.enum(["left", "center", "right"]),
  listStyle: z.enum(["none", "bullet", "number"]),
})

const imageElementSchema = z.strictObject({
  ...boxFields,
  type: z.literal("image"),
  src: z.string().min(1),
  alt: z.string(),
  fit: z.enum(["cover", "contain"]),
})

const chartElementSchema = z
  .strictObject({
    ...boxFields,
    type: z.literal("chart"),
    chartType: z.enum(["bar", "line", "pie", "area", "stackedBar"]),
    title: z.string(),
    categories: z.array(z.string()).min(1),
    series: z
      .array(
        z.strictObject({
          name: z.string(),
          data: z.array(z.number()),
          color: z.string().optional(),
        })
      )
      .min(1),
    showLegend: z.boolean(),
    xAxisLabel: z.string().optional(),
    yAxisLabel: z.string().optional(),
  })
  .refine(
    (chart) =>
      chart.series.every(
        (series) => series.data.length === chart.categories.length
      ),
    {
      message:
        "Every chart series needs exactly one value per category (series data length must equal categories length).",
    }
  )

const tableElementSchema = z
  .strictObject({
    ...boxFields,
    type: z.literal("table"),
    rows: z.array(z.array(z.string()).min(1)).min(1),
    headerRow: z.boolean(),
  })
  .refine(
    (table) => table.rows.every((row) => row.length === table.rows[0].length),
    { message: "Every table row needs the same number of cells." }
  )

const shapeElementSchema = z.strictObject({
  ...boxFields,
  type: z.literal("shape"),
  shape: z.enum(["rect", "ellipse"]),
  fill: z.string(),
  stroke: z.string(),
  strokeWidth: z.number().min(0),
})

export const slideElementSchema = z.discriminatedUnion("type", [
  textElementSchema,
  imageElementSchema,
  chartElementSchema,
  tableElementSchema,
  shapeElementSchema,
])

export const slideLayoutSchema = z.enum([
  "title",
  "content",
  "two-column",
  "comparison",
  "section",
  "chart-forward",
  "blank",
])

export const slideSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string(),
  layout: slideLayoutSchema,
  background: z.string(),
  notes: z.string(),
  elements: z.array(slideElementSchema),
})

export const deckSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string(),
  aspectRatio: z.literal("16:9"),
  theme: z.strictObject({
    fontFamily: z.string(),
    colors: z.strictObject({
      background: z.string(),
      text: z.string(),
      accent: z.string(),
    }),
  }),
  slides: z.array(slideSchema),
})

export type Deck = z.infer<typeof deckSchema>
export type Slide = z.infer<typeof slideSchema>
export type SlideLayout = z.infer<typeof slideLayoutSchema>
export type SlideElement = z.infer<typeof slideElementSchema>

type FieldsExceptIdAndType<Element> = Element extends SlideElement
  ? Partial<Omit<Element, "id" | "type">>
  : never

export type ElementChanges = FieldsExceptIdAndType<SlideElement>
