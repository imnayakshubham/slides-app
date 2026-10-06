import "server-only"

import { createGroq } from "@ai-sdk/groq"

const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b"

const groqApiKey = process.env.GROQ_API_KEY

if (!groqApiKey) {
  throw new Error(
    "GROQ_API_KEY is not set. Add it to .env.local (see .env.example)."
  )
}

const groq = createGroq({ apiKey: groqApiKey })

export const groqModel = groq(process.env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL)
