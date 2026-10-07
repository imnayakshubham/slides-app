import { useEditorStore } from "@/store/EditorStore"

// What the agent is doing on this slide right now, as a short label, or
// null when it isn't working on it.
export function useAgentSlideActivity(slideId: string) {
  return useEditorStore((state) => {
    const buildStatus = state.deckGeneration?.slides.find(
      (slideBuild) => slideBuild.slideId === slideId
    )?.status
    if (buildStatus === "filling") return "Writing this slide…"
    if (buildStatus === "waiting") return "Waiting…"
    if (state.agentEditingSlideIds.includes(slideId)) {
      return "Agent is editing…"
    }
    return null
  })
}
