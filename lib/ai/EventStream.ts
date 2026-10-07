import type { SendStreamEvent } from "@/lib/StreamEvents"

export function createEventStream() {
  const encoder = new TextEncoder()
  let streamController: ReadableStreamDefaultController<Uint8Array>
  let isClosed = false

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller
    },
    cancel() {
      isClosed = true
    },
  })

  const sendEvent: SendStreamEvent = (streamEvent) => {
    if (isClosed) return
    const line = `data: ${JSON.stringify(streamEvent)}\n\n`
    streamController.enqueue(encoder.encode(line))
  }

  function closeStream() {
    if (isClosed) return
    isClosed = true
    streamController.close()
  }

  const response = new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  })

  return { response, sendEvent, closeStream }
}
