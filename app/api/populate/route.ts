import { tool } from "ai"
import { z } from "zod"

import { buildDeckContext } from "@/lib/ai/DeckContext"
import { createEventStream } from "@/lib/ai/EventStream"
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
  outline: outlineSchema,
  slideId: z.string().min(1),
  outlineSlideIndex: z.number().int().min(0),
})

// The whole story, so each slide is written to fit the deck around it.
function describeOutline(outline: Outline, targetIndex: number) {
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

// Phase two of generation: the AI writes one slide's content in a single
// tool call, and the layout code places it, so the slide comes out finished.
export async function POST(request: Request) {
  const requestBody = await request.json().catch(() => null)
  const parsedRequest = populateRequestSchema.safeParse(requestBody)
  if (!parsedRequest.success) {
    return Response.json(
      { error: z.prettifyError(parsedRequest.error) },
      { status: 400 }
    )
  }

  const { deck, outline, slideId, outlineSlideIndex } = parsedRequest.data
  const outlineSlide = outline.slides[outlineSlideIndex]
  const slide = deck.slides.find((deckSlide) => deckSlide.id === slideId)
  if (!outlineSlide || !slide) {
    return Response.json(
      { error: "That slide is not in the deck or the outline." },
      { status: 400 }
    )
  }

  const { response, sendEvent, closeStream } = createEventStream()
  let isSlideFilled = false

  const tools = {
    fill_slide: tool({
      description:
        "Write this slide's content. The layout is handled for you: only provide the text, data and speaker notes.",
      inputSchema: slideContentSchema(outlineSlide),
      execute: (content, { toolCallId }) => {
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
        if (!result.ok) {
          sendEvent({ event: "tool_error", data: { message: result.error } })
          return { ok: false, error: result.error }
        }
        isSlideFilled = true
        sendEvent({
          event: "edit",
          data: { edit, label: `Wrote "${slide.title}"`, toolCallId },
        })
        return { ok: true }
      },
    }),
  }

  streamAgentReply({
    instructions: [
      POPULATOR_INSTRUCTIONS,
      buildDeckContext(deck, slideId, []),
      describeOutline(outline, outlineSlideIndex),
    ].join("\n\n"),
    messages: [{ role: "user", content: `Write slide "${slide.title}" now.` }],
    tools,
    toolChoice: { type: "tool", toolName: "fill_slide" },
    maxSteps: MAX_FILL_ATTEMPTS,
    isFinished: () => isSlideFilled,
    sendEvent,
    abortSignal: request.signal,
  }).finally(closeStream)

  return response
}
