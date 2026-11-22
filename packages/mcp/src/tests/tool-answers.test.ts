/**
 * Tests: what an agent reads back when a tool's answer is too big or the
 * platform fails, on the path every tool shares (the JSON wrapper of
 * server.ts, the result cap, the HTTP error of the platform client).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeHttpService, PLATFORM_ORIGIN, connectAgent, reply, serveFetch, type ConnectedAgent } from './support/mcp-harness.js'
import { CAP_HINTS } from '../util/cap-hints.js'
import { RESULT_CAP } from '../util/shape.js'

let platform: FakeHttpService
let agent: ConnectedAgent

beforeEach(async () => {
  platform = new FakeHttpService(PLATFORM_ORIGIN)
  serveFetch(platform)
  agent = await connectAgent()
})

afterEach(async () => {
  await agent.close()
  vi.unstubAllGlobals()
})

describe('an answer an agent can afford', () => {
  it('shortens an oversize answer and says how to narrow it, with the arguments of that tool', async () => {
    const screens = Array.from({ length: 400 }, (_, i) => ({ id: `scr-${i}`, name: `Screen ${i}`, purpose: 'p'.repeat(300) }))
    platform.on('GET', '/api/sections', { draft: { screens }, revision: 3 })

    const answer = await agent.call('get_section', { project_id: 'shop', section: 'experience' })

    expect(answer.isError).toBe(false)
    expect(JSON.stringify(screens).length).toBeGreaterThan(RESULT_CAP * 4)
    expect(answer.text.length).toBeLessThanOrEqual(RESULT_CAP)
    expect(answer.json()).toMatchObject({ _capped: true, hint: CAP_HINTS.get_section.text })
  })

  it('turns a web page the platform answers in place of JSON into a short error that says what it means', async () => {
    const page = `<!doctype html><html><body><h1>404</h1><p>Not found</p>${'<p>filler</p>'.repeat(20000)}</body></html>`
    platform.on('GET', '/api/behavior/project', reply(404, page, 'text/html'))

    const answer = await agent.call('get_behavior_project', { project_id: 'shop' })

    expect(answer.isError).toBe(true)
    expect(page.length).toBeGreaterThan(200_000)
    expect(answer.text.length).toBeLessThan(700)
    expect(answer.text).toContain('lyriks 404 on GET /api/behavior/project?projectId=shop')
    expect(answer.text).toContain('this route probably does not exist on this platform version')
  })
})

describe('the advisories a section save answers', () => {
  it('shows them once, then says they are unchanged until they change, section by section', async () => {
    let issues = ['1 Core(s) have no Journey yet']
    platform.on('GET', '/api/sections', { draft: {} })
    for (const section of ['glossary', 'rules']) platform.on('PUT', `/api/draft/${section}`, () => ({ ok: true, coherenceIssues: issues }))
    const save = async (section: string) =>
      (await agent.call('patch_section', { project_id: 'dedupe-shop', section, operations: [{ op: 'set', path: 'note', value: 'x' }] })).json()

    expect(await save('glossary')).toMatchObject({ coherenceIssues: issues })
    const repeated = await save('glossary')
    expect(repeated).not.toHaveProperty('coherenceIssues')
    expect(repeated.coherenceIssuesUnchanged).toContain('1 advisory(ies) unchanged since the previous write')
    // Another section has not shown them yet.
    expect(await save('rules')).toMatchObject({ coherenceIssues: issues })

    issues = ['1 Core(s) have no Journey yet', 'A screen has no journey step']
    expect(await save('glossary')).toMatchObject({ coherenceIssues: issues })
    const shown = issues
    issues = []
    await save('glossary')
    issues = shown
    // Cleared in between, the same advisories are news again.
    expect(await save('glossary')).toMatchObject({ coherenceIssues: shown })
  })
})
