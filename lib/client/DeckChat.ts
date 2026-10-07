import { Chat } from "@ai-sdk/react"
import { DefaultChatTransport, isToolUIPart } from "ai"
import { toast } from "sonner"

import type { SlidesMessage } from "@/lib/ai/SlidesMessage"
import {
  applyAgentEdit,
  finishRun,
  getAgent,
  isAgentBusyOn,
  openDeckId,
  startRun,
  stopRun,
  updateAgent,
} from "@/lib/client/AgentRun"
import { messageFromError } from "@/lib/ErrorMessage"
import { createId } from "@/lib/Ids"
import { deckRepository } from "@/lib/repository"
import { useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

// The chat with the agent, one AI SDK Chat per deck. On an empty deck a message plans a deck
// (/api/plan); otherwise it edits the deck (/api/chat).

const MAX_HISTORY_MESSAGES = 12

const chatsByDeckId = new Map<string, Chat<SlidesMessage>>()
// The run each chat's current reply belongs to.
const chatRunIdByDeckId = new Map<string, string>()

// Opens the deck's chat with its saved messages; the editor calls this once the deck has loaded.
export function openDeckChat(deckId: string, savedMessages: SlidesMessage[]) {
  const existingChat = chatsByDeckId.get(deckId)
  if (existingChat) return existingChat
  const chat = createDeckChat(deckId, savedMessages)
  chatsByDeckId.set(deckId, chat)
  return chat
}

export function deckChatFor(deckId: string) {
  const chat = chatsByDeckId.get(deckId)
  if (!chat) throw new Error(`The chat for deck "${deckId}" isn't open.`)
  return chat
}

function createDeckChat(deckId: string, messages: SlidesMessage[]) {
  return new Chat<SlidesMessage>({
    id: deckId,
    messages,
    generateId: createId,
    transport: new DefaultChatTransport<SlidesMessage>({
      prepareSendMessagesRequest: ({ messages: chatMessages }) => requestFor(chatMessages),
    }),
    onData: (dataPart) => {
      if (dataPart.type !== "data-edit") return
      const { edit, label } = dataPart.data
      const wasApplied = applyAgentEdit(deckId, edit, { lockSlides: true })
      if (!wasApplied && openDeckId() === deckId) {
        toast.warning(`Skipped "${label}"`, { description: "That part changed while the agent worked." })
      }
    },
    onError: (error) => {
      toast.error("The agent couldn't reply", { description: messageFromError(error), duration: Infinity })
    },
    onFinish: ({ message, messages: finishedMessages, isAbort, isError }) => {
      finishChatTurn(deckId, message, finishedMessages, isAbort || isError)
    },
  })
}

// The last message is the user's new one; everything before it is history.
function requestFor(messages: SlidesMessage[]) {
  const userMessage = textOf(messages.at(-1))
  const deck = useDeckStore.getState().deck
  if (!deck || deck.slides.length === 0) {
    return { api: "/api/plan", body: { prompt: userMessage } }
  }
  const { currentSlideId, selectedElementIds } = useEditorStore.getState()
  const allHistory = messages
    .slice(0, -1)
    .filter((message) => message.role !== "system")
    .map(toHistoryMessage)
  const history = withoutFailedTurns(allHistory).slice(-MAX_HISTORY_MESSAGES)
  return {
    api: "/api/chat",
    body: { deck, messages: history, currentSlideId, selectedIds: selectedElementIds, userMessage },
  }
}

export async function sendAgentMessage(text: string) {
  const deckId = openDeckId()
  if (!deckId || isAgentBusyOn(deckId)) return
  const isPlanning = useDeckStore.getState().deck?.slides.length === 0
  chatRunIdByDeckId.set(deckId, startRun(deckId, isPlanning ? "planning" : "chat"))
  await deckChatFor(deckId).sendMessage({ text })
}

// Sends the last user message again, replacing a failed or stopped reply.
export async function retryLastAgentMessage() {
  const deckId = openDeckId()
  if (!deckId || isAgentBusyOn(deckId)) return
  const isPlanning = useDeckStore.getState().deck?.slides.length === 0
  chatRunIdByDeckId.set(deckId, startRun(deckId, isPlanning ? "planning" : "chat"))
  await deckChatFor(deckId).regenerate()
}

// Stop button: stops the open deck's reply or its slide generation.
export function stopAgent() {
  const deckId = openDeckId()
  const run = deckId ? getAgent(deckId).run : null
  if (!deckId || !run) return
  if (run.kind === "generating") stopRun(run.runId)
  else void deckChatFor(deckId).stop()
}

// Leaving the editor stops every reply; changes already made stay saved.
export function stopAllChats() {
  for (const chat of chatsByDeckId.values()) void chat.stop()
}

function finishChatTurn(deckId: string, reply: SlidesMessage, messages: SlidesMessage[], didFail: boolean) {
  const runId = chatRunIdByDeckId.get(deckId)
  const wasPlanning = getAgent(deckId).run?.kind === "planning"
  if (runId) finishRun(deckId, runId)
  chatRunIdByDeckId.delete(deckId)

  const outline = outlineIn(reply)
  if (outline) {
    const slideKeys = outline.slides.map(() => createId())
    updateAgent(deckId, { outlineReview: { messageId: reply.id, outline, slideKeys } })
  } else if (wasPlanning && !didFail) {
    toast.error("The agent couldn't plan the deck", {
      description: "It didn't return an outline. Please try again.",
      duration: Infinity,
    })
  }

  deckRepository.saveConversationMessages(deckId, messages).catch((error) => {
    console.error("Saving the chat failed", error)
  })
}

export function textOf(message: SlidesMessage | undefined) {
  if (!message) return ""
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("")
}

export function outlineIn(message: SlidesMessage) {
  const outlinePart = message.parts.find((part) => part.type === "data-outline")
  return outlinePart?.data.outline
}

// The changes a reply made, as the lines shown under it. `failed` marks a step the agent had to retry.
export function changesIn(message: SlidesMessage) {
  const changes: { label: string; failed: boolean }[] = []
  for (const part of message.parts) {
    if (!isToolUIPart(part)) continue
    if (part.state === "output-error") changes.push({ label: "A step failed, so the agent tried again", failed: true })
    if (part.state !== "output-available") continue
    const output = part.output
    if (typeof output !== "object" || output === null || !("ok" in output)) continue
    if (output.ok === false) changes.push({ label: "A step failed, so the agent tried again", failed: true })
    if (output.ok === true && "label" in output && typeof output.label === "string") {
      changes.push({ label: output.label, failed: false })
    }
  }
  return changes
}

// The agent also sees its past changes, so follow-ups like "move it back" make sense.
function toHistoryMessage(message: SlidesMessage) {
  const text = textOf(message)
  const changes = changesIn(message).filter((change) => !change.failed)
  if (changes.length === 0) return { role: message.role, content: text }
  const changeList = changes.map((change) => change.label).join("; ")
  return { role: message.role, content: `${text}\n\n(Changes made: ${changeList})` }
}

type HistoryMessage = ReturnType<typeof toHistoryMessage>

// A failed or stopped reply with no text and no changes is dropped with the message it answered,
// so the agent doesn't see repeated questions or empty replies.
function withoutFailedTurns(history: HistoryMessage[]) {
  const keptMessages: HistoryMessage[] = []
  for (const message of history) {
    const isEmptyReply = message.role === "assistant" && message.content.trim() === ""
    if (!isEmptyReply) {
      keptMessages.push(message)
      continue
    }
    if (keptMessages.at(-1)?.role === "user") keptMessages.pop()
  }
  return keptMessages
}
