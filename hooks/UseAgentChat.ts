import { useEffect } from "react"

import {
  retryLastAgentMessage,
  sendAgentMessage,
  stopAgent,
  stopAllAgentRuns,
} from "@/lib/client/AgentActions"

// The chat panel's view of the agent. The work itself lives in AgentActions;
// this only stops running agents when the editor closes.
export function useAgentChat() {
  useEffect(() => stopAllAgentRuns, [])

  return {
    sendMessage: sendAgentMessage,
    retry: retryLastAgentMessage,
    stop: stopAgent,
  }
}
