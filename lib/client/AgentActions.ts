import { arrayMove } from "@dnd-kit/sortable"

import { readServerStream } from "@/lib/client/ReadServerStream"
import { findElementLocation, type DeckEdit } from "@/lib/edits/DeckEdits"
import { createId } from "@/lib/Ids"
import { createSlide } from "@/lib/layouts/SlideLayouts"
import { deckRepository } from "@/lib/repository"
import type { ChatMessage } from "@/lib/schema/Conversation"
import type { Deck } from "@/lib/schema/Deck"
import type { Outline, OutlineSlide } from "@/lib/schema/Outline"
import type { StreamEvent } from "@/lib/StreamEvents"
import { useDeckStore } from "@/store/DeckStore"
import { useEditorStore, type SlideBuild } from "@/store/EditorStore"

// Everything the agent does from the browser: chat edits, planning a deck,
// building it slide by slide, retrying a slide and continuing after Stop.
// All of it goes through runAgentWork (one run at a time, one undo step)
// and streamRequest (one streamed API call into a chat message).

const CONNECTION_ERROR_MESSAGE =
  "Couldn't reach the agent. Check your connection and try again."
const NO_OUTLINE_MESSAGE =
  "The agent didn't return an outline. Please try again."

let activeAbortController: AbortController | null = null

export function stopAgent() {
  activeAbortController?.abort()
}

export function isAgentBusy() {
  return useEditorStore.getState().isAgentRunning
}

// A new message on an empty deck plans a deck; otherwise it edits the deck.
export async function sendAgentMessage(text: string) {
  if (isAgentBusy()) return
  const { chatMessages, addChatMessage } = useEditorStore.getState()
  addChatMessage(createMessage("user", text))
  saveConversation()
  await respondTo(text, chatMessages)
}

export async function retryLastAgentMessage() {
  if (isAgentBusy()) return
  const { chatMessages, removeChatMessage } = useEditorStore.getState()

  const lastMessage = chatMessages.at(-1)
  if (lastMessage?.status === "error") removeChatMessage(lastMessage.id)

  const lastUserMessageIndex = chatMessages.findLastIndex(
    (message) => message.role === "user"
  )
  if (lastUserMessageIndex === -1) return
  await respondTo(
    chatMessages[lastUserMessageIndex].content,
    chatMessages.slice(0, lastUserMessageIndex)
  )
}

async function respondTo(text: string, earlierMessages: ChatMessage[]) {
  const deck = useDeckStore.getState().deck
  if (!deck) return
  if (deck.slides.length === 0) {
    await planDeck(text)
  } else {
    await runChatTurn(text, earlierMessages)
  }
}

async function runChatTurn(
  userMessage: string,
  earlierMessages: ChatMessage[]
) {
  await runAgentWork(async (abortSignal) => {
    const { currentSlideId, selectedElementIds } = useEditorStore.getState()
    const messageId = startAssistantMessage()
    const { errorMessage } = await streamRequest({
      messageId,
      url: "/api/chat",
      body: {
        deck: useDeckStore.getState().deck,
        messages: earlierMessages
          .filter((message) => message.status === "complete")
          .map(toAgentHistoryMessage),
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
async function planDeck(prompt: string) {
  await runAgentWork(async (abortSignal) => {
    const messageId = startAssistantMessage()
    const { errorMessage, outline } = await streamRequest({
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
      useEditorStore.getState().setOutlineReview({
        messageId,
        outline,
        slideKeys: outline.slides.map(() => createId()),
      })
    }
    const missingOutline =
      !outline && !errorMessage && !abortSignal.aborted
        ? NO_OUTLINE_MESSAGE
        : undefined
    finishAssistantMessage(
      messageId,
      errorMessage ?? missingOutline,
      abortSignal.aborted
    )
  })
}

// Edits to the outline before it is approved. Each keeps the row keys in
// the same order as the slides.
function updateOutlineReview(
  update: (
    slides: OutlineSlide[],
    slideKeys: string[]
  ) => {
    slides: OutlineSlide[]
    slideKeys: string[]
  }
) {
  const { outlineReview, setOutlineReview } = useEditorStore.getState()
  if (!outlineReview) return
  const { slides, slideKeys } = update(
    outlineReview.outline.slides,
    outlineReview.slideKeys
  )
  setOutlineReview({
    ...outlineReview,
    outline: { ...outlineReview.outline, slides },
    slideKeys,
  })
}

export function renameOutlineSlide(slideIndex: number, title: string) {
  updateOutlineReview((slides, slideKeys) => ({
    slides: slides.map((slide, index) =>
      index === slideIndex ? { ...slide, title } : slide
    ),
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
  const { outlineReview, setOutlineReview } = useEditorStore.getState()
  if (!outlineReview) return
  setOutlineReview(null)
  updateMessage(outlineReview.messageId, (message) => ({
    ...message,
    content: "Outline discarded.",
  }))
  saveConversation()
}

// Phase two: every planned slide is added at once (with its title), then
// filled one by one. The whole build is one undo step.
export async function generateApprovedOutline() {
  const { outlineReview, setOutlineReview } = useEditorStore.getState()
  const deck = useDeckStore.getState().deck
  if (!outlineReview || !deck || isAgentBusy()) return
  const { messageId, outline } = outlineReview
  setOutlineReview(null)

  await runAgentWork(async (abortSignal) => {
    const plannedSlides = outline.slides.map((outlineSlide) =>
      createSlide(outlineSlide.layout, outlineSlide.title, deck.theme)
    )
    const edits: DeckEdit[] = [
      { type: "updateDeck", changes: { title: outline.title } },
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
    const editor = useEditorStore.getState()
    editor.setDeckGeneration({
      messageId,
      outline,
      slides: slideBuilds,
      isStopped: false,
    })
    editor.setIsFollowingGeneration(true)
    await fillSlides(slideBuilds, abortSignal)
  })
}

export async function retrySlideBuild(slideId: string) {
  const slideBuild = useEditorStore
    .getState()
    .deckGeneration?.slides.find((build) => build.slideId === slideId)
  if (!slideBuild || isAgentBusy()) return
  await runAgentWork((abortSignal) => fillSlides([slideBuild], abortSignal))
}

export async function continueStoppedGeneration() {
  const deckGeneration = useEditorStore.getState().deckGeneration
  if (!deckGeneration || isAgentBusy()) return
  const waitingBuilds = deckGeneration.slides.filter(
    (build) => build.status === "waiting"
  )
  useEditorStore.getState().setIsFollowingGeneration(true)
  await runAgentWork((abortSignal) => fillSlides(waitingBuilds, abortSignal))
}

async function fillSlides(slideBuilds: SlideBuild[], abortSignal: AbortSignal) {
  const editor = useEditorStore.getState()
  const deckGeneration = editor.deckGeneration
  if (!deckGeneration) return
  editor.setDeckGeneration({ ...deckGeneration, isStopped: false })

  for (const slideBuild of slideBuilds) {
    if (abortSignal.aborted) break
    const deck = useDeckStore.getState().deck
    // The user may have deleted the slide while earlier ones were filling.
    if (!deck?.slides.some((slide) => slide.id === slideBuild.slideId)) {
      editor.setSlideBuildStatus(slideBuild.slideId, "failed")
      continue
    }

    editor.setSlideBuildStatus(slideBuild.slideId, "filling")
    if (useEditorStore.getState().isFollowingGeneration) {
      editor.goToSlide(slideBuild.slideId)
    }
    const { errorMessage, appliedEditCount } = await streamRequest({
      messageId: deckGeneration.messageId,
      url: "/api/populate",
      body: {
        deck,
        outline: deckGeneration.outline,
        slideId: slideBuild.slideId,
        outlineSlideIndex: slideBuild.outlineSlideIndex,
      },
      abortSignal,
      isChatReply: false,
    })

    if (abortSignal.aborted) {
      editor.setSlideBuildStatus(slideBuild.slideId, "waiting")
      break
    }
    // No edit means every attempt to write the slide was rejected.
    const isFilled = !errorMessage && appliedEditCount > 0
    editor.setSlideBuildStatus(slideBuild.slideId, isFilled ? "done" : "failed")
  }

  const latestGeneration = useEditorStore.getState().deckGeneration
  if (abortSignal.aborted && latestGeneration) {
    editor.setDeckGeneration({ ...latestGeneration, isStopped: true })
  }
  editor.setIsFollowingGeneration(false)
}

// One agent run at a time. Everything it changes is one undo step, and the
// deck is saved once it ends (see useAutosave).
async function runAgentWork(work: (abortSignal: AbortSignal) => Promise<void>) {
  const abortController = new AbortController()
  activeAbortController = abortController
  useEditorStore.getState().setIsAgentRunning(true)
  useDeckStore.getState().beginGroup()
  try {
    await work(abortController.signal)
  } finally {
    if (activeAbortController === abortController) activeAbortController = null
    useDeckStore.getState().endGroup()
    useEditorStore.getState().clearAgentEditingSlides()
    useEditorStore.getState().setIsAgentRunning(false)
    saveConversation()
  }
}

type StreamRequest = {
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
  const { messageId, url, body, abortSignal, isChatReply } = request
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
    if (streamEvent.event === "edit") {
      const { edit, label } = streamEvent.data
      const deckBeforeEdit = useDeckStore.getState().deck
      // Fails when the user changed or deleted the target meanwhile.
      const result = useDeckStore.getState().applyEdit(edit)
      if (result.ok) {
        appliedEditCount += 1
        addAction(label, false)
        const editor = useEditorStore.getState()
        editor.highlightAgentTouchedElements(elementIdsChangedBy(edit))
        if (isChatReply && deckBeforeEdit) {
          editor.addAgentEditingSlides(slideIdsChangedBy(edit, deckBeforeEdit))
        }
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

// Read from the deck before the edit, so a moved element marks both the
// slide it left and the slide it landed on.
function slideIdsChangedBy(edit: DeckEdit, deckBeforeEdit: Deck): string[] {
  const slideOfElement = (elementId: string) =>
    findElementLocation(deckBeforeEdit, elementId)?.slide.id
  switch (edit.type) {
    case "addSlide":
      return [edit.slide.id]
    case "updateSlide":
    case "moveSlide":
      return [edit.slideId]
    case "addElement":
      return [edit.slideId]
    case "updateElement":
    case "deleteElement":
    case "reorderElement":
      return [slideOfElement(edit.elementId)].filter(
        (slideId) => slideId !== undefined
      )
    case "moveElement":
      return [slideOfElement(edit.elementId), edit.toSlideId].filter(
        (slideId) => slideId !== undefined
      )
    case "batch":
      return edit.edits.flatMap((innerEdit) =>
        slideIdsChangedBy(innerEdit, deckBeforeEdit)
      )
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

function finishAssistantMessage(
  messageId: string,
  errorMessage: string | undefined,
  wasStopped: boolean
) {
  updateMessage(messageId, (message) => {
    if (errorMessage) return { ...message, status: "error", errorMessage }
    const isEmpty = !message.content && message.actions.length === 0
    if (wasStopped && isEmpty) {
      return { ...message, status: "complete", content: "Stopped." }
    }
    return { ...message, status: "complete" }
  })
}

function updateMessage(
  messageId: string,
  update: (message: ChatMessage) => ChatMessage
) {
  useEditorStore.getState().updateChatMessage(messageId, update)
}

function createMessage(
  role: ChatMessage["role"],
  content: string
): ChatMessage {
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

function saveConversation() {
  const deckId = useDeckStore.getState().deck?.id
  if (!deckId) return

  const finishedMessages = useEditorStore
    .getState()
    .chatMessages.filter((message) => message.status !== "streaming")
  deckRepository
    .saveConversationMessages(deckId, finishedMessages)
    .catch((error) => console.error("Saving the chat failed", error))
}
