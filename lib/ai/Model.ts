import "server-only"

import { createOpenAICompatible } from "@ai-sdk/openai-compatible"

// AI_BASE_URL can point at any OpenAI-compatible API with tool calling (Groq by default).
const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1"
const DEFAULT_MODEL = "openai/gpt-oss-120b"

export function getChatModel() {
  const apiKey = process.env.AI_API_KEY
  if (!apiKey) return null
  const provider = createOpenAICompatible({
    name: "chat-provider",
    baseURL: process.env.AI_BASE_URL ?? DEFAULT_BASE_URL,
    apiKey,
  })
  return provider.chatModel(process.env.AI_MODEL ?? DEFAULT_MODEL)
}
