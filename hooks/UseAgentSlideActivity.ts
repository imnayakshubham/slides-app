import { useDeckAgent } from "@/hooks/UseDeckAgent"
import { agentActivityOnSlide } from "@/store/EditorStore"

// What the agent is doing on this slide of the open deck, or null. While
// it returns a label, the slide is locked for the user.
export function useAgentSlideActivity(slideId: string | null) {
  return useDeckAgent((agent) => (slideId ? agentActivityOnSlide(agent, slideId) : null))
}
