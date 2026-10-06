import { useEffect, useRef } from "react"

import { postStream } from "@/lib/client/PostStream"
import { createId } from "@/lib/Ids"
import { deckRepository } from "@/lib/repository"
import type { ChatMessage } from "@/lib/schema/Conversation"
import type { StreamEvent } from "@/lib/StreamEvents"
import { useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

const CONNECTION_ERROR_MESSAGE =
  "Couldn't reach the agent. Check your connection and try again."

export function useAgentChat() {
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => abortControllerRef.current?.abort()
  }, [])

  async function sendMessage(text: string) {
    const { chatMessages, isAgentRunning, addChatMessage } =
      useEditorStore.getState()
    if (isAgentRunning) return

    addChatMessage(createMessage("user", text))
    saveConversation()
    await runAgentTurn(text, chatMessages)
  }

  async function retry() {
    const { chatMessages, isAgentRunning, removeChatMessage } =
      useEditorStore.getState()
    if (isAgentRunning) return

    const lastMessage = chatMessages.at(-1)
    if (lastMessage?.status === "error") removeChatMessage(lastMessage.id)

    const lastUserMessageIndex = chatMessages.findLastIndex(
      (message) => message.role === "user"
    )
    if (lastUserMessageIndex === -1) return

    const lastUserMessage = chatMessages[lastUserMessageIndex]
    const earlierMessages = chatMessages.slice(0, lastUserMessageIndex)
    await runAgentTurn(lastUserMessage.content, earlierMessages)
  }

  function stop() {
    abortControllerRef.current?.abort()
  }

  async function runAgentTurn(
    userMessage: string,
    earlierMessages: ChatMessage[]
  ) {
    const deckStore = useDeckStore.getState()
    const editorStore = useEditorStore.getState()
    const deck = deckStore.deck
    if (!deck) return

    const history = earlierMessages
      .filter((message) => message.status === "complete")
      .map(toAgentHistoryMessage)

    const assistantMessage = createMessage("assistant", "")
    const assistantMessageId = assistantMessage.id
    editorStore.addChatMessage({ ...assistantMessage, status: "streaming" })
    editorStore.setIsAgentRunning(true)
    deckStore.beginGroup()

    const abortController = new AbortController()
    abortControllerRef.current = abortController
    const textBuffer = createTextBuffer((text) =>
      updateAssistantMessage((message) => ({
        ...message,
        content: message.content + text,
      }))
    )
    let errorMessage: string | undefined

    function updateAssistantMessage(
      update: (message: ChatMessage) => ChatMessage
    ) {
      useEditorStore.getState().updateChatMessage(assistantMessageId, update)
    }

    function addAction(label: string, failed: boolean) {
      updateAssistantMessage((message) => ({
        ...message,
        actions: [...message.actions, { label, failed }],
      }))
    }

    function handleStreamEvent(streamEvent: StreamEvent) {
      if (streamEvent.event === "text_delta") {
        textBuffer.add(streamEvent.data.text)
      }
      if (streamEvent.event === "edit") {
        const { edit, label } = streamEvent.data
        // Fails when the user changed or deleted the target during this turn.
        const result = useDeckStore.getState().applyEdit(edit)
        if (result.ok) {
          addAction(label, false)
        } else {
          addAction(
            `Skipped "${label}": it changed while the agent worked`,
            true
          )
        }
      }
      if (streamEvent.event === "tool_error") {
        addAction("A step failed, so the agent tried again", true)
      }
      if (streamEvent.event === "error") {
        errorMessage = streamEvent.data.message
      }
    }

    try {
      await postStream(
        "/api/chat",
        {
          deck,
          messages: history,
          currentSlideId: editorStore.currentSlideId,
          selectedIds: editorStore.selectedElementIds,
          userMessage,
        },
        handleStreamEvent,
        abortController.signal
      )
    } catch {
      if (!abortController.signal.aborted) {
        errorMessage = CONNECTION_ERROR_MESSAGE
      }
    }

    textBuffer.flush()
    updateAssistantMessage((message) => {
      if (errorMessage) return { ...message, status: "error", errorMessage }

      const isEmpty = !message.content && message.actions.length === 0
      if (abortController.signal.aborted && isEmpty) {
        return { ...message, status: "complete", content: "Stopped." }
      }
      return { ...message, status: "complete" }
    })

    abortControllerRef.current = null
    useDeckStore.getState().endGroup()
    useEditorStore.getState().setIsAgentRunning(false)
    saveConversation()
  }

  return { sendMessage, retry, stop }
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
