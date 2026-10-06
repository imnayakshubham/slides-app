import { create } from "zustand"

import type { ChatMessage } from "@/lib/schema/Conversation"
import { useDeckStore } from "@/store/DeckStore"

type EditorStore = {
  currentSlideId: string | null
  selectedElementIds: string[]
  goToSlide: (slideId: string) => void
  setSelectedElementIds: (elementIds: string[]) => void
  // The text element being typed into on the canvas, if any.
  editingElementId: string | null
  setEditingElementId: (elementId: string | null) => void

  chatMessages: ChatMessage[]
  isAgentRunning: boolean
  loadChatMessages: (messages: ChatMessage[]) => void
  addChatMessage: (message: ChatMessage) => void
  updateChatMessage: (
    messageId: string,
    update: (message: ChatMessage) => ChatMessage
  ) => void
  removeChatMessage: (messageId: string) => void
  setIsAgentRunning: (isAgentRunning: boolean) => void
}

export const useEditorStore = create<EditorStore>()((set) => ({
  currentSlideId: null,
  selectedElementIds: [],

  goToSlide: (slideId) =>
    set({
      currentSlideId: slideId,
      selectedElementIds: [],
      editingElementId: null,
    }),

  setSelectedElementIds: (elementIds) =>
    set({ selectedElementIds: elementIds }),

  editingElementId: null,
  setEditingElementId: (elementId) => set({ editingElementId: elementId }),

  chatMessages: [],
  isAgentRunning: false,

  loadChatMessages: (messages) =>
    set({ chatMessages: messages, isAgentRunning: false }),

  addChatMessage: (message) =>
    set((state) => ({ chatMessages: [...state.chatMessages, message] })),

  // Other messages keep their object identity, so only the changed one re-renders.
  updateChatMessage: (messageId, update) =>
    set((state) => ({
      chatMessages: state.chatMessages.map((message) =>
        message.id === messageId ? update(message) : message
      ),
    })),

  removeChatMessage: (messageId) =>
    set((state) => ({
      chatMessages: state.chatMessages.filter(
        (message) => message.id !== messageId
      ),
    })),

  setIsAgentRunning: (isAgentRunning) => set({ isAgentRunning }),
}))

// Keep the editor pointing at things that still exist after any deck change
// (hydrate, delete, undo, AI edits).
useDeckStore.subscribe((deckState, previousDeckState) => {
  const slides = deckState.deck?.slides ?? []
  const { currentSlideId, selectedElementIds } = useEditorStore.getState()
  const currentSlide = slides.find((slide) => slide.id === currentSlideId)

  if (!currentSlide) {
    const previousSlideIndex =
      previousDeckState.deck?.slides.findIndex(
        (slide) => slide.id === currentSlideId
      ) ?? -1
    const nearestSlide =
      slides[Math.min(Math.max(previousSlideIndex, 0), slides.length - 1)]
    useEditorStore.setState({
      currentSlideId: nearestSlide?.id ?? null,
      selectedElementIds: [],
    })
    return
  }

  const stillExistingSelection = selectedElementIds.filter((elementId) =>
    currentSlide.elements.some((element) => element.id === elementId)
  )
  if (stillExistingSelection.length !== selectedElementIds.length) {
    useEditorStore.setState({ selectedElementIds: stillExistingSelection })
  }
})
