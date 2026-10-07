import { useEffect } from "react"

import {
  retryLastAgentMessage,
  sendAgentMessage,
  stopAgent,
} from "@/lib/client/AgentActions"

// The chat panel's view of the agent. The work itself lives in AgentActions;
// this only stops a running agent when the editor closes.
export function useAgentChat() {
  useEffect(() => stopAgent, [])

  return {
    sendMessage: sendAgentMessage,
    retry: retryLastAgentMessage,
    stop: stopAgent,
  }
}
