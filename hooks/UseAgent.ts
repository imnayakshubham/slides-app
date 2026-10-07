import { useDeckStore } from "@/store/DeckStore"
import { agentFor, useAgentStore, type DeckAgent } from "@/store/AgentStore"

// Reads the open deck's agent state; callers re-render only when the part they pick changes.
export function useAgent<Selected>(select: (agent: DeckAgent) => Selected) {
  const deckId = useDeckStore((state) => state.deck?.id)
  return useAgentStore((state) => select(agentFor(state.agents, deckId)))
}
