import { useEffect } from "react"
import { useChat } from "@ai-sdk/react"

import { stopAllAgentRuns } from "@/lib/client/AgentRun"
import { deckChatFor, retryLastAgentMessage, sendAgentMessage, stopAgent, stopAllChats } from "@/lib/client/DeckChat"
import { useDeckStore } from "@/store/DeckStore"

// Streaming text re-renders the chat at most this often.
const TEXT_THROTTLE_MS = 50

// The editor's chat actions; leaving the editor stops every reply and slide generation.
export function useAgentChat() {
  useEffect(
    () => () => {
      stopAllChats()
      stopAllAgentRuns()
    },
    []
  )

  return { sendMessage: sendAgentMessage, retry: retryLastAgentMessage, stop: stopAgent }
}

// The open deck's chat messages, status and error, from the AI SDK.
export function useDeckChat() {
  const deckId = useDeckStore((state) => state.deck?.id ?? "")
  return useChat({ chat: deckChatFor(deckId), throttle: TEXT_THROTTLE_MS })
}
