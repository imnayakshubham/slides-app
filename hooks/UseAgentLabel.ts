import { useAgent } from "@/hooks/UseAgent"
import { agentLabelFor } from "@/store/AgentStore"

// What the agent is doing on this slide, or null; the slide is locked for the user while it works.
export function useAgentLabel(slideId: string | null) {
  return useAgent((agent) => (slideId ? agentLabelFor(agent, slideId) : null))
}
