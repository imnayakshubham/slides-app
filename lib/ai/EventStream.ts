import type { SendStreamEvent } from "@/lib/StreamEvents"

export function createEventStream() {
  const encoder = new TextEncoder()
  let streamController: ReadableStreamDefaultController<Uint8Array>
  // The browser may disconnect (Stop button) while the agent is still running.
  let isClosed = false

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller
    },
    cancel() {
      isClosed = true
    },
  })

  const send: SendStreamEvent = (event, data) => {
    if (isClosed) return
    streamController.enqueue(
      encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    )
  }

  function close() {
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

  return { response, send, close }
}
