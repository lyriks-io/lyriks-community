// MCP server entry point: checks the configuration, then serves the gateway
// assembled in app.ts.
//
// Auth: opaque Bearer grants, with live platform session and role verification.
// Stateless: no session management — each request is independent.

import { serve }                         from '@hono/node-server'
import { createApp }                     from './app.js'
import { enterprise }                    from './enterprise/index.js'
import { assertStrictAuthConfiguration } from './security-config.js'

assertStrictAuthConfiguration()

// A stray rejected promise (e.g. an upstream fetch failing after the response
// was already sent) must not take the whole connector down — that reads as
// "Server unavailable" on every endpoint until someone restarts the container.
process.on('unhandledRejection', (reason) => {
  console.error('[mcp] unhandled rejection (survived):', reason)
})

const app = createApp()

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
