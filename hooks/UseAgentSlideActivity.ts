import { useDeckAgent } from "@/hooks/UseDeckAgent"

// What the agent is doing on this slide of the open deck right now, as a
// short label, or null when it isn't working on it.
export function useAgentSlideActivity(slideId: string) {
  return useDeckAgent((agent) => {
    const buildStatus = agent.generation?.slides.find(
      (slideBuild) => slideBuild.slideId === slideId
    )?.status
    if (buildStatus === "filling") return "Writing this slide…"
    if (buildStatus === "waiting") return "Waiting…"
    if (agent.run?.editingSlideIds.includes(slideId)) {
      return "Agent is editing…"
    }
    return null
  })
}
