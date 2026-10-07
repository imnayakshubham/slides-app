import { useDeckStore } from "@/store/DeckStore"
import { deckAgentOf, useEditorStore, type DeckAgentState } from "@/store/EditorStore"

// Reads the open deck's agent state; callers re-render only when the part they pick changes.
export function useDeckAgent<Selected>(select: (agent: DeckAgentState) => Selected) {
  const deckId = useDeckStore((state) => state.deck?.id)
  return useEditorStore((state) => select(deckAgentOf(state.agentByDeckId, deckId)))
}
