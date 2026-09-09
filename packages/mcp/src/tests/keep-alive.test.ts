// A slow tool must not look like a hung server: the response has to put bytes on
// the wire immediately and keep doing so, or the caller's first-byte timeout and
// the tunnel's read timeout both fire while the answer is still being computed.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withKeepAlive } from '../keep-alive.js'

const decoder = new TextDecoder()

function sseResponse(): { response: Response; answer: (text: string) => void; end: () => void } {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) })
  const response = new Response(body, { headers: { 'content-type': 'text/event-stream' } })
  return {
    response,
    answer: (text) => controller.enqueue(new TextEncoder().encode(text)),
    end: () => controller.close(),
  }
}

/** Read what is on the wire right now, without waiting for the stream to end. */
async function readAvailable(reader: ReadableStreamDefaultReader<Uint8Array>, chunks: number) {
  let out = ''
  for (let i = 0; i < chunks; i += 1) {
    const { value, done } = await reader.read()
    if (done) break
    if (value) out += decoder.decode(value)
  }
  return out
}

afterEach(() => vi.useRealTimers())

describe('withKeepAlive', () => {
  it('puts a first byte on the wire before the tool has answered', async () => {
    const { response } = sseResponse()

    const reader = withKeepAlive(response).body!.getReader()

    expect(await readAvailable(reader, 1)).toBe(': keep-alive\n\n')
  })

  it('keeps proving the connection is alive while the tool works', async () => {
    vi.useFakeTimers()
    const { response, answer, end } = sseResponse()
    const reader = withKeepAlive(response, 1000).body!.getReader()

    await readAvailable(reader, 1) // the immediate one
    await vi.advanceTimersByTimeAsync(3000)
    answer('event: message\ndata: {"jsonrpc":"2.0","id":1}\n\n')
    end()

    const rest = await readAvailable(reader, 5)
    expect(rest.match(/: keep-alive/g)?.length).toBe(3)
    expect(rest).toContain('"jsonrpc":"2.0"')
  })

  it('passes the payload through unchanged and closes with it', async () => {
    const { response, answer, end } = sseResponse()
    const wrapped = withKeepAlive(response)
    answer('event: message\ndata: hello\n\n')
    end()

    const text = await wrapped.text()

    expect(text).toBe(': keep-alive\n\nevent: message\ndata: hello\n\n')
  })

  it('leaves a plain JSON answer alone', async () => {
    const json = new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } })

    const wrapped = withKeepAlive(json)

    expect(wrapped).toBe(json)
    expect(await wrapped.text()).toBe('{"ok":true}')
  })

  it('leaves a bodyless response alone', () => {
    const empty = new Response(null, { status: 202 })
    expect(withKeepAlive(empty)).toBe(empty)
  })
})
