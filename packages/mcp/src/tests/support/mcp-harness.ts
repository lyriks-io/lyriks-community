// A real MCP client talking to the real gateway over the SDK's in-memory
// transport, with the services behind it replaced by small HTTP fakes behind
// `fetch`. This file lives in the open-source tree: it names no Enterprise
// service (scripts/oss-boundary.test.mjs scans src/, tests included).
//
// A tool driven this way goes through everything an agent's call goes through:
// the input schema (zod parses and strips what it does not declare), the
// handler, the HTTP client and its error mapping, the result cap. The fakes
// record every request, so a test asserts what the gateway sent and what the
// agent read back, never which internal function was called.
import { vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createMcpServer } from '../../server.js'
import type { BoundOverlay } from '../../enterprise/overlay.js'
import type { EditionScope } from '../../edition-scope.js'
import type { SelfInstallSource } from '../../tools/skills.js'

/** Where LyriksClient sends its requests (the same fallbacks it uses). */
export const PLATFORM_ORIGIN = new URL(process.env.LYRIKS_BASE_URL ?? process.env.V3_BASE_URL ?? 'http://localhost:5173').origin

export interface RecordedRequest {
  method: string
  /** Path and query string, as the client wrote them. */
  path: string
  url: URL
  headers: Headers
  /** The parsed JSON body, or undefined when none was sent. */
  body: unknown
}

type Handler = (request: RecordedRequest) => unknown

/** An answer with a status other than 200. */
export function reply(status: number, body: unknown, contentType = 'application/json'): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return new Response(text, { status, headers: { 'content-type': contentType } })
}

/**
 * A service behind `fetch`: routes keyed by method and path (query ignored),
 * every request recorded. A route answers JSON with status 200 unless its
 * handler returns a Response; an unknown route answers 404 with a body that
 * names it, so a test that forgot one fails on a readable message.
 */
export class FakeHttpService {
  readonly requests: RecordedRequest[] = []
  private readonly routes = new Map<string, Handler>()

  constructor(readonly origin: string) {}

  /** Answer `method path` with a value, or with what `handler` returns for the request. */
  on(method: string, pathname: string, answer: unknown): this {
    this.routes.set(`${method} ${pathname}`, typeof answer === 'function' ? (answer as Handler) : () => answer)
    return this
  }

  /** The requests made to one method and path (query ignored). */
  requestsTo(method: string, pathname: string): RecordedRequest[] {
    return this.requests.filter((r) => r.method === method && r.url.pathname === pathname)
  }

  async handle(url: URL, init: RequestInit | undefined): Promise<Response> {
    const method = (init?.method ?? 'GET').toUpperCase()
    const raw = typeof init?.body === 'string' ? init.body : undefined
    const request: RecordedRequest = {
      method,
      path: `${url.pathname}${url.search}`,
      url,
      headers: new Headers(init?.headers),
      body: raw === undefined ? undefined : JSON.parse(raw),
    }
    this.requests.push(request)
    const handler = this.routes.get(`${method} ${url.pathname}`)
    if (!handler) return reply(404, { message: `fake ${this.origin}: no route for ${method} ${url.pathname}` })
    const answer = await handler(request)
    return answer instanceof Response ? answer : reply(200, answer ?? null)
  }
}

/**
 * Route the global fetch to these services by origin. Any other origin fails
 * the way an unreachable host does. Undo with vi.unstubAllGlobals().
 */
export function serveFetch(...services: FakeHttpService[]): void {
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const service = services.find((s) => s.origin === url.origin)
    if (!service) throw new TypeError(`fetch failed: nothing listens on ${url.origin}`)
    return service.handle(url, init)
  })
}

/** What an agent reads back from one tool call. */
export interface ToolAnswer {
  isError: boolean
  /** The text of the first content block: the JSON a tool answers, or the error message. */
  text: string
  /** The answer parsed as JSON. */
  json<T = Record<string, unknown>>(): T
}

export interface ConnectedAgent {
  client: Client
  call(name: string, args?: Record<string, unknown>): Promise<ToolAnswer>
  close(): Promise<void>
}

export interface GatewayOptions {
  ee?: BoundOverlay | null
  token?: string
  selfInstall?: SelfInstallSource
  scope?: EditionScope
}

/** A fresh gateway, as one POST /mcp builds it, with a real client connected to it. */
export async function connectAgent(options: GatewayOptions = {}): Promise<ConnectedAgent> {
  const server = createMcpServer(options.ee ?? null, options.token, options.selfInstall, options.scope)
  const client = new Client({ name: 'test-agent', version: '0.0.0' })
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverSide), client.connect(clientSide)])
  return {
    client,
    async call(name, args = {}) {
      const result = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content?: Array<{ type: string; text?: string }> }
      const text = result.content?.[0]?.text ?? ''
      return {
        isError: result.isError === true,
        text,
        json: <T>() => JSON.parse(text) as T,
      }
    },
    close: () => client.close(),
  }
}
