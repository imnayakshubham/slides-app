import type { StreamEvent } from "@/lib/StreamEvents"

const EVENT_PREFIX = "data: "

// EventSource can't send a POST body, so the stream is read by hand.
export async function readServerStream(
  url: string,
  body: unknown,
  onEvent: (streamEvent: StreamEvent) => void,
  signal?: AbortSignal
) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok || !response.body) {
    // The API routes answer a bad request with { error: "..." }.
    const errorBody = await response.json().catch(() => null)
    const message = typeof errorBody?.error === "string" ? errorBody.error : "Something went wrong"
    onEvent({ event: "error", data: { message } })
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let unfinishedText = ""

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    unfinishedText += decoder.decode(value, { stream: true })
    const events = unfinishedText.split("\n\n")
    unfinishedText = events.pop() ?? ""

    for (const eventText of events) {
      if (eventText.startsWith(EVENT_PREFIX)) {
        onEvent(JSON.parse(eventText.slice(EVENT_PREFIX.length)))
      }
    }
  }
}
