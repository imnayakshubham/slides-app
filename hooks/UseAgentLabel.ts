import { useOpenDeckAgent } from "@/hooks/UseOpenDeckAgent"
import { agentLabelFor } from "@/store/AgentStore"

export function useAgentLabel(slideId: string | null) {
  const agent = useOpenDeckAgent()
  if (!slideId) return null
  return agentLabelFor(agent, slideId)
}
