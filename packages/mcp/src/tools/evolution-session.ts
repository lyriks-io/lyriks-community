// The person's live sessions on the project (feat-ai-session, feat-evo-live-session):
// ONE session per AI of the person and project (EVO-015), opened on the project
// or started on a request, beside the person's other AIs; the person stays on
// their pages, each AI holds one call open until a click that goes to it,
// answers it through apply_evolution_batch, and waits again. An AI reads its
// person's other sessions and may ask one of them a question. The platform
// keeps the sessions and the clicks, routes each click to one AI and tells Ask
// my AI what each AI is doing; this side holds the client's calls open and
// proves them alive.

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
  /** PROVISIONAL: how long an AI's question waits for another AI's answer, one platform wait (EVO-015). */
  peerAnswerSeconds: 240,
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
  /** What the AI is, as the person knows it (Claude Code, Codex): it names the session (EVO-015). */
  client?: string
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

/** What the AI is told of the person's other AIs in session (criterion 88cb2ef1): they stay, and it may read or ask them. */
function othersNote(others: unknown): string {
  const names = Array.isArray(others) ? others.map((o) => (o as { name?: unknown }).name).filter((n): n is string => typeof n === 'string') : []
  if (names.length === 0) return ''
  return ` The person's other AIs stay in session beside you (${names.join(', ')}): each click goes to one AI only, the one already on what it touches, else the free one opened last. read_evolution_sessions reads what each holds and does; ask_evolution_session asks one of them a question.`
}

/** The request a call names, left out of the body for a session of the whole project. */
const onRequest = (requestId: string | undefined) => (requestId ? { requestId } : {})

/** Open the session from the prompt (ac-evo-live-start, ac-ai-session-project). */
export async function startEvolutionSessionHandler(args: StartSessionArgs, lyriks: LyriksClient, waiter?: SessionWaiter): Promise<unknown> {
  const answer = await lyriks.post<Record<string, unknown>>(LIVE, {
    projectId: args.project_id,
    ...onRequest(args.request_id),
    act: 'start',
    ...(args.client?.trim() ? { client: args.client.trim() } : {}),
  })
  // The waiting command, signed in by itself where sign-in is enforced (criterion 26c95cc1).
  const sessionId = (answer.session as { id?: unknown } | undefined)?.id
  const signIn = waiter && typeof sessionId === 'string' ? waiter.ticket(sessionId) : null
  const wait = waiter && signIn && typeof sessionId === 'string'
    ? { command: waitCommand({ mcpUrl: waiter.mcpUrl, projectId: args.project_id, sessionId, token: signIn.token }), ...(signIn.expiresAt ? { expiresAt: signIn.expiresAt } : {}) }
    : null
  const withWait = wait ? { ...answer, wait } : answer
  const LISTEN = `${listen(wait?.command ?? null)}${othersNote(answer.others)}`
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
      // A question another AI of the person asked this one (EVO-015).
      if (answer.kind === 'click' && answer.requestId === null && answer.click.kind === 'question')
        return {
          kind: 'click',
          sessionId: args.session_id,
          requestId: null,
          ...cancelled,
          click: answer.click,
          next:
            'Another AI of the same person asks you this (click.from names it). Answer from what you hold and know of your own work, briefly, with the operation click.answerWith names, then call await_evolution_event again at once. Change nothing in the specification for it, and say nothing of it in the chat. Its asker waits for your answer a few minutes at most: after that it was told no answer came and your answer is refused.',
        }
      // A click made outside a request, in a session of the whole project (ac-ai-session-ask-block, ac-ai-session-reread).
      if (answer.kind === 'click' && answer.requestId === null)
        return {
          kind: 'click',
          sessionId: args.session_id,
          requestId: null,
          ...cancelled,
          click: answer.click,
          next:
            'The person clicked this on the page and the chip in the app bar now reads that you are on it. Read the element first (click.read), say each major step with update_evolution_session say, do what click.answerWith says, then call await_evolution_event again at once. A question is answered in the block\'s thread, never by changing the specification; a re-reading corrects the extraction through the section tools, citing the code, and what you rewrite waits for a person\'s validation again; a run or a resume is a Reverse-Specification to carry out: follow the prompt click.answerWith carries from its first line, and answer the click once your reading ends.',
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
    // Only a session that ended before a person could keep several AIs in session (EVO-015).
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

export interface ReadSessionsArgs {
  project_id: string
  session_id: string
}

/** Read the person's sessions on the project ("Read my other AIs", criterion 4536271d): each AI's name, what it holds and does. */
export async function readEvolutionSessionsHandler(args: ReadSessionsArgs, lyriks: LyriksClient): Promise<unknown> {
  const answer = await lyriks.post<{ ok: boolean; sessions?: unknown[] }>(LIVE, { projectId: args.project_id, act: 'sessions', sessionId: args.session_id })
  return {
    ...answer,
    next: 'These are the person\'s AIs in session on this project, yours marked you: never another member\'s. To ask one of them something, call ask_evolution_session with its id; what they do is never saved and stays between the person and their AIs.',
  }
}

export interface AskSessionArgs {
  project_id: string
  session_id: string
  /** The other AI's session, as read_evolution_sessions lists it. */
  to: string
  question: string
  max_wait_seconds?: number
}

type PlatformPeer =
  | { ok: true; kind: 'answer'; questionId: string; answer: string; from: { sessionId: string; name: string }; waitedSeconds: number }
  | { ok: true; kind: 'no_answer'; questionId: string; from: { sessionId: string; name: string }; message: string; waitedSeconds: number }
  | { ok: false; message?: string; reason?: string }

/**
 * Ask another AI of the same person ("Ask another AI of mine", criterion
 * 57735b99): the question waits in the other's wait like a click, and this
 * call is held until its answer or peerAnswerSeconds, kept alive with a
 * progress notification every progressIntervalSeconds like a wait.
 */
export async function askEvolutionSessionHandler(args: AskSessionArgs, lyriks: LyriksClient, extra: ToolExtra = {}): Promise<unknown> {
  const token = extra._meta?.progressToken
  const ceiling = token === undefined ? SESSION_LIMITS.withoutProgressSeconds : SESSION_LIMITS.peerAnswerSeconds
  const waitSeconds = Math.max(1, Math.min(args.max_wait_seconds ?? ceiling, SESSION_LIMITS.peerAnswerSeconds))
  let beats = 0
  const beat =
    token === undefined || !extra.sendNotification
      ? null
      : setInterval(() => {
          beats++
          void extra.sendNotification!({
            method: 'notifications/progress',
            params: { progressToken: token, progress: beats, message: 'Waiting for the other AI\'s answer' },
          }).catch(() => {})
        }, SESSION_LIMITS.progressIntervalSeconds * 1000)
  try {
    const answer = await lyriks.post<PlatformPeer>(
      LIVE,
      { projectId: args.project_id, act: 'ask', sessionId: args.session_id, to: args.to, question: args.question, waitSeconds },
      { signal: extra.signal },
    )
    if (!answer.ok) throw new Error(answer.reason ?? answer.message ?? 'The question could not be asked.')
    if (answer.kind === 'answer')
      return { ...answer, next: `${answer.from.name} answered. Carry on with what you were doing; nothing of this exchange is shown to the person.` }
    return { ...answer, next: `${answer.message}: carry on without it, or ask again later; ask the person only when you cannot do without it.` }
  } finally {
    if (beat) clearInterval(beat)
  }
}
