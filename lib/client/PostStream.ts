import type { StreamEvent } from "@/lib/StreamEvents"

// EventSource cannot POST, so the SSE body is read from fetch directly.
// Aborting `signal` (Stop button) rejects with an AbortError.
export async function postStream(
  url: string,
  body: unknown,
  onEvent: (event: StreamEvent) => void,
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

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let unparsedText = ""
  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    unparsedText += value
    const completeMessages = unparsedText.split("\n\n")
    unparsedText = completeMessages.pop() ?? ""
    for (const message of completeMessages) {
      const streamEvent = parseEventMessage(message)
      if (streamEvent) onEvent(streamEvent)
    }
  }
}

function parseEventMessage(message: string): StreamEvent | null {
  let eventName = ""
  const dataLines: string[] = []
  for (const line of message.split("\n")) {
    if (line.startsWith("event:"))
      eventName = line.slice("event:".length).trim()
    if (line.startsWith("data:"))
      dataLines.push(line.slice("data:".length).trimStart())
  }
  if (!eventName || dataLines.length === 0) return null

  return {
    event: eventName,
    data: JSON.parse(dataLines.join("\n")),
  } as StreamEvent
}
