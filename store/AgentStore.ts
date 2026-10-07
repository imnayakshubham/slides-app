import { create } from "zustand"

import type { Outline } from "@/lib/schema/Outline"

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
  // Outline row ids that stay the same when slides are reordered or removed.
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

export type DeckAgent = {
  run: AgentRun | null
  outlineReview: OutlineReview | null
  generation: DeckGeneration | null
  isFollowingGeneration: boolean
}

const IDLE_AGENT: DeckAgent = {
  run: null,
  outlineReview: null,
  generation: null,
  isFollowingGeneration: false,
}

export function agentFor(agents: Record<string, DeckAgent>, deckId: string | undefined): DeckAgent {
  if (!deckId) return IDLE_AGENT
  return agents[deckId] ?? IDLE_AGENT
}

// A label while the agent works on the slide (the slide is locked), else null.
export function agentLabelFor(agent: DeckAgent, slideId: string) {
  const buildStatus = agent.generation?.slides.find((slideBuild) => slideBuild.slideId === slideId)?.status
  if (buildStatus === "filling") return "Writing this slide…"
  if (buildStatus === "waiting") return "Waiting…"
  if (agent.run?.editingSlideIds.includes(slideId)) return "Agent is editing…"
  return null
}

type AgentStore = {
  // Keyed by deck id, so one deck's run can never leak into another.
  agents: Record<string, DeckAgent>
  updateAgent: (deckId: string, changes: Partial<DeckAgent>) => void

  highlightedElementIds: string[]
  highlightElements: (elementIds: string[]) => void
}

export const useAgentStore = create<AgentStore>()((set, get) => ({
  agents: {},
  updateAgent: (deckId, changes) => {
    const { agents } = get()
    const agent = agentFor(agents, deckId)
    set({ agents: { ...agents, [deckId]: { ...agent, ...changes } } })
  },

  highlightedElementIds: [],
  highlightElements: (elementIds) => {
    if (elementIds.length === 0) return
    set({ highlightedElementIds: [...get().highlightedElementIds, ...elementIds] })

    setTimeout(() => {
      const stillHighlighted = get().highlightedElementIds.filter((elementId) => !elementIds.includes(elementId))
      set({ highlightedElementIds: stillHighlighted })
    }, AGENT_HIGHLIGHT_MS)
  },
}))
