// The sync command's sign-in (feat-100, action aa15bfce, criterion 2452b3d7).
// sync_implementation_index with command:true hands the AI the exact command
// that sends the repository's index (.lyriks/tools/sync-index.mjs), because an
// index too large to type travels from the disk. That command is a process of
// its own and holds none of the AI client's credentials, so where sign-in is
// enforced it carries this ticket: backed by the same platform session as the
// client that asked for it (signing out cuts it), it lives twelve hours at
// most, and it can only do what the command itself does on that one project:
// read where index keys belong, send the index, and after a sync report what
// git says of the checkout to the request built on its branch (code-state.mjs:
// the board read that names the deployment branch, then report_code_state).
// Any other tool, any other operation, or another project, is refused. Nobody
// copies or sets a token.

import type { Context, Next } from 'hono'
import { issueAccessToken } from './access-tokens.js'
import type { HonoVariables } from './types.js'

/** As long as the live session's waiting command: a working day and its evening. */
export const INDEX_TICKET_TTL_SECONDS = 12 * 3600

/** A ticket for the sync command of one project, with when it stops working; null when no grant can be issued now. */
export function issueIndexTicket(session: string, subject: string, projectId: string): { token: string; expiresAt: string } | null {
  const token = issueAccessToken(session, subject, 'lyriks-index-sync', {
    scope: 'index-sync',
    projectId,
    ttlSeconds: INDEX_TICKET_TTL_SECONDS,
  })
  return token ? { token, expiresAt: new Date(Date.now() + INDEX_TICKET_TTL_SECONDS * 1000).toISOString() } : null
}

type Args = Record<string, unknown>

/** True when `args` names nothing but these arguments. */
const only = (args: Args, names: readonly string[]) => Object.keys(args).every((name) => names.includes(name))

/**
 * The calls an index ticket may make, all on its own project: send the index
 * (a sync or a move of lines, never a new command), read the feature and unit
 * of index keys, read the index keys of a feature (how --feature slices), and
 * report the code state after a sync: the request board read as code-state.mjs
 * reads it (the project alone), and a batch of report_code_state operations
 * and nothing else.
 */
function indexCallAllowed(name: unknown, args: Args, projectId: string): boolean {
  if (args.project_id !== projectId) return false
  if (name === 'sync_implementation_index') return args.command !== true
  if (name === 'get_implementation_status') return Array.isArray(args.keys)
  if (name === 'get_behavior_feature') return args.index_keys === true && args.paths === undefined
  if (name === 'get_evolution') return only(args, ['project_id'])
  if (name === 'apply_evolution_batch') {
    const operations = args.operations
    return only(args, ['project_id', 'operations']) && Array.isArray(operations) && operations.length > 0 &&
      operations.every((op) => !!op && typeof op === 'object' && (op as { op?: unknown }).op === 'report_code_state')
  }
  return false
}

/**
 * Whether a JSON-RPC body (one message or a batch) stays within what an index
 * ticket may do: open the MCP session, list the tools, and the calls above on
 * its project. Anything else, or a body that is not JSON-RPC, is refused.
 */
export function indexTicketAllows(body: unknown, projectId: string | null | undefined): boolean {
  if (!projectId) return false
  const messages = Array.isArray(body) ? body : [body]
  if (messages.length === 0) return false
  return messages.every((message) => {
    if (!message || typeof message !== 'object') return false
    const { method, params } = message as { method?: unknown; params?: { name?: unknown; arguments?: unknown } }
    if (typeof method !== 'string') return false
    if (method === 'initialize' || method === 'ping' || method === 'tools/list' || method.startsWith('notifications/')) return true
    const args = params?.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments) ? (params.arguments as Args) : {}
    return method === 'tools/call' && indexCallAllowed(params?.name, args, projectId)
  })
}

/** Refuses, before any tool runs, an index ticket used for anything but syncing the index of its project. */
export async function indexScopeGuard(c: Context<{ Variables: HonoVariables }>, next: Next): Promise<void | Response> {
  if (c.get('token_scope') === 'index-sync' && !indexTicketAllows(await c.req.raw.clone().json().catch(() => null), c.get('token_project'))) {
    return c.json({ errors: [{ code: 'FORBIDDEN', message: `This sign-in only reads where index keys belong, sends the index of project ${c.get('token_project') ?? '(none)'} and reports the code state of its branch (sync_implementation_index, get_implementation_status with keys, get_behavior_feature with index_keys, the request board, report_code_state).`, field: null }] }, 403)
  }
  await next()
}
