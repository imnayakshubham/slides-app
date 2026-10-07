import { create } from "zustand"

import type { TextBoxStyle } from "@/lib/RichText"
import type { ChatMessage } from "@/lib/schema/Conversation"
import type { Outline } from "@/lib/schema/Outline"
import { useDeckStore } from "@/store/DeckStore"

// How long an element stays highlighted after the agent changes it.
const AGENT_HIGHLIGHT_MS = 1500

export type SlideBuildStatus = "waiting" | "filling" | "done" | "failed"

export type SlideBuild = {
  slideId: string
  title: string
  outlineSlideIndex: number
  status: SlideBuildStatus
}

// An outline waiting for approval. slideKeys give each row a stable id
// while it is reordered or removed.
export type OutlineReview = {
  messageId: string
  outline: Outline
  slideKeys: string[]
}

// A deck being generated from an approved outline, shown as a checklist
// under the chat message that proposed it.
export type DeckGeneration = {
  messageId: string
  outline: Outline
  slides: SlideBuild[]
  isStopped: boolean
}

export type AgentRunKind = "chat" | "planning" | "generating"

// One agent run on one deck.
export type AgentRun = {
  runId: string
  kind: AgentRunKind
  // Slides changed during this run; they shimmer until it ends.
  editingSlideIds: string[]
}

// Everything the agent has going on for one deck.
export type DeckAgentState = {
  run: AgentRun | null
  // An outline waiting for the user to edit and approve it.
  outlineReview: OutlineReview | null
  generation: DeckGeneration | null
  // The canvas follows the slide being written until the user takes over.
  isFollowingGeneration: boolean
}

const NO_AGENT_ACTIVITY: DeckAgentState = {
  run: null,
  outlineReview: null,
  generation: null,
  isFollowingGeneration: false,
}

// The agent state of one deck (nothing going on when it has none yet).
export function deckAgentOf(
  agentByDeckId: Record<string, DeckAgentState>,
  deckId: string | undefined
): DeckAgentState {
  if (!deckId) return NO_AGENT_ACTIVITY
  return agentByDeckId[deckId] ?? NO_AGENT_ACTIVITY
}

// What the agent is doing on one slide, as a short label, or null when it
// isn't working on it. A slide with a label is locked for the user.
export function agentActivityOnSlide(agent: DeckAgentState, slideId: string) {
  const buildStatus = agent.generation?.slides.find(
    (slideBuild) => slideBuild.slideId === slideId
  )?.status
  if (buildStatus === "filling") return "Writing this slide…"
  if (buildStatus === "waiting") return "Waiting…"
  if (agent.run?.editingSlideIds.includes(slideId)) return "Agent is editing…"
  return null
}

// Where an "Add here" menu was opened: on screen (to place the menu) and on
// the slide, in artboard units (where the new element goes).
export type AddHereMenu = {
  screenPoint: { x: number; y: number }
  slidePoint: { x: number; y: number }
}

type EditorStore = {
  currentSlideId: string | null
  selectedElementIds: string[]
  goToSlide: (slideId: string) => void
  setSelectedElementIds: (elementIds: string[]) => void
  // The text element being typed into on the canvas, if any.
  editingElementId: string | null
  setEditingElementId: (elementId: string | null) => void
  // Style of the words highlighted in that text, or null when nothing is
  // highlighted (then toolbar settings apply to the whole box).
  highlightedTextStyle: TextBoxStyle | null
  setHighlightedTextStyle: (style: TextBoxStyle | null) => void
  // Opened by clicking an empty spot on the current slide.
  addHereMenu: AddHereMenu | null
  setAddHereMenu: (menu: AddHereMenu | null) => void

  chatMessages: ChatMessage[]
  loadChatMessages: (messages: ChatMessage[]) => void
  addChatMessage: (message: ChatMessage) => void
  updateChatMessage: (
    messageId: string,
    update: (message: ChatMessage) => ChatMessage
  ) => void
  removeChatMessage: (messageId: string) => void

  // Keyed by deck id, so a run, its statuses and its outline belong to
  // exactly one deck and can never leak into another.
  agentByDeckId: Record<string, DeckAgentState>
  updateDeckAgent: (
    deckId: string,
    update: (agent: DeckAgentState) => Partial<DeckAgentState>
  ) => void
  agentTouchedElementIds: string[]
  highlightAgentTouchedElements: (elementIds: string[]) => void
}

export const useEditorStore = create<EditorStore>()((set) => ({
  currentSlideId: null,
  selectedElementIds: [],

  goToSlide: (slideId) =>
    set({
      currentSlideId: slideId,
      selectedElementIds: [],
      editingElementId: null,
      highlightedTextStyle: null,
      addHereMenu: null,
    }),

  setSelectedElementIds: (elementIds) =>
    set({ selectedElementIds: elementIds }),

  editingElementId: null,
  setEditingElementId: (elementId) =>
    set({ editingElementId: elementId, highlightedTextStyle: null }),

  highlightedTextStyle: null,
  setHighlightedTextStyle: (style) => set({ highlightedTextStyle: style }),

  addHereMenu: null,
  setAddHereMenu: (menu) => set({ addHereMenu: menu }),

  chatMessages: [],

  loadChatMessages: (messages) => set({ chatMessages: messages }),

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

  agentByDeckId: {},
  updateDeckAgent: (deckId, update) =>
    set((state) => {
      const agent = deckAgentOf(state.agentByDeckId, deckId)
      return {
        agentByDeckId: {
          ...state.agentByDeckId,
          [deckId]: { ...agent, ...update(agent) },
        },
      }
    }),

  agentTouchedElementIds: [],
  highlightAgentTouchedElements: (elementIds) => {
    if (elementIds.length === 0) return
    set((state) => ({
      agentTouchedElementIds: [...state.agentTouchedElementIds, ...elementIds],
    }))
    setTimeout(() => {
      set((state) => ({
        agentTouchedElementIds: state.agentTouchedElementIds.filter(
          (elementId) => !elementIds.includes(elementId)
        ),
      }))
    }, AGENT_HIGHLIGHT_MS)
  },
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
