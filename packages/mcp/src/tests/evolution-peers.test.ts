/**
 * Tests: several AIs of one person in session on a project (EVO-015). An AI
 * names itself at the opening and is told who else is in session, reads its
 * person's other sessions, asks one of them a question held like a wait, and
 * is handed a question of another AI with what answers it.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  SESSION_LIMITS,
  askEvolutionSessionHandler,
  awaitEvolutionEventHandler,
  readEvolutionSessionsHandler,
  startEvolutionSessionHandler,
} from '../tools/evolution-session.js'
import type { LyriksClient } from '../lyriks-client.js'

type Call = { path: string; body: Record<string, unknown> }

function platform(answers: unknown[], calls: Call[], delayMs = 0) {
  return {
    post: async (path: string, body: Record<string, unknown>) => {
      calls.push({ path, body })
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs))
      return answers.length > 1 ? answers.shift() : answers[0]
    },
  } as unknown as LyriksClient
}

describe('opening one AI\'s session beside the others (criteria 88cb2ef1, 27e5de03)', () => {
  it('sends the client that names it and tells the AI the others stay', async () => {
    const calls: Call[] = []
    const answer = (await startEvolutionSessionHandler(
      { project_id: 'p1', client: ' Codex ' },
      platform([{ ok: true, session: { id: 's2' }, others: [{ id: 's1', name: 'Claude Code · EVO-014' }] }], calls),
    )) as Record<string, unknown>
    expect(calls[0].body).toMatchObject({ projectId: 'p1', act: 'start', client: 'Codex' })
    expect(String(answer.next)).toContain('Claude Code · EVO-014')
    expect(String(answer.next)).toContain('read_evolution_sessions')
  })

  it('says nothing of others when the AI is alone in session', async () => {
    const answer = (await startEvolutionSessionHandler({ project_id: 'p1' }, platform([{ ok: true, session: { id: 's1' }, others: [] }], []))) as Record<string, unknown>
    expect(String(answer.next)).not.toContain('other AIs stay')
  })
})

describe('read_evolution_sessions (criterion 4536271d)', () => {
  it('reads the person\'s sessions through the AI\'s own session', async () => {
    const calls: Call[] = []
    const sessions = [{ id: 's1', name: 'Claude Code', you: true }, { id: 's2', name: 'Codex', you: false }]
    const answer = (await readEvolutionSessionsHandler({ project_id: 'p1', session_id: 's1' }, platform([{ ok: true, sessions }], calls))) as Record<string, unknown>
    expect(calls[0].body).toEqual({ projectId: 'p1', act: 'sessions', sessionId: 's1' })
    expect(answer.sessions).toEqual(sessions)
  })
})

describe('ask_evolution_session (criterion 57735b99)', () => {
  it('asks the other AI and returns its answer and its name', async () => {
    const calls: Call[] = []
    const answer = (await askEvolutionSessionHandler(
      { project_id: 'p1', session_id: 's1', to: 's2', question: 'Where is the run?' },
      platform([{ ok: true, kind: 'answer', questionId: 'q1', answer: 'Data model, 62 %', from: { sessionId: 's2', name: 'Codex' }, waitedSeconds: 4 }], calls),
      { _meta: { progressToken: 't' }, sendNotification: async () => {} },
    )) as Record<string, unknown>
    expect(calls[0].body).toMatchObject({ act: 'ask', sessionId: 's1', to: 's2', question: 'Where is the run?', waitSeconds: SESSION_LIMITS.peerAnswerSeconds })
    expect(answer).toMatchObject({ kind: 'answer', answer: 'Data model, 62 %', from: { name: 'Codex' } })
  })

  it('says so when no answer came, and waits no longer than a client without progress keeps a call', async () => {
    const calls: Call[] = []
    const answer = (await askEvolutionSessionHandler(
      { project_id: 'p1', session_id: 's1', to: 's2', question: 'Where is the run?' },
      platform([{ ok: true, kind: 'no_answer', questionId: 'q1', from: { sessionId: 's2', name: 'Codex' }, message: 'No answer from Codex within 240 s', waitedSeconds: 50 }], calls),
    )) as Record<string, unknown>
    expect(calls[0].body.waitSeconds).toBe(SESSION_LIMITS.withoutProgressSeconds)
    expect(answer).toMatchObject({ kind: 'no_answer', message: 'No answer from Codex within 240 s' })
  })

  it('keeps the call alive with a progress notification while it waits', async () => {
    vi.useFakeTimers()
    try {
      const beats: string[] = []
      const asking = askEvolutionSessionHandler(
        { project_id: 'p1', session_id: 's1', to: 's2', question: 'Where is the run?' },
        platform([{ ok: true, kind: 'no_answer', questionId: 'q1', from: { sessionId: 's2', name: 'Codex' }, message: 'No answer', waitedSeconds: 240 }], [], 61_000),
        { _meta: { progressToken: 't' }, sendNotification: async (n) => void beats.push(n.params.message ?? '') },
      )
      await vi.advanceTimersByTimeAsync(61_000)
      await asking
      expect(beats).toEqual(['Waiting for the other AI\'s answer', 'Waiting for the other AI\'s answer'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('refuses with the platform\'s reason', async () => {
    const failing = { post: async () => ({ ok: false, reason: 'Ask another of your AIs, not your own session.' }) } as unknown as LyriksClient
    await expect(askEvolutionSessionHandler({ project_id: 'p1', session_id: 's1', to: 's1', question: 'Q?' }, failing)).rejects.toThrow('Ask another of your AIs, not your own session.')
  })
})

describe('a question of another AI reaches the AI it is addressed to (criterion 422604cf)', () => {
  it('is handed as a click of kind question, with what answers it', async () => {
    const click = { id: 'q1', kind: 'question', question: 'Where is the run?', from: { sessionId: 's1', name: 'Claude Code' }, answerWith: 'answer_click' }
    const answer = (await awaitEvolutionEventHandler(
      { project_id: 'p1', session_id: 's2' },
      platform([{ ok: true, kind: 'click', sessionId: 's2', requestId: null, click }], []),
    )) as Record<string, unknown>
    expect(answer).toMatchObject({ kind: 'click', requestId: null, click })
    expect(String(answer.next)).toContain('Another AI of the same person asks you this')
  })
})
