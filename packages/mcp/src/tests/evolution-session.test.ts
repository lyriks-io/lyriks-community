/**
 * Tests: the live session tools (feat-evo-live-session). The await tool holds
 * one call over several platform turns, proves it alive with progress
 * notifications, and hands the click over with the page link made whole.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SESSION_LIMITS,
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
