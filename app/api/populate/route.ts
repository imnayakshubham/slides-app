import { tool } from "ai"
import { z } from "zod"

import { POPULATOR_INSTRUCTIONS } from "@/lib/ai/Prompts"
import { streamAgentReply } from "@/lib/ai/StreamAgentReply"
import { applyDeckEdit, type DeckEdit } from "@/lib/edits/DeckEdits"
import { buildSlideElements } from "@/lib/layouts/BuildSlideElements"
import { deckSchema } from "@/lib/schema/Deck"
import { outlineSchema, type Outline } from "@/lib/schema/Outline"
import { slideContentSchema } from "@/lib/schema/SlideContent"

export const runtime = "nodejs"
export const maxDuration = 60

// One good fill is enough; a rejected one is retried, up to this many tries.
const MAX_FILL_ATTEMPTS = 3

const populateRequestSchema = z.object({
  deck: deckSchema,
  // The theme is already on the deck, so it isn't needed here.
  outline: outlineSchema.partial({ themeType: true }),
  slideId: z.string().min(1),
  outlineSlideIndex: z.number().int().min(0),
})

// The whole story, so each slide is written to fit the deck around it.
function describeOutline(outline: Pick<Outline, "title" | "slides">, targetIndex: number) {
  const slideLines = outline.slides.map((slide, slideIndex) => {
    const marker = slideIndex === targetIndex ? "  <- write this one" : ""
    return `${slideIndex + 1}. ${slide.title} (${slide.layout})${marker}`
  })
  const target = outline.slides[targetIndex]
  return [
    `Deck outline for "${outline.title}":`,
    ...slideLines,
    "",
    `Target slide: "${target.title}"`,
    `Intent: ${target.intent}`,
    `Key points: ${target.contentHints.join("; ") || "none given"}`,
  ].join("\n")
}

// Phase two: the AI writes one slide in a single tool call, and layout code places it.
export async function POST(request: Request) {
  const requestBody = await request.json().catch(() => null)
  const parsedRequest = populateRequestSchema.safeParse(requestBody)
  console.log("parsedRequest ====>", parsedRequest)
  if (!parsedRequest.success) {
    return new Response(z.prettifyError(parsedRequest.error), { status: 400 })
  }

  const { deck, outline, slideId, outlineSlideIndex } = parsedRequest.data
  const outlineSlide = outline.slides[outlineSlideIndex]
  const slide = deck.slides.find((deckSlide) => deckSlide.id === slideId)
  if (!outlineSlide || !slide) {
    return new Response("That slide is not in the deck or the outline.", { status: 400 })
  }

  let isSlideFilled = false

  return streamAgentReply({
    // Only the story and this slide: the AI writes content, the layout code places it.
    instructions: [POPULATOR_INSTRUCTIONS, describeOutline(outline, outlineSlideIndex)].join("\n\n"),
    messages: [{ role: "user", content: `Write slide "${slide.title}" now.` }],
    createTools: (writer) => ({
      fill_slide: tool({
        description:
          "Write this slide's content. The layout is handled for you: only provide the text, data and speaker notes.",
        inputSchema: slideContentSchema(outlineSlide),
        execute: (content) => {
          const elements = buildSlideElements(slide, content, deck.theme)
          const edit: DeckEdit = {
            type: "batch",
            edits: [
              ...elements.map((element) => ({
                type: "addElement" as const,
                slideId,
                element,
              })),
              {
                type: "updateSlide",
                slideId,
                changes: { notes: content.speakerNotes },
              },
            ],
          }
          const result = applyDeckEdit(deck, edit)
          if (!result.ok) return { ok: false, error: result.error }
          isSlideFilled = true
          writer.write({ type: "data-edit", data: { edit, label: `Wrote "${slide.title}"` } })
          return { ok: true }
        },
      }),
    }),
    toolChoice: { type: "tool", toolName: "fill_slide" },
    maxSteps: MAX_FILL_ATTEMPTS,
    isFinished: () => isSlideFilled,
    abortSignal: request.signal,
  })
}
