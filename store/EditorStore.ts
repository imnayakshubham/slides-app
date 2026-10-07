import { create } from "zustand"

import type { TextBoxStyle } from "@/lib/RichText"
import type { ChatMessage } from "@/lib/schema/Conversation"
import type { Outline } from "@/lib/schema/Outline"
import { useDeckStore } from "@/store/DeckStore"

const AGENT_HIGHLIGHT_MS = 1500

export type SlideBuildStatus = "waiting" | "filling" | "done" | "failed"

export type SlideBuild = {
  slideId: string
  title: string
  outlineSlideIndex: number
  status: SlideBuildStatus
}

type OutlineReview = {
  messageId: string
  outline: Outline
  // Stable row ids while slides are reordered or removed.
  slideKeys: string[]
}

type DeckGeneration = {
  messageId: string
  outline: Outline
  slides: SlideBuild[]
  isStopped: boolean
}

export type AgentRunKind = "chat" | "planning" | "generating"

type AgentRun = {
  runId: string
  kind: AgentRunKind
  // Locked for the user until the run ends.
  editingSlideIds: string[]
}

export type DeckAgentState = {
  run: AgentRun | null
  outlineReview: OutlineReview | null
  generation: DeckGeneration | null
  isFollowingGeneration: boolean
}

const NO_AGENT_ACTIVITY: DeckAgentState = {
  run: null,
  outlineReview: null,
  generation: null,
  isFollowingGeneration: false,
}

export function deckAgentOf(agentByDeckId: Record<string, DeckAgentState>, deckId: string | undefined): DeckAgentState {
  if (!deckId) return NO_AGENT_ACTIVITY
  return agentByDeckId[deckId] ?? NO_AGENT_ACTIVITY
}

// A label while the agent works on the slide (the slide is locked), else null.
export function agentActivityOnSlide(agent: DeckAgentState, slideId: string) {
  const buildStatus = agent.generation?.slides.find((slideBuild) => slideBuild.slideId === slideId)?.status
  if (buildStatus === "filling") return "Writing this slide…"
  if (buildStatus === "waiting") return "Waiting…"
  if (agent.run?.editingSlideIds.includes(slideId)) return "Agent is editing…"
  return null
}

type Point = { x: number; y: number }

type AddHereMenu = {
  screenPoint: Point
  // In artboard units: where the new element goes.
  slidePoint: Point
}

type EditorStore = {
  currentSlideId: string | null
  selectedElementIds: string[]
  goToSlide: (slideId: string) => void
  setSelectedElementIds: (elementIds: string[]) => void
  editingElementId: string | null
  setEditingElementId: (elementId: string | null) => void
  // Null when no words are highlighted: toolbar settings then style the whole box.
  highlightedTextStyle: TextBoxStyle | null
  setHighlightedTextStyle: (style: TextBoxStyle | null) => void
  addHereMenu: AddHereMenu | null
  setAddHereMenu: (menu: AddHereMenu | null) => void

  chatMessages: ChatMessage[]
  loadChatMessages: (messages: ChatMessage[]) => void
  addChatMessage: (message: ChatMessage) => void
  updateChatMessage: (messageId: string, changes: Partial<ChatMessage>) => void
  removeChatMessage: (messageId: string) => void

  // Keyed by deck id, so one deck's run can never leak into another.
  agentByDeckId: Record<string, DeckAgentState>
  updateDeckAgent: (deckId: string, changes: Partial<DeckAgentState>) => void
  agentTouchedElementIds: string[]
  highlightAgentTouchedElements: (elementIds: string[]) => void
}

export const useEditorStore = create<EditorStore>()((set, get) => ({
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

  setSelectedElementIds: (elementIds) => set({ selectedElementIds: elementIds }),

  editingElementId: null,
  setEditingElementId: (elementId) => set({ editingElementId: elementId, highlightedTextStyle: null }),

  highlightedTextStyle: null,
  setHighlightedTextStyle: (style) => set({ highlightedTextStyle: style }),

  addHereMenu: null,
  setAddHereMenu: (menu) => set({ addHereMenu: menu }),

  chatMessages: [],

  loadChatMessages: (messages) => set({ chatMessages: messages }),

  addChatMessage: (message) => {
    const chatMessages = [...get().chatMessages, message]
    set({ chatMessages })
  },

  updateChatMessage: (messageId, changes) => {
    const chatMessages = get().chatMessages.map((message) => {
      if (message.id !== messageId) return message
      return { ...message, ...changes }
    })
    set({ chatMessages })
  },

  removeChatMessage: (messageId) => {
    const chatMessages = get().chatMessages.filter((message) => message.id !== messageId)
    set({ chatMessages })
  },

  agentByDeckId: {},
  updateDeckAgent: (deckId, changes) => {
    const { agentByDeckId } = get()
    const agent = deckAgentOf(agentByDeckId, deckId)
    set({ agentByDeckId: { ...agentByDeckId, [deckId]: { ...agent, ...changes } } })
  },

  agentTouchedElementIds: [],
  highlightAgentTouchedElements: (elementIds) => {
    if (elementIds.length === 0) return
    set({ agentTouchedElementIds: [...get().agentTouchedElementIds, ...elementIds] })

    setTimeout(() => {
      const stillHighlighted = get().agentTouchedElementIds.filter((elementId) => !elementIds.includes(elementId))
      set({ agentTouchedElementIds: stillHighlighted })
    }, AGENT_HIGHLIGHT_MS)
  },
}))

// After any deck change, keep the current slide and selection pointing at things that still exist.
useDeckStore.subscribe((deckState, previousDeckState) => {
  const slides = deckState.deck?.slides ?? []
  const { currentSlideId, selectedElementIds } = useEditorStore.getState()
  const currentSlide = slides.find((slide) => slide.id === currentSlideId)

  if (!currentSlide) {
    // Open the slide that took the removed one's place.
    const removedIndex = previousDeckState.deck?.slides.findIndex((slide) => slide.id === currentSlideId) ?? 0
    const nearestIndex = Math.min(Math.max(removedIndex, 0), slides.length - 1)
    useEditorStore.setState({ currentSlideId: slides[nearestIndex]?.id ?? null, selectedElementIds: [] })
    return
  }

  const stillExistingSelection = selectedElementIds.filter((elementId) =>
    currentSlide.elements.some((element) => element.id === elementId)
  )
  if (stillExistingSelection.length !== selectedElementIds.length) {
    useEditorStore.setState({ selectedElementIds: stillExistingSelection })
  }
})
