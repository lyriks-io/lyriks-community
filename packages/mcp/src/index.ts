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
import { readEditionScope }              from './edition-scope.js'
import { createMcpServer }               from './server.js'
import { issueSkillsTicket, skillsScopeGuard } from './skills-ticket.js'
import { issueSessionTicket, sessionScopeGuard } from './session-ticket.js'
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

// The installer's sign-in reads playbooks only (criterion 3f42911b).
app.post('/mcp', authenticate, skillsScopeGuard, sessionScopeGuard, async (c) => {
  const scope = c.get('token_scope') ?? null
  // Community (no overlay, or one that is not configured): every tool answers
  // from the platform.
  const ee  = enterprise?.configured() ? enterprise.bind(c.get('user_token')) : null
  // What the edition opens decides which tools are offered (EVO-001).
  const editionScope = await readEditionScope(c.get('user_token'))
  const mcp = createMcpServer(ee, c.get('user_token'), {
    mcpUrl: `${(process.env.PUBLIC_BASE_URL?.trim() || new URL(c.req.url).origin).replace(/\/$/, '')}/mcp`,
    // Where sign-in is enforced the command carries a ticket; elsewhere it needs
    // none. The installer itself is offered nothing: it already runs.
    signIn: () => {
      if (scope === 'skills') return null
      if (process.env.MCP_AUTH_REQUIRED !== '1') return { token: null }
      return issueSkillsTicket(c.get('user_token'), c.get('user_id'))
    },
    // The live session's waiting command signs in by itself (criterion 26c95cc1).
    sessionTicket: (sessionId) => {
      if (scope === 'skills' || scope === 'session-wait') return null
      if (process.env.MCP_AUTH_REQUIRED !== '1') return { token: null }
      return issueSessionTicket(c.get('user_token'), c.get('user_id'), sessionId)
    },
  }, editionScope)

  // Stateless mode: sessionIdGenerator = undefined
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })

  await mcp.connect(transport)
  // A client that hangs up mid-call (a live session's waiting call, a long
  // report) cancels what the call still waits on: closing the transport aborts
  // every tool's signal, so a waiting session on the platform reads the AI gone.
  c.req.raw.signal.addEventListener('abort', () => void transport.close(), { once: true })
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
