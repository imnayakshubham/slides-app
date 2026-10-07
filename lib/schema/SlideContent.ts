import { z } from "zod"

import type { OutlineSlide } from "@/lib/schema/Outline"

// What the AI writes for one slide. It only writes content; the layout code
// (lib/layouts/BuildSlideElements.ts) decides where everything goes.

const speakerNotesSchema = z
  .string()
  .max(600)
  .describe("What the presenter says on this slide, 2 to 4 sentences.")

const eyebrowSchema = z
  .string()
  .max(30)
  .describe(
    "A 1 to 3 word label shown small above the title, naming the slide's role, e.g. 'The problem', 'Why now', 'Results'."
  )

const bulletsSchema = z
  .array(z.string().max(100))
  .min(2)
  .max(6)
  .describe("Short, parallel bullet points, 12 words or fewer each.")

const chartSchema = z
  .strictObject({
    chartType: z.enum(["bar", "line", "pie", "area", "stackedBar"]),
    title: z.string().max(80).describe("Short chart title."),
    categories: z
      .array(z.string().max(30))
      .min(2)
      .max(12)
      .describe("Category names along the x-axis, or the pie slice names."),
    series: z
      .array(
        z.strictObject({
          name: z.string().max(40),
          data: z
            .array(z.number())
            .describe("One number per category, in the same order."),
        })
      )
      .min(1)
      .max(4)
      .describe("Data series. A pie chart only shows the first series."),
  })
  .refine(
    (chart) =>
      chart.series.every(
        (series) => series.data.length === chart.categories.length
      ),
    { message: "Every series needs exactly one value per category." }
  )

const tableSchema = z
  .strictObject({
    rows: z
      .array(z.array(z.string().max(60)).min(2).max(5))
      .min(2)
      .max(7)
      .describe("Rows of cell text. The first row is the header row."),
  })
  .refine(
    (table) => table.rows.every((row) => row.length === table.rows[0].length),
    { message: "Every table row needs the same number of cells." }
  )

const columnSchema = z.strictObject({
  heading: z.string().max(60).describe("Short column heading."),
  bullets: bulletsSchema.max(5),
})

// Everything a slide can hold. Each layout asks for its own subset.
export type SlideContent = {
  eyebrow?: string
  subtitle?: string
  bullets?: string[]
  chart?: z.infer<typeof chartSchema>
  table?: z.infer<typeof tableSchema>
  left?: z.infer<typeof columnSchema>
  right?: z.infer<typeof columnSchema>
  takeaway?: string
  speakerNotes: string
}

// The exact content this slide needs, so the AI can't skip the chart the
// outline promised or send fields its layout has no room for.
export function slideContentSchema(
  outlineSlide: OutlineSlide
): z.ZodType<SlideContent> {
  switch (outlineSlide.layout) {
    case "title":
    case "section":
      return z.strictObject({
        eyebrow: eyebrowSchema,
        subtitle: z.string().max(120).describe("One line under the title."),
        speakerNotes: speakerNotesSchema,
      })

    case "two-column":
    case "comparison":
      return z.strictObject({
        eyebrow: eyebrowSchema,
        left: columnSchema,
        right: columnSchema,
        speakerNotes: speakerNotesSchema,
      })

    case "chart-forward":
      if (outlineSlide.wantsTable && !outlineSlide.wantsChart) {
        return z.strictObject({
          eyebrow: eyebrowSchema,
          table: tableSchema,
          takeaway: z.string().max(140).optional(),
          speakerNotes: speakerNotesSchema,
        })
      }
      return z.strictObject({
        eyebrow: eyebrowSchema,
        chart: chartSchema,
        takeaway: z
          .string()
          .max(140)
          .optional()
          .describe("One line under the chart: what the numbers show."),
        speakerNotes: speakerNotesSchema,
      })

    case "content":
      if (outlineSlide.wantsChart) {
        return z.strictObject({
          eyebrow: eyebrowSchema,
          bullets: bulletsSchema.max(4),
          chart: chartSchema,
          speakerNotes: speakerNotesSchema,
        })
      }
      if (outlineSlide.wantsTable) {
        return z.strictObject({
          eyebrow: eyebrowSchema,
          bullets: bulletsSchema.max(4),
          table: tableSchema,
          speakerNotes: speakerNotesSchema,
        })
      }
      return z.strictObject({
        eyebrow: eyebrowSchema,
        bullets: bulletsSchema,
        speakerNotes: speakerNotesSchema,
      })
  }
}
