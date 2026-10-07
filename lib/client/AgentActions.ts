import { arrayMove } from "@dnd-kit/sortable"

import { readServerStream } from "@/lib/client/ReadServerStream"
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
import { agentActivityOnSlide, deckAgentOf, useEditorStore } from "@/store/EditorStore"
import type { AgentRunKind, DeckAgentState, SlideBuild, SlideBuildStatus } from "@/store/EditorStore"

// Everything the agent does from the browser: chat edits, planning a deck,
// building it slide by slide, retrying a slide and continuing after Stop.
// Each action belongs to the deck that was open when it started (its id is
// captured up front) and only ever changes that deck's agent state. All of
// it goes through runAgentWork (one run per deck, one undo step) and
// streamRequest (one streamed API call into a chat message).

const CONNECTION_ERROR_MESSAGE = "Couldn't reach the agent. Check your connection and try again."
const NO_OUTLINE_MESSAGE = "The agent didn't return an outline. Please try again."

// Running requests by run id, so Stop aborts exactly the right one.
const abortControllersByRunId = new Map<string, AbortController>()

function openDeckId() {
  return useDeckStore.getState().deck?.id
}

function deckAgent(deckId: string) {
  return deckAgentOf(useEditorStore.getState().agentByDeckId, deckId)
}

function updateDeckAgent(deckId: string, update: (agent: DeckAgentState) => Partial<DeckAgentState>) {
  useEditorStore.getState().updateDeckAgent(deckId, update)
}

// True while the agent is changing this slide of the open deck (or has
// yet to write it). The user can't edit a locked slide.
export function isSlideLockedByAgent(slideId: string) {
  const deckId = openDeckId()
  if (!deckId) return false
  return agentActivityOnSlide(deckAgent(deckId), slideId) !== null
}

// Called just before the agent starts on these slides: finishes (and so
// saves) any typing on them and drops their elements from the selection,
// so the user's work can't collide with the agent's.
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
  return Boolean(deckId && deckAgent(deckId).run)
}

// Stop button: stops the open deck's run.
export function stopAgent() {
  const deckId = openDeckId()
  const runId = deckId ? deckAgent(deckId).run?.runId : undefined
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
  const { chatMessages, addChatMessage } = useEditorStore.getState()
  addChatMessage(createMessage("user", text))
  saveConversation(deckId)
  await respondTo(deckId, text, chatMessages)
}

export async function retryLastAgentMessage() {
  const deckId = openDeckId()
  if (!deckId || isAgentBusyOn(deckId)) return
  const { chatMessages, removeChatMessage } = useEditorStore.getState()

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
      updateMessage(messageId, (message) => ({
        ...message,
        content: `Here's an outline for “${outline.title}”, ${outline.slides.length} slides. Edit, reorder or remove slides, then generate.`,
      }))
      updateDeckAgent(deckId, () => ({
        outlineReview: {
          messageId,
          outline,
          slideKeys: outline.slides.map(() => createId()),
        },
      }))
    }
    const missingOutline = !outline && !errorMessage && !abortSignal.aborted ? NO_OUTLINE_MESSAGE : undefined
    finishAssistantMessage(messageId, errorMessage ?? missingOutline, abortSignal.aborted)
  })
}

// Edits to the open deck's outline before it is approved. Each keeps the
// row keys in the same order as the slides.
function updateOutlineReview(
  update: (
    slides: OutlineSlide[],
    slideKeys: string[]
  ) => {
    slides: OutlineSlide[]
    slideKeys: string[]
  }
) {
  const deckId = openDeckId()
  if (!deckId) return
  updateDeckAgent(deckId, ({ outlineReview }) => {
    if (!outlineReview) return {}
    const { slides, slideKeys } = update(outlineReview.outline.slides, outlineReview.slideKeys)
    return {
      outlineReview: {
        ...outlineReview,
        outline: { ...outlineReview.outline, slides },
        slideKeys,
      },
    }
  })
}

export function renameOutlineSlide(slideIndex: number, title: string) {
  updateOutlineReview((slides, slideKeys) => ({
    slides: slides.map((slide, index) => (index === slideIndex ? { ...slide, title } : slide)),
    slideKeys,
  }))
}

export function moveOutlineSlide(fromIndex: number, toIndex: number) {
  updateOutlineReview((slides, slideKeys) => ({
    slides: arrayMove(slides, fromIndex, toIndex),
    slideKeys: arrayMove(slideKeys, fromIndex, toIndex),
  }))
}

export function removeOutlineSlide(slideIndex: number) {
  updateOutlineReview((slides, slideKeys) => ({
    slides: slides.filter((_, index) => index !== slideIndex),
    slideKeys: slideKeys.filter((_, index) => index !== slideIndex),
  }))
}

export function discardOutline() {
  const deckId = openDeckId()
  if (!deckId) return
  const outlineReview = deckAgent(deckId).outlineReview
  if (!outlineReview) return
  updateDeckAgent(deckId, () => ({ outlineReview: null }))
  updateMessage(outlineReview.messageId, (message) => ({
    ...message,
    content: "Outline discarded.",
  }))
  saveConversation(deckId)
}

// Phase two: every planned slide is added at once (with its title), then
// filled one by one. The whole build is one undo step.
export async function generateApprovedOutline() {
  const deck = useDeckStore.getState().deck
  if (!deck || isAgentBusyOn(deck.id)) return
  const deckId = deck.id
  const outlineReview = deckAgent(deckId).outlineReview
  if (!outlineReview) return
  const { messageId, outline } = outlineReview
  updateDeckAgent(deckId, () => ({ outlineReview: null }))

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
    updateDeckAgent(deckId, () => ({
      generation: {
        messageId,
        outline,
        slides: slideBuilds,
        isStopped: false,
      },
      isFollowingGeneration: true,
    }))
    await fillSlides(deckId, slideBuilds, abortSignal)
  })
}

export async function retrySlideBuild(slideId: string) {
  const deckId = openDeckId()
  if (!deckId || isAgentBusyOn(deckId)) return
  const slideBuild = deckAgent(deckId).generation?.slides.find((build) => build.slideId === slideId)
  if (!slideBuild) return
  await runAgentWork(deckId, "generating", (abortSignal) => fillSlides(deckId, [slideBuild], abortSignal))
}

export async function continueStoppedGeneration() {
  const deckId = openDeckId()
  if (!deckId || isAgentBusyOn(deckId)) return
  const generation = deckAgent(deckId).generation
  if (!generation) return
  const waitingBuilds = generation.slides.filter((build) => build.status === "waiting")
  updateDeckAgent(deckId, () => ({ isFollowingGeneration: true }))
  await runAgentWork(deckId, "generating", (abortSignal) => fillSlides(deckId, waitingBuilds, abortSignal))
}

function setSlideBuildStatus(deckId: string, slideId: string, status: SlideBuildStatus) {
  updateDeckAgent(deckId, ({ generation }) => {
    if (!generation) return {}
    return {
      generation: {
        ...generation,
        slides: generation.slides.map((build) => (build.slideId === slideId ? { ...build, status } : build)),
      },
    }
  })
}

function setGenerationStopped(deckId: string, isStopped: boolean) {
  updateDeckAgent(deckId, ({ generation }) => (generation ? { generation: { ...generation, isStopped } } : {}))
}

async function fillSlides(deckId: string, slideBuilds: SlideBuild[], abortSignal: AbortSignal) {
  const generation = deckAgent(deckId).generation
  if (!generation) return
  setGenerationStopped(deckId, false)

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
    if (deckAgent(deckId).isFollowingGeneration) {
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
    // No edit means every attempt to write the slide was rejected.
    const isFilled = !errorMessage && appliedEditCount > 0
    setSlideBuildStatus(deckId, slideBuild.slideId, isFilled ? "done" : "failed")
  }

  if (abortSignal.aborted) setGenerationStopped(deckId, true)
  updateDeckAgent(deckId, () => ({ isFollowingGeneration: false }))
}

// One run per deck at a time. Everything it changes is one undo step, and
// the deck is saved once it ends (see useAutosave). Its cleanup only
// touches its own run: a run that was stopped when the user left this deck
// can't end a newer run, or close another deck's undo step.
async function runAgentWork(deckId: string, kind: AgentRunKind, work: (abortSignal: AbortSignal) => Promise<void>) {
  const runId = createId()
  const abortController = new AbortController()
  abortControllersByRunId.set(runId, abortController)
  updateDeckAgent(deckId, () => ({
    run: { runId, kind, editingSlideIds: [] },
  }))
  useDeckStore.getState().beginGroup()
  try {
    await work(abortController.signal)
  } finally {
    abortControllersByRunId.delete(runId)
    const isStillThisRun = deckAgent(deckId).run?.runId === runId
    if (isStillThisRun) updateDeckAgent(deckId, () => ({ run: null }))
    if (isStillThisRun && openDeckId() === deckId) {
      useDeckStore.getState().endGroup()
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
  // A chat reply shows the agent's text, lists its changes and marks the
  // slides it edits. Planning and generation show their own progress.
  isChatReply: boolean
}

// Streams one API call: deck edits are applied as they arrive, and the
// reply text goes into the chat message.
async function streamRequest(request: StreamRequest) {
  const { deckId, messageId, url, body, abortSignal, isChatReply } = request
  let errorMessage: string | undefined
  let outline: Outline | undefined
  let appliedEditCount = 0
  const textBuffer = createTextBuffer((text) =>
    updateMessage(messageId, (message) => ({
      ...message,
      content: message.content + text,
    }))
  )

  function addAction(label: string, failed: boolean) {
    if (!isChatReply) return
    updateMessage(messageId, (message) => ({
      ...message,
      actions: [...message.actions, { label, failed }],
    }))
  }

  function handleStreamEvent(streamEvent: StreamEvent) {
    if (streamEvent.event === "text_delta" && isChatReply) {
      textBuffer.add(streamEvent.data.text)
    }
    // The user may have opened another deck: never apply this deck's edits
    // to it.
    if (streamEvent.event === "edit" && openDeckId() === deckId) {
      const { edit, label } = streamEvent.data
      const deckBeforeEdit = useDeckStore.getState().deck
      // Lock the slides first, so the user's unsaved typing is saved before
      // the agent's change lands on top of it.
      if (isChatReply && deckBeforeEdit) {
        markSlidesBeingEdited(deckId, slideIdsChangedBy(edit, deckBeforeEdit))
      }
      // Fails when the target was deleted meanwhile.
      const result = useDeckStore.getState().applyEdit(edit)
      if (result.ok) {
        appliedEditCount += 1
        addAction(label, false)
        useEditorStore.getState().highlightAgentTouchedElements(elementIdsChangedBy(edit))
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
  } catch {
    if (!abortSignal.aborted) errorMessage = CONNECTION_ERROR_MESSAGE
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
  const run = deckAgent(deckId).run
  if (!run) return
  const newSlideIds = slideIds.filter((slideId) => !run.editingSlideIds.includes(slideId))
  // Most edits touch a slide that is already marked: no update then.
  if (newSlideIds.length === 0) return
  releaseSlidesToAgent(newSlideIds)
  updateDeckAgent(deckId, () => ({
    run: { ...run, editingSlideIds: [...run.editingSlideIds, ...newSlideIds] },
  }))
}

// Read from the deck before the edit, so a moved element marks both the
// slide it left and the slide it landed on.
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
  useEditorStore.getState().addChatMessage(message)
  return message.id
}

function finishAssistantMessage(messageId: string, errorMessage: string | undefined, wasStopped: boolean) {
  updateMessage(messageId, (message) => {
    if (errorMessage) return { ...message, status: "error", errorMessage }
    const isEmpty = !message.content && message.actions.length === 0
    if (wasStopped && isEmpty) {
      return { ...message, status: "complete", content: "Stopped." }
    }
    return { ...message, status: "complete" }
  })
}

function updateMessage(messageId: string, update: (message: ChatMessage) => ChatMessage) {
  useEditorStore.getState().updateChatMessage(messageId, update)
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

// The agent also sees what it changed before, so follow-ups like
// "move it back" make sense to it.
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

// Text arrives in many tiny pieces; writing them to the store at most once
// per frame keeps streaming from re-rendering the chat for every piece.
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

  const finishedMessages = useEditorStore.getState().chatMessages.filter((message) => message.status !== "streaming")
  deckRepository
    .saveConversationMessages(deckId, finishedMessages)
    .catch((error) => console.error("Saving the chat failed", error))
}
