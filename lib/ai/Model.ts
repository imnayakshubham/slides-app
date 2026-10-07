import "server-only"

import { createGroq } from "@ai-sdk/groq"

const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b"

// Read per request, not at import, so a missing key fails the request with
// a clear message instead of failing the build.
export function getGroqModel() {
  const groqApiKey = process.env.GROQ_API_KEY
  if (!groqApiKey) return null
  const groq = createGroq({ apiKey: groqApiKey })
  return groq(process.env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL)
}
