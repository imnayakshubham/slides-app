import "server-only"

import { createOpenAICompatible } from "@ai-sdk/openai-compatible"


export function getChatModel() {
  const apiKey = process.env.AI_API_KEY
  if (!apiKey) return null
  const provider = createOpenAICompatible({
    name: "chat-provider",
    baseURL: process.env.AI_BASE_URL!,
    apiKey,
  })
  return provider.chatModel(process.env.AI_MODEL!)
}
