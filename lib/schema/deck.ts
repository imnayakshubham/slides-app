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

// Styling for some words of a paragraph. A mark left out means "same as the
// text box".
const textRunSchema = z.strictObject({
  text: z.string(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  color: z.string().optional(),
  fontSize: z.number().positive().optional(),
})

// A plain string is a paragraph without word-level styling.
const paragraphSchema = z.union([z.string(), z.array(textRunSchema).min(1)])

const textElementSchema = z.strictObject({
  ...boxFields,
  type: z.literal("text"),
  paragraphs: z.array(paragraphSchema),
  fontSize: z.number().positive(),
  bold: z.boolean(),
  italic: z.boolean(),
  underline: z.boolean().optional(),
  color: z.string(),
  align: z.enum(["left", "center", "right"]),
  listStyle: z.enum(["none", "bullet", "number"]),
  font: z.literal("heading").optional(),
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

export const slideBackgroundSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("color"), color: z.string().min(1) }),
  z.strictObject({
    type: z.literal("gradient"),
    from: z.string().min(1),
    to: z.string().min(1),
    angle: z.number().min(0).max(360),
  }),
  // Drawn covering the whole slide, centered.
  z.strictObject({ type: z.literal("image"), src: z.string().min(1) }),
])

// Decks saved before backgrounds were typed stored a plain CSS color string,
// where "" meant the theme background.
function upgradeColorStringBackground(background: unknown) {
  if (background === "") return undefined
  if (typeof background === "string")
    return { type: "color", color: background }
  return background
}

export const slideSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string(),
  layout: slideLayoutSchema,
  // Left out = the theme background.
  background: z.preprocess(
    upgradeColorStringBackground,
    slideBackgroundSchema.optional()
  ),
  notes: z.string(),
  elements: z.array(slideElementSchema),
})

const themeSchema = z.strictObject({
  // Which built-in theme this came from (lib/themes/Themes.ts).
  id: z.string(),
  // The body font.
  fontFamily: z.string(),
  headingFont: z.string(),
  colors: z.strictObject({
    background: z.string(),
    text: z.string(),
    heading: z.string(),
    accent: z.string(),
    // Fills for cards, and chart series after the first.
    card: z.array(z.string()).min(1),
    // Text on top of a card.
    cardText: z.string(),
  }),
})

// The card colors of the original default theme.
export const CLASSIC_CARD_COLORS = ["#818CF8", "#F472B6", "#FBBF24", "#34D399"]

// Decks saved before themes had headings and cards keep their look: the
// heading uses the body font and text color.
function upgradeTheme(theme: unknown) {
  const savedTheme = theme as {
    fontFamily?: string
    headingFont?: string
    colors?: Record<string, unknown>
  }
  if (!savedTheme?.colors || savedTheme.headingFont) return theme
  return {
    id: "classic",
    ...savedTheme,
    headingFont: savedTheme.fontFamily,
    colors: {
      heading: savedTheme.colors.text,
      card: CLASSIC_CARD_COLORS,
      cardText: savedTheme.colors.text,
      ...savedTheme.colors,
    },
  }
}

export const deckSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string(),
  aspectRatio: z.literal("16:9"),
  theme: z.preprocess(upgradeTheme, themeSchema),
  slides: z.array(slideSchema),
})

export type Deck = z.infer<typeof deckSchema>
export type Theme = z.infer<typeof themeSchema>
export type Slide = z.infer<typeof slideSchema>
export type SlideLayout = z.infer<typeof slideLayoutSchema>
export type SlideBackground = z.infer<typeof slideBackgroundSchema>
export type TextRun = z.infer<typeof textRunSchema>
export type Paragraph = z.infer<typeof paragraphSchema>
export type SlideElement = z.infer<typeof slideElementSchema>

type FieldsExceptIdAndType<Element> = Element extends SlideElement
  ? Partial<Omit<Element, "id" | "type">>
  : never

export type ElementChanges = FieldsExceptIdAndType<SlideElement>
