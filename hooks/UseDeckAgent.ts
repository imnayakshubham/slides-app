import { useDeckStore } from "@/store/DeckStore"
import { deckAgentOf, useEditorStore, type DeckAgentState } from "@/store/EditorStore"

// Reads the agent state of the open deck. Components re-render only when
// the part they select changes.
export function useDeckAgent<Selected>(select: (agent: DeckAgentState) => Selected) {
  const deckId = useDeckStore((state) => state.deck?.id)
  return useEditorStore((state) => select(deckAgentOf(state.agentByDeckId, deckId)))
}
