// MCP server entry point.
//
// POST /mcp  — MCP Streamable HTTP (stateless mode, one McpServer per request)
// GET  /health — health check
//
// Auth: opaque Bearer grants, with live platform session and role verification.
// Stateless: no session management — each request is independent.

import { serve }                         from '@hono/node-server'
import { Hono }                          from 'hono'
import { bodyLimit }                     from 'hono/body-limit'
import { WebStandardStreamableHTTPServerTransport }
  from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { authenticate }                  from './auth.js'
import { enterprise }                    from './enterprise/index.js'
import { createMcpServer }               from './server.js'
import { registerOAuthRoutes }           from './oauth.js'
import { withKeepAlive }                 from './keep-alive.js'
import type { HonoVariables }            from './types.js'
import { assertStrictAuthConfiguration } from './security-config.js'

assertStrictAuthConfiguration()

// A stray rejected promise (e.g. an upstream fetch failing after the response
// was already sent) must not take the whole connector down — that reads as
// "Server unavailable" on every endpoint until someone restarts the container.
process.on('unhandledRejection', (reason) => {
  console.error('[mcp] unhandled rejection (survived):', reason)
})

const app = new Hono<{ Variables: HonoVariables }>()
app.use('*', bodyLimit({ maxSize: 8 * 1024 * 1024 }))

app.get('/health', (c) => c.json({ status: 'ok', version: '0.1.0' }))

// OAuth discovery + authorize/token/register for browser-redirect auth.
registerOAuthRoutes(app)

// A GET probe on the MCP endpoint (some clients try SSE first) has nothing to
// stream in stateless mode; run auth so an unauthenticated probe still yields
// the 401 + WWW-Authenticate that kicks off OAuth discovery.
app.get('/mcp', authenticate, (c) => c.text('Method Not Allowed', 405))

app.post('/mcp', authenticate, async (c) => {
  // Community (no overlay, or one that is not configured): every tool answers
  // from the platform.
  const ee  = enterprise?.configured() ? enterprise.bind(c.get('user_token')) : null
  const mcp = createMcpServer(ee, c.get('user_token'))

  // Stateless mode: sessionIdGenerator = undefined
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })

  await mcp.connect(transport)
  const response = await transport.handleRequest(c.req.raw)
  // A whole-project report can take longer than the caller's first-byte timeout
  // (and than a Cloudflare tunnel's read timeout). Heartbeat the SSE stream so a
  // bounded computation is never cut off on its way to an answer.
  return withKeepAlive(response)
})

const PORT = Number(process.env.PORT ?? 3001)

/**
 * Identify the exact build being served — the companion silently serves a stale
 * bundle when sources were edited without `pnpm build`, so the boot line must
 * make "which build is this?" answerable at a glance.
 */
async function buildIdentity(): Promise<string> {
  try {
    const { readFileSync, statSync } = await import('node:fs')
    const { createHash } = await import('node:crypto')
    const self = process.argv[1]
    if (!self) return 'build unknown'
    const hash = createHash('sha256').update(readFileSync(self)).digest('hex').slice(0, 12)
    return `build ${hash} (bundled ${statSync(self).mtime.toISOString()})`
  } catch {
    return 'build unknown'
  }
}

serve({ fetch: app.fetch, port: PORT }, (info) => {
  void buildIdentity().then((identity) => {
    console.log(`[mcp] Lyriks MCP server listening on port ${info.port} — ${identity}`)
    console.log(`[mcp] edition: ${enterprise?.configured() ? enterprise.describe() : 'community (every tool served by the platform)'}`)
  })
})

export { app }
