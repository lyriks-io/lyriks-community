/**
 * Tests: report_retrospec_reading (feat-mcp-authoring criteria c50587fb,
 * 23397c95). A commit or a check is posted to the run under way; a call with
 * neither only reads where the run stands and the hand edits Code drift lists.
 */

import { describe, expect, it } from 'vitest'
import { reportRetrospecReadingHandler } from '../tools/retrospec-reading.js'
import type { LyriksClient } from '../lyriks-client.js'

type Call = { method: 'GET' | 'POST'; path: string; body?: unknown }

function platform(calls: Call[]) {
  return {
    get: async (path: string) => {
      calls.push({ method: 'GET', path })
      return { run: null, handEdits: [] }
    },
    post: async (path: string, body: unknown) => {
      calls.push({ method: 'POST', path, body })
      return { ok: true }
    },
  } as unknown as LyriksClient
}

describe('report_retrospec_reading', () => {
  it('records the commit the run read, with its repository [criterion:c50587fb]', async () => {
    const calls: Call[] = []
    await reportRetrospecReadingHandler({ project_id: 'p 1', commit: 'abc1234', repository: 'git@host:shop.git' }, platform(calls))
    expect(calls).toEqual([{ method: 'POST', path: '/api/projects/p%201/retrospec/reading', body: { commit: { sha: 'abc1234', repository: 'git@host:shop.git' } } }])
  })

  it('reports what the code says of each hand edit [criterion:23397c95]', async () => {
    const calls: Call[] = []
    const checks = [{ anchor: 'action:feat-orders:a1', says: 'other' as const, code: 'if (order.unpaid) cancel()', where: 'src/orders.ts:42' }]
    await reportRetrospecReadingHandler({ project_id: 'p1', checks }, platform(calls))
    expect(calls[0]).toEqual({ method: 'POST', path: '/api/projects/p1/retrospec/reading', body: { checks } })
  })

  it('says the prompt was received, with nothing else to report [criterion:a6f870af]', async () => {
    const calls: Call[] = []
    await reportRetrospecReadingHandler({ project_id: 'p1', received: true }, platform(calls))
    expect(calls).toEqual([{ method: 'POST', path: '/api/projects/p1/retrospec/reading', body: { received: true } }])
  })

  it('withdraws a rejected change that is not a change at all [criterion:eb132bbd]', async () => {
    const calls: Call[] = []
    await reportRetrospecReadingHandler({ project_id: 'p1', withdrawn: ['c1'] }, platform(calls))
    expect(calls).toEqual([{ method: 'POST', path: '/api/projects/p1/retrospec/reading', body: { withdrawn: ['c1'] } }])
  })

  it('reports the differences of a run that holds its changes, and says it read what it had to [criterion:50b00229]', async () => {
    const calls: Call[] = []
    const changes = [{ id: 'c1', kind: 'new' as const, dock: 'feature:orders', title: 'Refund', proposed: 'A paid order can be refunded' }]
    await reportRetrospecReadingHandler({ project_id: 'p1', changes, finished: true }, platform(calls))
    expect(calls).toEqual([{ method: 'POST', path: '/api/projects/p1/retrospec/reading', body: { changes, finished: true } }])
  })

  it('says what a validated change became [criterion:1aaa8316]', async () => {
    const calls: Call[] = []
    const written = [{ change: 'c1', elements: [{ anchor: 'action:orders:refund', title: 'Refund' }] }]
    await reportRetrospecReadingHandler({ project_id: 'p1', written }, platform(calls))
    expect(calls[0].body).toEqual({ written })
  })

  it('only reads where the run stands when it reports nothing', async () => {
    const calls: Call[] = []
    expect(await reportRetrospecReadingHandler({ project_id: 'p1', checks: [] }, platform(calls))).toEqual({ run: null, handEdits: [] })
    expect(calls).toEqual([{ method: 'GET', path: '/api/projects/p1/retrospec/reading' }])
  })
})
