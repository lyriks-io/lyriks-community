// The gateway's HTTP surface, assembled: health, OAuth, and POST /mcp behind
// authentication and the scope guards. index.ts checks the configuration and
// serves it; tests drive it in process with app.request().
//
// POST /mcp  — MCP Streamable HTTP (stateless mode, one McpServer per request)
// GET  /health — health check

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
import { indexScopeGuard, issueIndexTicket } from './index-ticket.js'
import { issueWakeTicket, wakeScopeGuard } from './wake-ticket.js'
import { registerOAuthRoutes }           from './oauth.js'
import { withKeepAlive }                 from './keep-alive.js'
import type { HonoVariables }            from './types.js'

/** The gateway's routes, built from the environment as it is now (OAuth routes exist only in strict mode). */
export function createApp(): Hono<{ Variables: HonoVariables }> {
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
  app.post('/mcp', authenticate, skillsScopeGuard, sessionScopeGuard, indexScopeGuard, wakeScopeGuard, async (c) => {
    const scope = c.get('token_scope') ?? null
    // A command's own sign-in is offered no ticket of another command.
    const commandScope = scope === 'skills' || scope === 'session-wait' || scope === 'index-sync' || scope === 'ai-wake'
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
        if (commandScope) return null
        if (process.env.MCP_AUTH_REQUIRED !== '1') return { token: null }
        return issueSessionTicket(c.get('user_token'), c.get('user_id'), sessionId)
      },
      // The sync command signs in by itself, for one project (feat-100, criterion 2452b3d7).
      indexTicket: (projectId) => {
        if (commandScope) return null
        if (process.env.MCP_AUTH_REQUIRED !== '1') return { token: null }
        return issueIndexTicket(c.get('user_token'), c.get('user_id'), projectId)
      },
      // The person's waker signs in by itself, for one project (criterion ab716003).
      wakeTicket: (projectId) => {
        if (commandScope) return null
        if (process.env.MCP_AUTH_REQUIRED !== '1') return { token: null }
        return issueWakeTicket(c.get('user_token'), c.get('user_id'), projectId)
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

  return app
}
