import { useDeckAgent } from "@/hooks/UseDeckAgent"
import { agentActivityOnSlide } from "@/store/EditorStore"

// What the agent is doing on this slide, or null; the slide is locked for the user while it works.
export function useAgentSlideActivity(slideId: string | null) {
  return useDeckAgent((agent) => (slideId ? agentActivityOnSlide(agent, slideId) : null))
}
