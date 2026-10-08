import { useDeckStore } from "@/store/DeckStore"
import { agentFor, useAgentStore } from "@/store/AgentStore"

export function useOpenDeckAgent() {
  const openDeckId = useDeckStore((state) => state.deck?.id)
  return useAgentStore((state) => agentFor(state.agents, openDeckId))
}
