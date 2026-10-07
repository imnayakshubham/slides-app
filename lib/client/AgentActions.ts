import { arrayMove } from "@dnd-kit/sortable"
import { toast } from "sonner"

import { readServerStream } from "@/lib/client/ReadServerStream"
import { messageFromError } from "@/lib/ErrorMessage"
import { endActiveTextEdit } from "@/lib/client/RichTextEditing"
import { findElementLocation, type DeckEdit } from "@/lib/edits/DeckEdits"
import { createId } from "@/lib/Ids"
import { createSlide } from "@/lib/layouts/SlideLayouts"
import { deckRepository } from "@/lib/repository"
import type { ChatMessage } from "@/lib/schema/Conversation"
import type { Deck } from "@/lib/schema/Deck"
import type { Outline, OutlineSlide } from "@/lib/schema/Outline"
import type { StreamEvent } from "@/lib/StreamEvents"
import { deckThemeFor } from "@/lib/themes/Themes"
import { useDeckStore } from "@/store/DeckStore"
import { agentFor, agentLabelFor, useAgentStore } from "@/store/AgentStore"
import type { AgentRunKind, DeckAgent, SlideBuild, SlideBuildStatus } from "@/store/AgentStore"
import { useEditorStore } from "@/store/EditorStore"

// Everything the agent does from the browser: chat edits, planning, building and retrying slides.

const NO_OUTLINE_MESSAGE = "The agent didn't return an outline. Please try again."

// Running requests by run id, so Stop aborts exactly the right one.
const abortControllersByRunId = new Map<string, AbortController>()

function openDeckId() {
  return useDeckStore.getState().deck?.id
}

function getAgent(deckId: string) {
  return agentFor(useAgentStore.getState().agents, deckId)
}

function updateAgent(deckId: string, changes: Partial<DeckAgent>) {
  useAgentStore.getState().updateAgent(deckId, changes)
}

// True while the agent is changing (or has yet to write) this slide; the user can't edit it then.
export function isSlideLockedByAgent(slideId: string) {
  const deckId = openDeckId()
  if (!deckId) return false
  return agentLabelFor(getAgent(deckId), slideId) !== null
}

// Saves any typing on these slides and unselects their elements before the agent changes them.
function releaseSlidesToAgent(slideIds: string[]) {
  const deck = useDeckStore.getState().deck
  if (!deck) return
  const isOnLockedSlide = (elementId: string) => {
    const location = findElementLocation(deck, elementId)
    return location !== undefined && slideIds.includes(location.slide.id)
  }

  const editor = useEditorStore.getState()
  if (editor.editingElementId && isOnLockedSlide(editor.editingElementId)) {
    endActiveTextEdit()
    // A table being typed into saves when its cell loses focus.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  }
  const unlockedSelection = editor.selectedElementIds.filter((elementId) => !isOnLockedSlide(elementId))
  if (unlockedSelection.length !== editor.selectedElementIds.length) {
    editor.setSelectedElementIds(unlockedSelection)
  }
}

export function isAgentBusyOn(deckId: string | undefined) {
  return Boolean(deckId && getAgent(deckId).run)
}

// Stop button: stops the open deck's run.
export function stopAgent() {
  const deckId = openDeckId()
  const runId = deckId ? getAgent(deckId).run?.runId : undefined
  if (runId) abortControllersByRunId.get(runId)?.abort()
}

// Leaving the editor stops everything; changes already made stay saved.
export function stopAllAgentRuns() {
  for (const abortController of abortControllersByRunId.values()) {
    abortController.abort()
  }
}

// A new message on an empty deck plans a deck; otherwise it edits the deck.
export async function sendAgentMessage(text: string) {
  const deckId = openDeckId()
  if (!deckId || isAgentBusyOn(deckId)) return
  const { chatMessages, addChatMessage } = useAgentStore.getState()
  addChatMessage(createMessage("user", text))
  saveConversation(deckId)
  await respondTo(deckId, text, chatMessages)
}

export async function retryLastAgentMessage() {
  const deckId = openDeckId()
  if (!deckId || isAgentBusyOn(deckId)) return
  const { chatMessages, removeChatMessage } = useAgentStore.getState()

  const lastMessage = chatMessages.at(-1)
  if (lastMessage?.status === "error") removeChatMessage(lastMessage.id)

  const lastUserMessageIndex = chatMessages.findLastIndex((message) => message.role === "user")
  if (lastUserMessageIndex === -1) return
  await respondTo(deckId, chatMessages[lastUserMessageIndex].content, chatMessages.slice(0, lastUserMessageIndex))
}

async function respondTo(deckId: string, text: string, earlierMessages: ChatMessage[]) {
  const deck = useDeckStore.getState().deck
  if (!deck) return
  if (deck.slides.length === 0) {
    await planDeck(deckId, text)
  } else {
    await runChatTurn(deckId, text, earlierMessages)
  }
}

async function runChatTurn(deckId: string, userMessage: string, earlierMessages: ChatMessage[]) {
  await runAgentWork(deckId, "chat", async (abortSignal) => {
    const { currentSlideId, selectedElementIds } = useEditorStore.getState()
    const messageId = startAssistantMessage()
    const { errorMessage } = await streamRequest({
      deckId,
      messageId,
      url: "/api/chat",
      body: {
        deck: useDeckStore.getState().deck,
        messages: earlierMessages.filter((message) => message.status === "complete").map(toAgentHistoryMessage),
        currentSlideId,
        selectedIds: selectedElementIds,
        userMessage,
      },
      abortSignal,
      isChatReply: true,
    })
    if (errorMessage) toast.error("The agent couldn't reply", { description: errorMessage })
    finishAssistantMessage(messageId, errorMessage, abortSignal.aborted)
  })
}

// Phase one: the outline is shown for review; the deck is not touched.
async function planDeck(deckId: string, prompt: string) {
  await runAgentWork(deckId, "planning", async (abortSignal) => {
    const messageId = startAssistantMessage()
    const { errorMessage, outline } = await streamRequest({
      deckId,
      messageId,
      url: "/api/plan",
      body: { prompt },
      abortSignal,
      isChatReply: false,
    })

    if (outline) {
      updateMessage(messageId, {
        content: `Here's an outline for “${outline.title}”, ${outline.slides.length} slides. Edit, reorder or remove slides, then generate.`,
      })
      const slideKeys = outline.slides.map(() => createId())
      updateAgent(deckId, { outlineReview: { messageId, outline, slideKeys } })
    }
    const missingOutline = !outline && !errorMessage && !abortSignal.aborted ? NO_OUTLINE_MESSAGE : undefined
    const failure = errorMessage ?? missingOutline
    if (failure) toast.error("The agent couldn't plan the deck", { description: failure })
    finishAssistantMessage(messageId, failure, abortSignal.aborted)
  })
}

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
  updateMessage(outlineReview.messageId, { content: "Outline discarded." })
  saveConversation(deckId)
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
      finishAssistantMessage(messageId, result.error, false)
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
    const { errorMessage, appliedEditCount } = await streamRequest({
      deckId,
      messageId: generation.messageId,
      url: "/api/populate",
      body: {
        deck,
        outline: generation.outline,
        slideId: slideBuild.slideId,
        outlineSlideIndex: slideBuild.outlineSlideIndex,
      },
      abortSignal,
      isChatReply: false,
    })

    if (abortSignal.aborted) {
      setSlideBuildStatus(deckId, slideBuild.slideId, "waiting")
      break
    }
    // A failed request (rate limit, bad key, no connection) would fail every slide after it too, so pause.
    if (errorMessage) {
      setSlideBuildStatus(deckId, slideBuild.slideId, "waiting")
      setGenerationStopped(deckId, true)
      toast.error("Generation paused", { description: `${errorMessage} Use Continue to write the remaining slides.` })
      break
    }
    // No edit means every attempt to write the slide was rejected.
    const isFilled = appliedEditCount > 0
    if (!isFilled) failedSlideCount += 1
    setSlideBuildStatus(deckId, slideBuild.slideId, isFilled ? "done" : "failed")
  }

  if (failedSlideCount > 0) {
    const slides = failedSlideCount === 1 ? "1 slide" : `${failedSlideCount} slides`
    toast.error(`${slides} couldn't be written`, { description: "Use Retry next to each one." })
  }
  if (abortSignal.aborted) setGenerationStopped(deckId, true)
  updateAgent(deckId, { isFollowingGeneration: false })
}

// One run per deck and one undo step; its cleanup never ends a newer run or another deck's.
async function runAgentWork(deckId: string, kind: AgentRunKind, work: (abortSignal: AbortSignal) => Promise<void>) {
  const runId = createId()
  const abortController = new AbortController()
  abortControllersByRunId.set(runId, abortController)
  updateAgent(deckId, { run: { runId, kind, editingSlideIds: [] } })
  useDeckStore.getState().startUndoGroup()
  try {
    await work(abortController.signal)
  } finally {
    abortControllersByRunId.delete(runId)
    const isStillThisRun = getAgent(deckId).run?.runId === runId
    if (isStillThisRun) updateAgent(deckId, { run: null })
    if (isStillThisRun && openDeckId() === deckId) {
      useDeckStore.getState().finishUndoGroup()
      saveConversation(deckId)
    }
  }
}

type StreamRequest = {
  deckId: string
  messageId: string
  url: string
  body: unknown
  abortSignal: AbortSignal
  // Chat replies show text, changes and edited slides; planning and building show their own.
  isChatReply: boolean
}

// Streams one API call: deck edits apply as they arrive and the reply text goes into the chat.
async function streamRequest(request: StreamRequest) {
  const { deckId, messageId, url, body, abortSignal, isChatReply } = request
  let errorMessage: string | undefined
  let outline: Outline | undefined
  let appliedEditCount = 0
  const textBuffer = createTextBuffer((text) => {
    const message = findChatMessage(messageId)
    if (message) updateMessage(messageId, { content: message.content + text })
  })

  function addAction(label: string, failed: boolean) {
    const message = findChatMessage(messageId)
    if (!isChatReply || !message) return
    updateMessage(messageId, { actions: [...message.actions, { label, failed }] })
  }

  function handleStreamEvent(streamEvent: StreamEvent) {
    if (streamEvent.event === "text_delta" && isChatReply) {
      textBuffer.add(streamEvent.data.text)
    }
    // The user may have opened another deck: never apply this deck's edits to it.
    if (streamEvent.event === "edit" && openDeckId() === deckId) {
      const { edit, label } = streamEvent.data
      const deckBeforeEdit = useDeckStore.getState().deck
      // Lock the slides first so the user's typing is saved before the agent's change lands.
      if (isChatReply && deckBeforeEdit) {
        markSlidesBeingEdited(deckId, slideIdsChangedBy(edit, deckBeforeEdit))
      }
      // Fails when the target was deleted meanwhile.
      const result = useDeckStore.getState().applyEdit(edit)
      if (result.ok) {
        appliedEditCount += 1
        addAction(label, false)
        useAgentStore.getState().highlightElements(elementIdsChangedBy(edit))
      } else {
        addAction(`Skipped "${label}": it changed while the agent worked`, true)
      }
    }
    if (streamEvent.event === "tool_error") {
      addAction("A step failed, so the agent tried again", true)
    }
    if (streamEvent.event === "outline") {
      outline = streamEvent.data.outline
    }
    if (streamEvent.event === "error") {
      errorMessage = streamEvent.data.message
    }
  }

  try {
    await readServerStream(url, body, handleStreamEvent, abortSignal)
  } catch (error) {
    if (!abortSignal.aborted) errorMessage = messageFromError(error)
  }
  textBuffer.flush()
  return { errorMessage, outline, appliedEditCount }
}

function elementIdsChangedBy(edit: DeckEdit): string[] {
  switch (edit.type) {
    case "addElement":
      return [edit.element.id]
    case "copyElement":
      return [edit.newElementId]
    case "updateElement":
    case "moveElement":
    case "reorderElement":
      return [edit.elementId]
    case "batch":
      return edit.edits.flatMap(elementIdsChangedBy)
    default:
      return []
  }
}

function markSlidesBeingEdited(deckId: string, slideIds: string[]) {
  const run = getAgent(deckId).run
  if (!run) return
  const newSlideIds = slideIds.filter((slideId) => !run.editingSlideIds.includes(slideId))
  // Most edits touch a slide that is already marked: no update then.
  if (newSlideIds.length === 0) return
  releaseSlidesToAgent(newSlideIds)
  updateAgent(deckId, { run: { ...run, editingSlideIds: [...run.editingSlideIds, ...newSlideIds] } })
}

// Read before the edit, so a moved element marks both the slide it left and the one it joined.
function slideIdsChangedBy(edit: DeckEdit, deckBeforeEdit: Deck): string[] {
  const slideOfElement = (elementId: string) => findElementLocation(deckBeforeEdit, elementId)?.slide.id
  switch (edit.type) {
    case "addSlide":
      return [edit.slide.id]
    case "updateSlide":
    case "moveSlide":
      return [edit.slideId]
    case "addElement":
      return [edit.slideId]
    case "copyElement":
      return [edit.toSlideId]
    case "updateElement":
    case "deleteElement":
    case "reorderElement":
      return [slideOfElement(edit.elementId)].filter((slideId) => slideId !== undefined)
    case "moveElement":
      return [slideOfElement(edit.elementId), edit.toSlideId].filter((slideId) => slideId !== undefined)
    case "batch":
      return edit.edits.flatMap((innerEdit) => slideIdsChangedBy(innerEdit, deckBeforeEdit))
    default:
      return []
  }
}

function startAssistantMessage() {
  const message = {
    ...createMessage("assistant", ""),
    status: "streaming" as const,
  }
  useAgentStore.getState().addChatMessage(message)
  return message.id
}

function finishAssistantMessage(messageId: string, errorMessage: string | undefined, wasStopped: boolean) {
  if (errorMessage) {
    updateMessage(messageId, { status: "error", errorMessage })
    return
  }
  const message = findChatMessage(messageId)
  const isEmpty = !message?.content && message?.actions.length === 0
  if (wasStopped && isEmpty) {
    updateMessage(messageId, { status: "complete", content: "Stopped." })
    return
  }
  updateMessage(messageId, { status: "complete" })
}

function findChatMessage(messageId: string) {
  return useAgentStore.getState().chatMessages.find((message) => message.id === messageId)
}

function updateMessage(messageId: string, changes: Partial<ChatMessage>) {
  useAgentStore.getState().updateChatMessage(messageId, changes)
}

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: createId(),
    role,
    content,
    createdAt: new Date().toISOString(),
    status: "complete",
    actions: [],
  }
}

// The agent also sees its past changes, so follow-ups like "move it back" make sense.
function toAgentHistoryMessage(message: ChatMessage) {
  if (message.actions.length === 0) {
    return { role: message.role, content: message.content }
  }
  const actionList = message.actions.map((action) => action.label).join("; ")
  return {
    role: message.role,
    content: `${message.content}\n\n(Changes made: ${actionList})`,
  }
}

// Text arrives in tiny pieces, so it is saved at most once per frame to avoid constant re-renders.
function createTextBuffer(writeText: (text: string) => void) {
  let pendingText = ""
  let frameId: number | null = null

  function flush() {
    if (frameId !== null) cancelAnimationFrame(frameId)
    frameId = null
    if (!pendingText) return
    writeText(pendingText)
    pendingText = ""
  }

  function add(text: string) {
    pendingText += text
    frameId ??= requestAnimationFrame(flush)
  }

  return { add, flush }
}

// Saves the open chat, only while it still belongs to this deck.
function saveConversation(deckId: string) {
  if (openDeckId() !== deckId) return

  const finishedMessages = useAgentStore.getState().chatMessages.filter((message) => message.status !== "streaming")
  deckRepository
    .saveConversationMessages(deckId, finishedMessages)
    .catch((error) => console.error("Saving the chat failed", error))
}
