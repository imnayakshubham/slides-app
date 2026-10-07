import { z } from "zod"

// The layouts the planner may pick; "blank" is left to the user.
const outlineLayoutSchema = z.enum([
  "title",
  "section",
  "content",
  "two-column",
  "comparison",
  "chart-forward",
])

export const outlineSlideSchema = z.strictObject({
  title: z.string().min(1).describe("Slide title, short."),
  layout: outlineLayoutSchema.describe(
    "title for the opening slide, section for a divider, chart-forward when the chart is the point, two-column or comparison for side by side, content otherwise."
  ),
  intent: z.string().describe("One sentence: what this slide must get across."),
  contentHints: z
    .array(z.string())
    .describe("Key points, facts or numbers to put on the slide."),
  wantsChart: z.boolean().describe("True when the slide needs a chart."),
  wantsTable: z.boolean().describe("True when the slide needs a table."),
})

export const outlineSchema = z.strictObject({
  title: z.string().min(1).describe("Title of the whole deck."),
  slides: z.array(outlineSlideSchema).min(1).max(10),
})

export type OutlineSlide = z.infer<typeof outlineSlideSchema>
export type Outline = z.infer<typeof outlineSchema>
