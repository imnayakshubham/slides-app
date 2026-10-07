import { arrayMove } from "@dnd-kit/sortable"
import { DefaultChatTransport, readUIMessageStream } from "ai"
import { toast } from "sonner"

import type { SlidesMessage } from "@/lib/ai/SlidesMessage"
import {
  applyAgentEdit,
  getAgent,
  isAgentBusyOn,
  openDeckId,
  releaseSlidesToAgent,
  runAgentWork,
  updateAgent,
} from "@/lib/client/AgentRun"
import type { DeckEdit } from "@/lib/edits/DeckEdits"
import { messageFromError } from "@/lib/ErrorMessage"
import { createSlide } from "@/lib/layouts/SlideLayouts"
import type { OutlineSlide } from "@/lib/schema/Outline"
import { deckThemeFor } from "@/lib/themes/Themes"
import type { SlideBuild, SlideBuildStatus } from "@/store/AgentStore"
import { useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

// Building a deck from an approved outline: editing the outline, then writing each slide.

function openOutlineReview() {
  const deckId = openDeckId()
  if (!deckId) return null
  return getAgent(deckId).outlineReview
}

// Row keys are reordered and removed together with their slides.
function saveOutlineSlides(slides: OutlineSlide[], slideKeys: string[]) {
  const deckId = openDeckId()
  const outlineReview = openOutlineReview()
  if (!deckId || !outlineReview) return
  const outline = { ...outlineReview.outline, slides }
  updateAgent(deckId, { outlineReview: { ...outlineReview, outline, slideKeys } })
}

export function renameOutlineSlide(slideIndex: number, title: string) {
  const outlineReview = openOutlineReview()
  if (!outlineReview) return
  const slides = outlineReview.outline.slides.map((slide, index) =>
    index === slideIndex ? { ...slide, title } : slide
  )
  saveOutlineSlides(slides, outlineReview.slideKeys)
}

export function moveOutlineSlide(fromIndex: number, toIndex: number) {
  const outlineReview = openOutlineReview()
  if (!outlineReview) return
  const slides = arrayMove(outlineReview.outline.slides, fromIndex, toIndex)
  const slideKeys = arrayMove(outlineReview.slideKeys, fromIndex, toIndex)
  saveOutlineSlides(slides, slideKeys)
}

export function removeOutlineSlide(slideIndex: number) {
  const outlineReview = openOutlineReview()
  if (!outlineReview) return
  const slides = outlineReview.outline.slides.filter((_, index) => index !== slideIndex)
  const slideKeys = outlineReview.slideKeys.filter((_, index) => index !== slideIndex)
  saveOutlineSlides(slides, slideKeys)
}

export function discardOutline() {
  const deckId = openDeckId()
  if (!deckId) return
  const outlineReview = getAgent(deckId).outlineReview
  if (!outlineReview) return
  updateAgent(deckId, { outlineReview: null })
}

// Phase two: adds every planned slide at once, then fills them one by one, as one undo step.
export async function generateApprovedOutline() {
  const deck = useDeckStore.getState().deck
  if (!deck || isAgentBusyOn(deck.id)) return
  const deckId = deck.id
  const outlineReview = getAgent(deckId).outlineReview
  if (!outlineReview) return
  const { messageId, outline } = outlineReview
  updateAgent(deckId, { outlineReview: null })

  await runAgentWork(deckId, "generating", async (abortSignal) => {
    // Outlines planned before themes existed keep the deck's theme.
    const theme = outline.themeId ? deckThemeFor(outline.themeId) : deck.theme
    const plannedSlides = outline.slides.map((outlineSlide) =>
      createSlide(outlineSlide.layout, outlineSlide.title, theme)
    )
    const edits: DeckEdit[] = [
      { type: "updateDeck", changes: { title: outline.title } },
      { type: "setTheme", theme },
      ...plannedSlides.map((slide) => ({ type: "addSlide" as const, slide })),
    ]
    const result = useDeckStore.getState().applyEdit({ type: "batch", edits })
    if (!result.ok) {
      toast.error("The slides couldn't be added", { description: result.error, duration: Infinity })
      return
    }

    const slideBuilds: SlideBuild[] = plannedSlides.map((slide, index) => ({
      slideId: slide.id,
      title: slide.title,
      outlineSlideIndex: index,
      status: "waiting",
    }))
    updateAgent(deckId, {
      generation: { messageId, outline, slides: slideBuilds, isStopped: false },
      isFollowingGeneration: true,
    })
    await fillSlides(deckId, slideBuilds, abortSignal)
  })
}

export async function retrySlideBuild(slideId: string) {
  const deckId = openDeckId()
  if (!deckId || isAgentBusyOn(deckId)) return
  const slideBuild = getAgent(deckId).generation?.slides.find((build) => build.slideId === slideId)
  if (!slideBuild) return
  await runAgentWork(deckId, "generating", (abortSignal) => fillSlides(deckId, [slideBuild], abortSignal))
}

export async function continueStoppedGeneration() {
  const deckId = openDeckId()
  if (!deckId || isAgentBusyOn(deckId)) return
  const generation = getAgent(deckId).generation
  if (!generation) return
  const waitingBuilds = generation.slides.filter((build) => build.status === "waiting")
  updateAgent(deckId, { isFollowingGeneration: true })
  await runAgentWork(deckId, "generating", (abortSignal) => fillSlides(deckId, waitingBuilds, abortSignal))
}

function setSlideBuildStatus(deckId: string, slideId: string, status: SlideBuildStatus) {
  const generation = getAgent(deckId).generation
  if (!generation) return
  const slides = generation.slides.map((build) => (build.slideId === slideId ? { ...build, status } : build))
  updateAgent(deckId, { generation: { ...generation, slides } })
}

function setGenerationStopped(deckId: string, isStopped: boolean) {
  const generation = getAgent(deckId).generation
  if (!generation) return
  updateAgent(deckId, { generation: { ...generation, isStopped } })
}

async function fillSlides(deckId: string, slideBuilds: SlideBuild[], abortSignal: AbortSignal) {
  const generation = getAgent(deckId).generation
  if (!generation) return
  setGenerationStopped(deckId, false)
  let failedSlideCount = 0

  for (const slideBuild of slideBuilds) {
    if (abortSignal.aborted) break
    const deck = useDeckStore.getState().deck
    // The user may have deleted the slide while earlier ones were filling.
    if (!deck?.slides.some((slide) => slide.id === slideBuild.slideId)) {
      setSlideBuildStatus(deckId, slideBuild.slideId, "failed")
      continue
    }

    releaseSlidesToAgent([slideBuild.slideId])
    setSlideBuildStatus(deckId, slideBuild.slideId, "filling")
    if (getAgent(deckId).isFollowingGeneration) {
      useEditorStore.getState().goToSlide(slideBuild.slideId)
    }
    const { errorMessage, appliedEditCount } = await writeSlide(deckId, abortSignal, {
      deck,
      outline: generation.outline,
      slideId: slideBuild.slideId,
      outlineSlideIndex: slideBuild.outlineSlideIndex,
    })

    if (abortSignal.aborted) {
      setSlideBuildStatus(deckId, slideBuild.slideId, "waiting")
      break
    }
    // A failed request (rate limit, bad key, no connection) would fail every slide after it too, so pause.
    if (errorMessage) {
      setSlideBuildStatus(deckId, slideBuild.slideId, "waiting")
      setGenerationStopped(deckId, true)
      toast.error("Generation paused", {
        description: `${errorMessage} Use Continue to write the remaining slides.`,
        duration: Infinity,
      })
      break
    }
    // No edit means every attempt to write the slide was rejected.
    const isFilled = appliedEditCount > 0
    if (!isFilled) failedSlideCount += 1
    setSlideBuildStatus(deckId, slideBuild.slideId, isFilled ? "done" : "failed")
  }

  if (failedSlideCount > 0) {
    const slides = failedSlideCount === 1 ? "1 slide" : `${failedSlideCount} slides`
    toast.error(`${slides} couldn't be written`, { description: "Use Retry next to each one.", duration: Infinity })
  }
  if (abortSignal.aborted) setGenerationStopped(deckId, true)
  updateAgent(deckId, { isFollowingGeneration: false })
}

// Writes one slide through /api/populate; its changes apply as soon as they arrive.
async function writeSlide(deckId: string, abortSignal: AbortSignal, body: Record<string, unknown>) {
  let errorMessage: string | undefined
  let appliedEditCount = 0
  let handledEditCount = 0
  try {
    const transport = new DefaultChatTransport<SlidesMessage>({
      api: "/api/populate",
      prepareSendMessagesRequest: () => ({ body }),
    })
    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: deckId,
      messageId: undefined,
      messages: [],
      abortSignal,
    })
    // Each update is the whole reply so far; only new edits are applied.
    for await (const reply of readUIMessageStream<SlidesMessage>({ stream, terminateOnError: true })) {
      const edits = reply.parts.filter((part) => part.type === "data-edit")
      for (const editPart of edits.slice(handledEditCount)) {
        if (applyAgentEdit(deckId, editPart.data.edit, { lockSlides: false })) appliedEditCount += 1
      }
      handledEditCount = edits.length
    }
  } catch (error) {
    if (!abortSignal.aborted) errorMessage = messageFromError(error)
  }
  return { errorMessage, appliedEditCount }
}
