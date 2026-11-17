// The person's live session on the project (feat-ai-session, feat-evo-live-session):
// ONE session per person and project, opened on the project or started on a
// request; the person stays on their pages, the AI holds one call open until
// their next click on any of them, answers it through apply_evolution_batch,
// and waits again. The platform keeps the session and the clicks and tells
// the chip in the app bar what the AI is doing; this side holds the client's
// call open and proves it alive.

import type { LyriksClient } from '../lyriks-client.js'
import { withPageLinks } from './evolution.js'

/** The numbers of a session, as the spec declares them (constants of feat-evo-live-session). */
export const SESSION_LIMITS = {
  /** PROVISIONAL: 900 s holds were measured on Claude Code 2.1.285; 1500 s is measured before it is settled. */
  maxHoldSeconds: 1500,
  /** Measured: Claude Code cuts a call silent for 329 s; one progress notification every 30 s keeps it open. */
  progressIntervalSeconds: 30,
  /** One wait on the platform, under the 300 s after which Node fetch gives up on a response. */
  platformWaitSeconds: 240,
  /** A client that sends no progress token cannot be kept open: its default tool timeout is 60 s. */
  withoutProgressSeconds: 50,
} as const

/** What the MCP SDK hands a tool handler that this tool uses. */
export interface ToolExtra {
  signal?: AbortSignal
  _meta?: { progressToken?: string | number }
  sendNotification?: (notification: {
    method: 'notifications/progress'
    params: { progressToken: string | number; progress: number; message?: string }
  }) => Promise<void>
}

const LIVE = '/api/evolution/live'

export interface StartSessionArgs {
  project_id: string
  /** The request to start on; the session is the project's either way (ac-ai-session-project). */
  request_id?: string
}

/**
 * Where the waiting command reaches this server and how it signs in
 * (criterion 26c95cc1): `ticket` answers the token the command carries (null
 * where this server asks for none), or null when none can be issued now.
 */
export interface SessionWaiter {
  mcpUrl: string
  ticket: (sessionId: string) => { token: string | null; expiresAt?: string } | null
}

/** The exact command that waits in the background, ready to run as given. */
export function waitCommand(o: { mcpUrl: string; projectId: string; sessionId: string; token: string | null }): string {
  const quote = (value: string) => (/^[\w./:@=,+-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`)
  const parts = ['node', '.lyriks/tools/await-event.mjs', quote(o.projectId), '-', quote(o.sessionId), '--url', quote(o.mcpUrl)]
  if (o.token) parts.push('--token', quote(o.token))
  return parts.join(' ')
}

/** What the AI does once the session is open, wherever it starts (ac-ai-session-band, ac-evo-live-chat-free). */
function listen(command: string | null): string {
  const background = command
    ? `run \`wait.command\` as given, in the background: it signs in by itself and needs no setting (\`${command.replace(/--token \S+/, '--token …')}\`), and run it again after every event`
    : 'run `node .lyriks/tools/await-event.mjs <project_id> - <session_id> --url <this MCP address>` in the background'
  return `The chip in the app bar now reads "Your AI · listening". Tell the person in one sentence that you are listening on every page of the project and that they can use the AI buttons wherever they are (when you opened it on your own, beside a link you hand them or a question they answer on a page, say nothing about it unless it failed), then wait for their next click with this session_id, and again after every answer, until it says the session ended. Keep the chat free while you wait: where your client runs a command in the background and wakes you when it ends (Claude Code), ${background}; elsewhere call await_evolution_event with a short max_wait_seconds and answer the chat between two waits.`
}

/** The request a call names, left out of the body for a session of the whole project. */
const onRequest = (requestId: string | undefined) => (requestId ? { requestId } : {})

/** Open the session from the prompt (ac-evo-live-start, ac-ai-session-project). */
export async function startEvolutionSessionHandler(args: StartSessionArgs, lyriks: LyriksClient, waiter?: SessionWaiter): Promise<unknown> {
  const answer = await lyriks.post<Record<string, unknown>>(LIVE, { projectId: args.project_id, ...onRequest(args.request_id), act: 'start' })
  // The waiting command, signed in by itself where sign-in is enforced (criterion 26c95cc1).
  const sessionId = (answer.session as { id?: unknown } | undefined)?.id
  const signIn = waiter && typeof sessionId === 'string' ? waiter.ticket(sessionId) : null
  const wait = waiter && signIn && typeof sessionId === 'string'
    ? { command: waitCommand({ mcpUrl: waiter.mcpUrl, projectId: args.project_id, sessionId, token: signIn.token }), ...(signIn.expiresAt ? { expiresAt: signIn.expiresAt } : {}) }
    : null
  const withWait = wait ? { ...answer, wait } : answer
  const LISTEN = listen(wait?.command ?? null)
  if (!args.request_id) return { ...withWait, next: LISTEN }
  // Started on a request: the same session of the project, its place named so the AI begins there.
  return withPageLinks({
    ...withWait,
    next: `It starts on the request \`startsOn\`: read it (get_evolution with that request_id) before the first click. ${LISTEN}`,
  })
}

export interface AwaitArgs {
  project_id: string
  request_id?: string
  session_id: string
  max_wait_seconds?: number
}

/** Said with the next answer when the person cancelled the request the AI was on (ac-evo-live-cancel). */
type Cancelled = { cancelled?: { clickId: string; undone: number; kept: string[]; note: string } }

type PlatformAwait =
  | ({ ok: true; kind: 'click'; sessionId: string; requestId?: string | null; click: Record<string, unknown> } & Cancelled)
  | ({ ok: true; kind: 'progress'; sessionId: string; progress: Record<string, unknown> } & Cancelled)
  | ({ ok: true; kind: 'nothing'; sessionId: string; waitedSeconds: number } & Cancelled)
  | ({ ok: true; kind: 'ended'; sessionId: string; reason: string } & Cancelled)
  | { ok: false; message: string }

/**
 * Wait for the person's next click (ac-evo-live-wait): one call held open up to
 * maxHoldSeconds while the platform waits in turns of platformWaitSeconds, with
 * an MCP progress notification every progressIntervalSeconds so the client
 * never cuts it for being silent. A client that hangs up cancels the platform
 * wait, and the person's page reads the AI gone at once.
 */
export async function awaitEvolutionEventHandler(args: AwaitArgs, lyriks: LyriksClient, extra: ToolExtra = {}): Promise<unknown> {
  const token = extra._meta?.progressToken
  const ceiling = token === undefined ? SESSION_LIMITS.withoutProgressSeconds : SESSION_LIMITS.maxHoldSeconds
  const budget = Math.max(1, Math.min(args.max_wait_seconds ?? ceiling, SESSION_LIMITS.maxHoldSeconds))
  const started = Date.now()
  let beats = 0
  let heard: Cancelled['cancelled'] | undefined
  const beat =
    token === undefined || !extra.sendNotification
      ? null
      : setInterval(() => {
          beats++
          void extra.sendNotification!({
            method: 'notifications/progress',
            params: { progressToken: token, progress: beats, message: 'Listening to your pages' },
          }).catch(() => {})
        }, SESSION_LIMITS.progressIntervalSeconds * 1000)
  try {
    for (;;) {
      const left = budget - (Date.now() - started) / 1000
      if (left <= 0) return { ...nothingYet(args.session_id, started), ...(heard ? { cancelled: heard } : {}) }
      const answer = await lyriks.post<PlatformAwait>(
        LIVE,
        {
          projectId: args.project_id,
          ...onRequest(args.request_id),
          act: 'await',
          sessionId: args.session_id,
          waitSeconds: Math.ceil(Math.min(left, SESSION_LIMITS.platformWaitSeconds)),
        },
        { signal: extra.signal },
      )
      if (!answer.ok) throw new Error(answer.message)
      // A cancellation the AI had not heard of travels with whatever the call answers.
      if (answer.cancelled) heard = answer.cancelled
      const cancelled = heard ? { cancelled: heard } : {}
      // A click made outside a request, in a session of the whole project (ac-ai-session-ask-block, ac-ai-session-reread).
      if (answer.kind === 'click' && answer.requestId === null)
        return {
          kind: 'click',
          sessionId: args.session_id,
          requestId: null,
          ...cancelled,
          click: answer.click,
          next:
            'The person clicked this on the page and the chip in the app bar now reads that you are on it. Read the element first (click.read), say each major step with update_evolution_session say, do what click.answerWith says, then call await_evolution_event again at once. A question is answered in the block\'s thread, never by changing the specification; a re-reading corrects the extraction through the section tools, citing the code, and what you rewrite waits for a person\'s validation again.',
        }
      if (answer.kind === 'click')
        return withPageLinks({
          kind: 'click',
          sessionId: args.session_id,
          ...(answer.requestId ? { requestId: answer.requestId } : {}),
          ...cancelled,
          click: answer.click,
          next:
            'The person clicked this on the page and their page now reads that you think about it, with a Cancel button. Read `click.known` first: it is what the page already holds, never ask the person any of it. Read what you need (get_evolution, part "fields" for the field), announce each major step on the page (update_evolution_session say: the page numbers them), answer it with the operation `answerWith` names, then call await_evolution_event again at once. When one fact is missing to finish a suggestion, ask it in the suggestion (propose with question and choices), one question at a time; when `click.answer` is set, the person answered that question: propose again with it folded in. If `click.scope.note` is set, the message opens another topic while your question waits: say so in your reply and ask which question it answers before acting. A subject that belongs to another question is answered on that question. A prefill is a proposal the person signs; never write a value yourself.',
        })
      // The person moved the request on themselves (ac-evo-live-progress-wakes).
      if (answer.kind === 'progress')
        return withPageLinks({
          kind: 'progress',
          sessionId: args.session_id,
          ...cancelled,
          progress: answer.progress,
          next: 'The person moved the request on themselves, on the page (progress.happened). Say it in one sentence in the chat with what comes next (progress.next.say), then carry on the tour from progress.next as progress.answerWith says, and call await_evolution_event again.',
        })
      if (answer.kind === 'ended')
        return {
          kind: 'ended',
          sessionId: args.session_id,
          ...cancelled,
          reason: answer.reason,
          next: endedNext(answer.reason),
        }
      // The platform's turn ran out with nothing clicked: wait again inside the same call.
    }
  } finally {
    if (beat) clearInterval(beat)
  }
}

function nothingYet(sessionId: string, started: number) {
  return {
    kind: 'nothing',
    sessionId,
    waitedSeconds: Math.round((Date.now() - started) / 1000),
    next: 'Nothing was clicked yet: call await_evolution_event again at once, without a word in the chat.',
  }
}

function endedBecause(reason: string): string {
  switch (reason) {
    case 'ended_by_person':
      return 'the person ended it'
    case 'idle':
      return 'no click came for half an hour'
    case 'gone':
      return 'your waiting call dropped or you stayed silent too long'
    case 'replaced':
      return 'the person opened another session'
    case 'finished':
      return 'your work is done and nothing waits for you'
    default:
      return reason
  }
}

/**
 * What the AI does once its session ended. Its work done (feat-ai-session
 * criterion 45933ee4), it stops for good in this turn: no new wait, no new
 * session; the person's next prompt or click opens one.
 */
export function endedNext(reason: string): string {
  if (reason === 'finished')
    return 'The session ended: your work is done and nothing waits for you. Say so in the chat in one sentence and stop: do not call await_evolution_event again, do not run the waiting script again, and do not open a new session. The person\'s next prompt or click opens one.'
  return `The session ended (${endedBecause(reason)}). Say so in the chat in one sentence and stop waiting; start_evolution_session opens a new one, and the clicks still waiting go to it first.`
}

export interface UpdateSessionArgs {
  project_id: string
  request_id?: string
  session_id: string
  say?: string
  end?: boolean
}

/** Say what the AI does, or end the session on the person's word (ac-evo-live-state, -end). */
export async function updateEvolutionSessionHandler(args: UpdateSessionArgs, lyriks: LyriksClient): Promise<unknown> {
  const base = { projectId: args.project_id, ...onRequest(args.request_id), sessionId: args.session_id }
  const done: string[] = []
  if (args.say) {
    await lyriks.post(LIVE, { ...base, act: 'say', text: args.say })
    done.push('said on the page')
  }
  if (args.end) {
    await lyriks.post(LIVE, { ...base, act: 'end' })
    done.push('session ended')
  }
  if (done.length === 0) return { ok: false, message: 'Nothing to do: pass say or end.' }
  return { ok: true, done }
}
