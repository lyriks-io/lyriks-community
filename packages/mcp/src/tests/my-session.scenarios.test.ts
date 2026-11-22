/**
 * The scenarios of "My session with my AI" (surface 1f2ed844 of feat-7, as
 * EVO-015 has them in draft b4374a49) whose asserted value the MCP gateway
 * computes, run against the real handlers with the platform stubbed: how long
 * one wait is held (wait.holdSeconds), the update that says nothing, and what
 * the AI is told at the opening and at the end. The platform's part of the
 * same scenarios is proven by the same tokens in lyriks-platform
 * (src/routes/api/evolution/live/my-session.scenarios.test.ts).
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SESSION_LIMITS,
  awaitEvolutionEventHandler,
  startEvolutionSessionHandler,
  updateEvolutionSessionHandler,
} from '../tools/evolution-session.js'
import type { LyriksClient } from '../lyriks-client.js'

const SURFACE = '1f2ed844'

type Call = { path: string; body: Record<string, unknown> }

/**
 * A platform whose every wait runs its whole turn with nothing clicked: each
 * call moves the clock by the seconds it was asked to wait, so the seconds the
 * gateway asked for, added up, are how long it held the AI's one call.
 */
function emptyPages(calls: Call[]) {
  return {
    post: async (path: string, body: Record<string, unknown>) => {
      calls.push({ path, body })
      vi.setSystemTime(Date.now() + Number(body.waitSeconds) * 1000)
      return { ok: true, kind: 'nothing', sessionId: body.sessionId, waitedSeconds: body.waitSeconds }
    },
  } as unknown as LyriksClient
}

const heldSeconds = (calls: Call[]) => calls.reduce((n, c) => n + Number(c.body.waitSeconds), 0)

async function holdOf(args: { max_wait_seconds?: number }, progress: boolean) {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  const calls: Call[] = []
  const answer = (await awaitEvolutionEventHandler(
    { project_id: 'p1', session_id: 's1', ...args },
    emptyPages(calls),
    progress ? { _meta: { progressToken: 't' }, sendNotification: async () => {} } : {},
  )) as Record<string, unknown>
  return { answer, calls, held: heldSeconds(calls) }
}

afterEach(() => {
  vi.useRealTimers()
})

describe("Wait for the person's next click (action f2f8e2b3 of feat-7, EVO-015)", () => {
  it(`The AI waits on the pages [unspa:${SURFACE}:f2f8e2b3:2270224b]`, async () => {
    const { answer, calls, held } = await holdOf({ max_wait_seconds: undefined }, true)
    // Held up to maxHoldSeconds, in turns of platformWaitSeconds inside the same call.
    expect(held).toBe(SESSION_LIMITS.maxHoldSeconds)
    expect(held).toBe(1500)
    expect(calls.every((c) => Number(c.body.waitSeconds) <= SESSION_LIMITS.platformWaitSeconds)).toBe(true)
    expect(answer.kind).toBe('nothing')
  })

  it(`A client without progress waits 50 seconds [unspa:${SURFACE}:f2f8e2b3:de107038]`, async () => {
    const { held } = await holdOf({}, false)
    expect(held).toBe(SESSION_LIMITS.withoutProgressSeconds)
    expect(held).toBe(50)
  })

  it(`A short wait keeps the chat free [unspa:${SURFACE}:f2f8e2b3:168bcf25]`, async () => {
    const { held } = await holdOf({ max_wait_seconds: 45 }, true)
    expect(held).toBe(45)
  })
})

describe('Say what I am doing (action 083b734b of feat-7, EVO-015)', () => {
  it(`An update with nothing to say does nothing [unspa:${SURFACE}:083b734b:647d407d]`, async () => {
    const calls: Call[] = []
    const platform = { post: async (path: string, body: Record<string, unknown>) => void calls.push({ path, body }) } as unknown as LyriksClient
    const answer = await updateEvolutionSessionHandler({ project_id: 'p1', session_id: 's1', say: '' }, platform)
    expect(answer).toEqual({ ok: false, message: 'Nothing to do: pass say or end.' })
    // The gateway answers ok false and calls nothing.
    expect(calls).toEqual([])
  })
})

describe('the criteria of feat-7 the request reworded, on the gateway (EVO-015)', () => {
  it('The opening tells the AI Ask my AI reads Listening and to keep the chat free [criterion:88cb2ef1]', async () => {
    const platform = { post: async () => ({ ok: true, session: { id: 's2' }, others: [{ id: 's1', name: 'Claude Code' }] }) } as unknown as LyriksClient
    const answer = (await startEvolutionSessionHandler({ project_id: 'p1', client: 'Codex' }, platform, {
      mcpUrl: 'https://lab.example/mcp',
      ticket: () => ({ token: null }),
    })) as Record<string, unknown>
    expect(String(answer.next)).toContain('Your AI · listening')
    expect(String(answer.next)).toContain('Keep the chat free while you wait')
    expect(String(answer.next)).toContain('in the background')
    expect(String(answer.next)).toContain('short max_wait_seconds')
    expect(answer.others).toEqual([{ id: 's1', name: 'Claude Code' }])
  })

  it('The AI is told why its session ended, and to stop for good once its work is done [criterion:bbf808b9]', async () => {
    const ended = (reason: string) =>
      awaitEvolutionEventHandler(
        { project_id: 'p1', session_id: 's1' },
        { post: async () => ({ ok: true, kind: 'ended', sessionId: 's1', reason }) } as unknown as LyriksClient,
      ) as Promise<Record<string, unknown>>
    for (const [reason, because] of [
      ['ended_by_person', 'the person ended it'],
      ['idle', 'no click came for half an hour'],
      ['gone', 'your waiting call dropped or you stayed silent too long'],
    ] as const) {
      const answer = await ended(reason)
      expect(answer).toMatchObject({ kind: 'ended', reason })
      expect(String(answer.next)).toContain(because)
      expect(String(answer.next)).toContain('Say so in the chat in one sentence and stop waiting')
    }
    const finished = await ended('finished')
    expect(String(finished.next)).toContain('your work is done and nothing waits for you')
    expect(String(finished.next)).toContain('do not call await_evolution_event again')
    expect(String(finished.next)).toContain('do not open a new session')
  })
})
