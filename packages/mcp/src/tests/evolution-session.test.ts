/**
 * Tests: the live session tools (feat-evo-live-session). The await tool holds
 * one call over several platform turns, proves it alive with progress
 * notifications, and hands the click over with the page link made whole.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SESSION_LIMITS,
  awaitAiWakeHandler,
  awaitEvolutionEventHandler,
  startEvolutionSessionHandler,
  updateEvolutionSessionHandler,
} from '../tools/evolution-session.js'
import type { LyriksClient } from '../lyriks-client.js'

type Call = { path: string; body: Record<string, unknown>; signal?: AbortSignal }

function platform(answers: unknown[], calls: Call[]) {
  return {
    post: async (path: string, body: Record<string, unknown>, opts: { signal?: AbortSignal } = {}) => {
      calls.push({ path, body, signal: opts.signal })
      return answers.length > 1 ? answers.shift() : answers[0]
    },
  } as unknown as LyriksClient
}

const args = { project_id: 'p1', request_id: 'r1', session_id: 's1' }

describe('start_evolution_session', () => {
  it('opens the session on the platform and says to wait at once', async () => {
    const calls: Call[] = []
    const answer = (await startEvolutionSessionHandler({ project_id: 'p1', request_id: 'r1' }, platform([{ ok: true, session: { id: 's1' } }], calls))) as Record<string, unknown>
    expect(calls[0]).toMatchObject({ path: '/api/evolution/live', body: { projectId: 'p1', requestId: 'r1', act: 'start' } })
    expect(String(answer.next)).toContain('await_evolution_event')
  })
})

describe('the waiting command signs in by itself (criterion 26c95cc1)', () => {
  const answerOf = async (ticket: (id: string) => { token: string | null; expiresAt?: string } | null) =>
    (await startEvolutionSessionHandler({ project_id: 'p1' }, platform([{ ok: true, session: { id: 's1' } }], []), { mcpUrl: 'https://lab.example/mcp', ticket })) as Record<string, unknown>

  it('hands the exact command, with a ticket for that session, and never asks for a setting', async () => {
    const asked: string[] = []
    const answer = await answerOf((id) => { asked.push(id); return { token: 'lyriks_mcp_T', expiresAt: '2026-11-16T22:00:00.000Z' } })
    expect(asked).toEqual(['s1'])
    expect(answer.wait).toEqual({
      command: 'node .lyriks/tools/await-event.mjs p1 - s1 --url https://lab.example/mcp --token lyriks_mcp_T',
      expiresAt: '2026-11-16T22:00:00.000Z',
    })
    expect(String(answer.next)).toContain('wait.command')
    expect(String(answer.next)).not.toContain('lyriks_mcp_T')
    expect(String(answer.next)).not.toContain('LYRIKS_MCP_TOKEN')
  })

  it('carries no token where the server asks for none', async () => {
    const answer = await answerOf(() => ({ token: null }))
    expect((answer.wait as { command: string }).command).toBe('node .lyriks/tools/await-event.mjs p1 - s1 --url https://lab.example/mcp')
  })

  it('offers no command when no ticket can be issued, and still says how to wait', async () => {
    const answer = await answerOf(() => null)
    expect(answer.wait).toBeUndefined()
    expect(String(answer.next)).toContain('await_evolution_event')
  })
})

describe('the waking command is handed once and signs in by itself (criterion ab716003)', () => {
  const ticket = () => ({ token: 'lyriks_mcp_W', expiresAt: '2026-11-16T22:00:00.000Z' })
  const answerOf = async (opened: Record<string, unknown>, wakeTicket?: (projectId: string) => { token: string | null; expiresAt?: string } | null, client = 'Claude Code') =>
    (await startEvolutionSessionHandler({ project_id: 'p1', client }, platform([{ ok: true, session: { id: 's1' }, ...opened }], []), {
      mcpUrl: 'https://lab.example/mcp',
      ticket: () => ({ token: 'lyriks_mcp_T' }),
      ...(wakeTicket ? { wakeTicket } : {}),
    })) as Record<string, unknown>

  it('hands the exact command that starts the waker apart from the conversation, with a ticket for the project alone', async () => {
    const asked: string[] = []
    const answer = await answerOf({ waker: { status: 'none' } }, (projectId) => { asked.push(projectId); return ticket() })
    expect(asked).toEqual(['p1'])
    expect(answer.wake).toEqual({
      command: 'node .lyriks/tools/wake-ai.mjs p1 --detach --ai claude --url https://lab.example/mcp --token lyriks_mcp_W',
      expiresAt: '2026-11-16T22:00:00.000Z',
    })
    // Offered once, started on the person's word only, and never with its token in the words.
    const next = String(answer.next)
    expect(next).toContain('wake.command')
    expect(next).toContain('only on their word')
    expect(next).not.toContain('lyriks_mcp_W')
  })

  it('offers nothing when the person\'s waker already listens: a woken AI is never asked to start another', async () => {
    const answer = await answerOf({ waker: { status: 'listening' } }, ticket)
    expect(answer.wake).toBeDefined()
    expect(String(answer.next)).not.toContain('wake.command')
  })

  it('starts the same CLI as the AI that opened the session, and offers none to an AI it cannot start', async () => {
    const codex = await answerOf({ waker: { status: 'none' } }, ticket, 'Codex')
    expect((codex.wake as { command: string }).command).toContain('--ai codex')
    expect(String(codex.next)).toContain('starts Codex without a window')
    const gemini = await answerOf({ waker: { status: 'none' } }, ticket, 'Gemini CLI')
    expect((gemini.wake as { command: string }).command).toContain('--ai gemini')
    const cursor = await answerOf({ waker: { status: 'none' } }, ticket, 'Cursor')
    expect(cursor.wake).toBeUndefined()
    expect(String(cursor.next)).not.toContain('wake.command')
  })

  it('offers no waker where the server issues no waking sign-in', async () => {
    const answer = await answerOf({ waker: { status: 'none' } })
    expect(answer.wake).toBeUndefined()
    expect(String(answer.next)).not.toContain('wake.command')
  })
})

describe('await_ai_wake (actions 77cdb263, ccca0911)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('waits again inside the same call while nothing wakes, then answers the wake', async () => {
    const calls: Call[] = []
    const lyriks = platform(
      [
        { ok: true, kind: 'nothing', waitedSeconds: 240 },
        { ok: true, kind: 'wake', clicks: 1, wokenAt: '2026-11-25T23:00:00.000Z' },
      ],
      calls,
    )
    const answer = (await awaitAiWakeHandler({ project_id: 'p1' }, lyriks, { _meta: { progressToken: 3 }, sendNotification: async () => {} })) as Record<string, unknown>
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({ path: '/api/evolution/live', body: { projectId: 'p1', act: 'wake_wait' } })
    expect(Number(calls[0].body.waitSeconds)).toBeLessThanOrEqual(SESSION_LIMITS.platformWaitSeconds)
    expect(answer).toEqual({ kind: 'wake', clicks: 1, wokenAt: '2026-11-25T23:00:00.000Z' })
  })

  it('holds a caller without a progress token at most withoutProgressSeconds, then answers nothing', async () => {
    const calls: Call[] = []
    // Each platform turn takes the time it was asked to wait.
    const lyriks = {
      post: async (path: string, body: Record<string, unknown>) => {
        calls.push({ path, body })
        vi.setSystemTime(Date.now() + Number(body.waitSeconds) * 1000)
        return { ok: true, kind: 'nothing', waitedSeconds: Number(body.waitSeconds) }
      },
    } as unknown as LyriksClient
    const answer = (await awaitAiWakeHandler({ project_id: 'p1' }, lyriks)) as Record<string, unknown>
    expect(calls).toHaveLength(1)
    expect(Number(calls[0].body.waitSeconds)).toBe(SESSION_LIMITS.withoutProgressSeconds)
    expect(answer.kind).toBe('nothing')
  })

  it('passes a refusal of the platform on as an error', async () => {
    const lyriks = platform([{ ok: false, message: 'Only the waking command of the person\'s AI listens for wakes.' }], [])
    await expect(awaitAiWakeHandler({ project_id: 'p1', max_wait_seconds: 5 }, lyriks)).rejects.toThrow('Only the waking command')
  })
})

describe('the session of the whole project (feat-ai-session)', () => {
  it('opens on the project alone: no request travels, and the AI is told it listens on every page', async () => {
    const calls: Call[] = []
    const answer = (await startEvolutionSessionHandler({ project_id: 'p1' }, platform([{ ok: true, session: { id: 's1' } }], calls))) as Record<string, unknown>
    expect(calls[0].body).toEqual({ projectId: 'p1', act: 'start' })
    expect(String(answer.next)).toContain('every page of the project')
  })

  it('hands a click made outside a request with the operation that answers it', async () => {
    const calls: Call[] = []
    const click = { id: 'p1c', kind: 'ask_block', answerWith: 'apply_evolution_batch [{ op: "answer_click" }]' }
    const lyriks = platform([{ ok: true, kind: 'click', sessionId: 's1', requestId: null, click }], calls)
    const answer = (await awaitEvolutionEventHandler({ project_id: 'p1', session_id: 's1' }, lyriks, { _meta: { progressToken: 1 }, sendNotification: async () => {} })) as Record<string, unknown>
    expect(calls[0].body).not.toHaveProperty('requestId')
    expect(answer).toMatchObject({ kind: 'click', requestId: null, click })
    expect(String(answer.next)).toContain('answerWith')
  })
})

describe('await_evolution_event', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('passes on a cancellation the AI had not heard of, with the next click (ac-evo-live-cancel)', async () => {
    const calls: Call[] = []
    const cancelled = { clickId: 'c0', undone: 3, kept: [], note: 'The person cancelled the request you were on.' }
    const lyriks = platform(
      [
        { ok: true, kind: 'nothing', sessionId: 's1', waitedSeconds: 240, cancelled },
        { ok: true, kind: 'click', sessionId: 's1', click: { id: 'c1', kind: 'ask', href: '/projects/p1/evolution?request=r1' } },
      ],
      calls,
    )
    const answer = (await awaitEvolutionEventHandler(args, lyriks, { _meta: { progressToken: 7 }, sendNotification: async () => {} })) as Record<string, unknown>
    expect(answer.kind).toBe('click')
    expect(answer.cancelled).toEqual(cancelled)
    expect(String(answer.next)).toContain('scope.note')
  })

  it('waits again inside the same call when a platform turn ran out, then hands the click over', async () => {
    const calls: Call[] = []
    const click = { id: 'c1', kind: 'ask', href: '/projects/p1/evolution?request=r1' }
    const lyriks = platform(
      [
        { ok: true, kind: 'nothing', sessionId: 's1', waitedSeconds: 240 },
        { ok: true, kind: 'click', sessionId: 's1', click },
      ],
      calls,
    )
    const answer = (await awaitEvolutionEventHandler(args, lyriks, { _meta: { progressToken: 7 }, sendNotification: async () => {} })) as Record<string, unknown>
    expect(calls).toHaveLength(2)
    expect(calls[0].body).toMatchObject({ act: 'await', sessionId: 's1' })
    expect(Number(calls[0].body.waitSeconds)).toBeLessThanOrEqual(SESSION_LIMITS.platformWaitSeconds)
    expect(answer.kind).toBe('click')
    // The link is whole, so the client hands the person a link they can open.
    expect(String((answer.click as Record<string, unknown>).href)).toMatch(/^https?:\/\/.+\/projects\/p1\/evolution/)
  })

  it("hands the person's own progress over instead of waiting on (ac-evo-live-progress-wakes)", async () => {
    const calls: Call[] = []
    const progress = { happened: ['Need validated'], step: { code: 'solution', label: 'Solution' }, href: '/projects/p1/evolution?request=r1&at=next-step', next: { say: 'Say what changes.' } }
    const lyriks = platform(
      [
        { ok: true, kind: 'nothing', sessionId: 's1', waitedSeconds: 240 },
        { ok: true, kind: 'progress', sessionId: 's1', progress },
      ],
      calls,
    )
    const answer = (await awaitEvolutionEventHandler(args, lyriks, { _meta: { progressToken: 7 }, sendNotification: async () => {} })) as Record<string, unknown>
    expect(calls).toHaveLength(2)
    expect(answer.kind).toBe('progress')
    expect((answer.progress as Record<string, unknown>).happened).toEqual(['Need validated'])
    expect(String((answer.progress as Record<string, unknown>).href)).toMatch(/^https?:\/\/.+\/projects\/p1\/evolution/)
    expect(String(answer.next)).toContain('carry on the tour')
  })

  it('sends a progress notification every progressIntervalSeconds while it waits', async () => {
    const sent: unknown[] = []
    let release!: (v: unknown) => void
    const lyriks = { post: () => new Promise((r) => (release = r)) } as unknown as LyriksClient
    const waiting = awaitEvolutionEventHandler(args, lyriks, {
      _meta: { progressToken: 'tok' },
      sendNotification: async (n) => void sent.push(n),
    })
    await vi.advanceTimersByTimeAsync(SESSION_LIMITS.progressIntervalSeconds * 1000 * 3)
    expect(sent).toHaveLength(3)
    expect(sent[0]).toMatchObject({ method: 'notifications/progress', params: { progressToken: 'tok', progress: 1 } })
    release({ ok: true, kind: 'ended', sessionId: 's1', reason: 'ended_by_person' })
    expect(((await waiting) as Record<string, unknown>).kind).toBe('ended')
  })

  it('sends no progress notification to a client that gave no progress token', async () => {
    const sent: unknown[] = []
    let release!: (v: unknown) => void
    const lyriks = { post: () => new Promise((r) => (release = r)) } as unknown as LyriksClient
    const waiting = awaitEvolutionEventHandler(args, lyriks, { sendNotification: async (n) => void sent.push(n) })
    await vi.advanceTimersByTimeAsync(SESSION_LIMITS.progressIntervalSeconds * 1000 * 3)
    expect(sent).toEqual([])
    release({ ok: true, kind: 'ended', sessionId: 's1', reason: 'ended_by_person' })
    expect(((await waiting) as Record<string, unknown>).kind).toBe('ended')
  })

  it('without a progress token a call waits no longer than a default client timeout allows', async () => {
    const calls: Call[] = []
    await awaitEvolutionEventHandler(args, platform([{ ok: true, kind: 'ended', sessionId: 's1', reason: 'idle' }], calls), {})
    expect(Number(calls[0].body.waitSeconds)).toBe(SESSION_LIMITS.withoutProgressSeconds)
  })

  it('says why the session ended and to stop waiting', async () => {
    const answer = (await awaitEvolutionEventHandler(args, platform([{ ok: true, kind: 'ended', sessionId: 's1', reason: 'gone' }], []), {})) as Record<string, unknown>
    expect(answer.kind).toBe('ended')
    expect(String(answer.next)).toContain('stop waiting')
  })

  it("passes the client's hang-up on to the platform wait", async () => {
    const calls: Call[] = []
    const controller = new AbortController()
    await awaitEvolutionEventHandler(args, platform([{ ok: true, kind: 'ended', sessionId: 's1', reason: 'gone' }], calls), { signal: controller.signal })
    expect(calls[0].signal).toBe(controller.signal)
  })
})

describe('update_evolution_session', () => {
  it('says and ends through the platform, shows no band, and refuses an empty update', async () => {
    const calls: Call[] = []
    const lyriks = platform([{ ok: true }], calls)
    await updateEvolutionSessionHandler({ ...args, say: 'Reading the Need', end: true }, lyriks)
    expect(calls.map((c) => c.body.act)).toEqual(['say', 'end'])
    expect(((await updateEvolutionSessionHandler(args, lyriks)) as Record<string, unknown>).ok).toBe(false)
  })
})

describe('the AI says on the person\'s pages the question it waits on or why it stops (criterion b940571a)', () => {
  it('asks through the session of the project and hands back where the person reads it', async () => {
    const calls: Call[] = []
    const answer = (await updateEvolutionSessionHandler(
      { ...args, ask: 'Which billing flow runs in production?', href: '/projects/p1/reverse', title: 'Reverse' },
      platform([{ ok: true, conversationId: 'c9', href: '/projects/p1/ask?c=c9' }], calls),
    )) as Record<string, unknown>
    expect(calls[0]).toMatchObject({ path: '/api/evolution/live', body: { projectId: 'p1', sessionId: 's1', act: 'tell', about: 'question', text: 'Which billing flow runs in production?', href: '/projects/p1/reverse', title: 'Reverse' } })
    expect(calls[0].body.requestId).toBeUndefined()
    expect(answer).toMatchObject({ ok: true, conversationId: 'c9', done: ['asked the person on their pages'] })
    expect(String(answer.href)).toMatch(/^https?:\/\/.+\/projects\/p1\/ask\?c=c9$/)
    expect(String(answer.next)).toContain('Keep waiting in the background')
  })

  it('says why it stops, and never both at once', async () => {
    const calls: Call[] = []
    const lyriks = platform([{ ok: true, conversationId: 'c1', href: '/projects/p1/ask?c=c1' }], calls)
    await updateEvolutionSessionHandler({ ...args, stopped: 'My usage limit is reached.' }, lyriks)
    expect(calls[0].body).toMatchObject({ act: 'tell', about: 'stopped', text: 'My usage limit is reached.' })
    expect(calls[0].body.href).toBeUndefined()
    const both = (await updateEvolutionSessionHandler({ ...args, ask: 'Which?', stopped: 'Done.' }, lyriks)) as Record<string, unknown>
    expect(both).toMatchObject({ ok: false })
    expect(calls).toHaveLength(1)
  })
})

describe('a session whose work is done (feat-ai-session criterion 45933ee4)', () => {
  it('tells the AI to stop for good, neither waiting again nor opening a new session', async () => {
    const calls: Call[] = []
    const lyriks = platform([{ ok: true, kind: 'ended', sessionId: 's1', reason: 'finished' }], calls)
    const answer = (await awaitEvolutionEventHandler({ project_id: 'p1', session_id: 's1' }, lyriks)) as { kind: string; reason: string; next: string }
    expect(answer).toMatchObject({ kind: 'ended', reason: 'finished' })
    expect(answer.next).toContain('your work is done and nothing waits for you')
    expect(answer.next).toContain('do not call await_evolution_event again')
    expect(answer.next).toContain('do not open a new session')
    expect(answer.next).not.toContain('start_evolution_session opens a new one')
  })

  it('keeps saying how to come back after any other end', async () => {
    const calls: Call[] = []
    const lyriks = platform([{ ok: true, kind: 'ended', sessionId: 's1', reason: 'idle' }], calls)
    const answer = (await awaitEvolutionEventHandler({ project_id: 'p1', session_id: 's1' }, lyriks)) as { next: string }
    expect(answer.next).toContain('start_evolution_session opens a new one')
  })
})
