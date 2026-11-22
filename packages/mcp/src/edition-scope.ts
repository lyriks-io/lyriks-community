import { LyriksClient } from './lyriks-client.js'

/** What the installation's edition opens, as the platform says (GET /api/scope). */
export interface EditionScope {
  readonly evolutions: boolean
  /** Where Evolutions are locked: the sentence the platform refuses a request operation with (EVO-006). */
  readonly refusal?: string
}

/**
 * The tools that only read or drive Evolution requests: Community holds none
 * of them (EVO-001). The session of the project (start_evolution_session,
 * await_evolution_event, update_evolution_session) and apply_evolution_batch
 * stay, since Ask my AI needs them on every edition (EVO-008).
 */
export const EVOLUTION_TOOLS: ReadonlySet<string> = new Set(['get_evolution'])

/** What apply_evolution_batch takes where Evolutions are locked: the answer to a click made outside a request (Ask my AI). */
export const SESSION_ONLY_OPERATIONS: ReadonlySet<string> = new Set(['answer_click'])

/** The refusal an older platform, which words none in its scope, leaves to the gateway. */
export const EVOLUTIONS_LOCKED = 'Evolutions are not part of this installation\'s edition.'

/** Everything open: what is offered when the platform cannot be asked, since it refuses on its own anyway. */
export const OPEN_SCOPE: EditionScope = { evolutions: true }

/** An operation is named by `op`, or by `kind` the way the behavior batch spells it. */
function operationName(operation: unknown): string {
  if (!operation || typeof operation !== 'object') return ''
  const { op, kind } = operation as { op?: unknown; kind?: unknown }
  if (typeof op === 'string' && op) return op
  return typeof kind === 'string' ? kind : ''
}

/**
 * Why apply_evolution_batch refuses this batch before it reaches the platform,
 * or null when it goes through: where Evolutions are locked, a batch holding
 * any operation but answer_click reads or drives a request (EVO-008).
 */
export function lockedBatchRefusal(scope: EditionScope, operations: readonly unknown[]): string | null {
  if (scope.evolutions || operations.every((op) => SESSION_ONLY_OPERATIONS.has(operationName(op)))) return null
  return `${scope.refusal ?? EVOLUTIONS_LOCKED} On this installation apply_evolution_batch takes answer_click alone: the answer to a click made outside a request (Ask my AI).`
}

/** The sentence and the plans out of the platform's refusal, when it words one. */
function refusalOf(answer: unknown): string | undefined {
  const refusal = (answer as { refusal?: { message?: unknown; detail?: unknown } } | null)?.refusal
  if (typeof refusal?.message !== 'string' || !refusal.message.trim()) return undefined
  return typeof refusal.detail === 'string' && refusal.detail.trim() ? `${refusal.message} ${refusal.detail}` : refusal.message
}

const TTL_MS = 60_000
let cached: { scope: EditionScope; at: number } | null = null

/**
 * The scope, read once a minute: the edition only changes with a new key, and
 * the tool list is built on every call. A failed read offers every tool and is
 * not kept, so the next call asks again.
 */
export async function readEditionScope(token?: string, now = Date.now()): Promise<EditionScope> {
  if (cached && now - cached.at < TTL_MS) return cached.scope
  try {
    const answer = await new LyriksClient(token).get<{ evolutions?: unknown; refusal?: unknown }>('/api/scope')
    const evolutions = answer?.evolutions !== false
    const refusal = evolutions ? undefined : refusalOf(answer)
    const scope: EditionScope = refusal ? { evolutions, refusal } : { evolutions }
    cached = { scope, at: now }
    return scope
  } catch {
    return OPEN_SCOPE
  }
}

/** Forget the cached scope (tests). */
export function forgetEditionScope(): void {
  cached = null
}
