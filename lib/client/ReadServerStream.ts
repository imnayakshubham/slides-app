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
    onEvent({
      event: "error",
      data: {
        message: `Request failed with status ${response.status}.`,
        code: "http_error",
      },
    })
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
