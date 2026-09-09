// Keeps a streaming MCP response alive on the wire while a tool is still working.
//
// A tool call produces no bytes until it answers, and the SSE body the transport
// returns starts empty, so Node holds the response headers back until something
// is written. To everything between the caller and us, a slow tool is then
// indistinguishable from a hung server:
//
//   - a Claude Code HTTP connector gives up after 60 s waiting for the first
//     response byte (MCP error -32001, "Request timed out"),
//   - a Cloudflare tunnel answers 524 at its proxy read timeout (about 100 s),
//
// both while the report the caller asked for is still being computed, and both
// leaving the caller no way to collect it.
//
// So we write an SSE comment straight away, and another one every interval until
// the real payload arrives. Comment lines (`: ...`) are ignored by every SSE
// parser, the MCP client's included, so the protocol is untouched: this only
// proves, continuously, that the server is still there.
//
// It is a floor, not a licence to be slow. A tool that needs minutes should get
// faster or become resumable; this is what keeps the connection from being cut
// out from under an honest, bounded computation.

const KEEP_ALIVE_COMMENT = ': keep-alive\n\n'

/** How often to prove the connection is alive. Well under every timeout above. */
const DEFAULT_INTERVAL_MS = 15_000

export function withKeepAlive(response: Response, intervalMs = DEFAULT_INTERVAL_MS): Response {
  const upstream = response.body
  const isEventStream = (response.headers.get('content-type') ?? '').includes('text/event-stream')
  // A plain JSON answer is already complete when we get here, and a bodyless
  // response (202, 405) has nothing to hold open.
  if (!upstream || !isEventStream) return response

  const encoder = new TextEncoder()
  const comment = () => encoder.encode(KEEP_ALIVE_COMMENT)
  const reader = upstream.getReader()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // The first byte, now: it flushes the headers instead of leaving the
      // caller staring at an open socket until the tool answers.
      controller.enqueue(comment())

      const timer = setInterval(() => {
        try {
          controller.enqueue(comment())
        } catch {
          clearInterval(timer)
        }
      }, intervalMs)
      // Never let the heartbeat be the reason the process stays up.
      ;(timer as { unref?: () => void }).unref?.()

      void (async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            if (value) controller.enqueue(value)
          }
          controller.close()
        } catch (e) {
          controller.error(e)
        } finally {
          clearInterval(timer)
        }
      })()
    },
    cancel(reason) {
      void reader.cancel(reason)
    },
  })

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}
