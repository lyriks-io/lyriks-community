/**
 * Tests: a failed HTTP answer becomes a short error. A thrown error does not
 * pass through capResult, so the message itself has to stay small: a 404 on a
 * route an older platform lacks used to relay its whole error page.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { LyriksClient } from '../lyriks-client.js'
import { applyEvolutionBatchHandler } from '../tools/evolution.js'
import { HttpStatusError, errorDetail } from '../util/http-error.js'

const page = `<!doctype html><html><head><title>404</title><style>body{color:red}.x{margin:0}</style>
<script>window.__sveltekit = {${'"k":"v",'.repeat(20000)}}</script></head>
<body><div class="error">  <h1>404</h1>\n\n<p>Not   Found</p></div>${'<p>filler paragraph</p>'.repeat(2000)}</body></html>`

describe('errorDetail', () => {
  it('reduces a web page to its first words and says what a page means', () => {
    const detail = errorDetail(page, 'text/html; charset=utf-8', 404)
    expect(page.length).toBeGreaterThan(140000)
    expect(detail.length).toBeLessThanOrEqual(500)
    expect(detail.startsWith('404 404 Not Found filler paragraph')).toBe(true)
    expect(detail).not.toMatch(/[<>]|__sveltekit|color:red/)
    expect(detail).toContain('the platform answered with a web page, so this route probably does not exist on this platform version')
  })

  it('recognizes a page by its first character, whatever the content type says', () => {
    expect(errorDetail('  <html><body>Bad gateway</body></html>', 'application/json', 404)).toContain('Bad gateway [the platform answered with a web page')
    expect(errorDetail('<html><body>Bad gateway</body></html>', 'text/html', 502)).toBe('Bad gateway [the platform answered with a web page instead of JSON]')
  })

  it('prefers the message or error of a JSON body', () => {
    expect(errorDetail('{"message":"unknown section \\"x\\""}', 'application/json')).toBe('unknown section "x"')
    expect(errorDetail('{"error":"not a member"}', 'application/json')).toBe('not a member')
    expect(errorDetail('{"error":{"code":"FORBIDDEN","message":"not yours"}}', null)).toBe('not yours')
    expect(errorDetail('{"data":null,"errors":[{"code":"NOT_FOUND","message":"project not found","field":null}]}', 'application/json')).toBe('project not found')
    expect(errorDetail(JSON.stringify({ message: 'm'.repeat(3000) }), 'application/json')).toHaveLength(500)
  })

  it('keeps what a JSON error says beside its sentence, with more room than prose gets', () => {
    const issues = { message: 'Validation failed', issues: [{ path: 'journeys.0.steps', problem: 'unknown screen id scr-9' }] }
    expect(errorDetail(JSON.stringify(issues), 'application/json')).toBe(JSON.stringify(issues))
    // An envelope that only restates the failure is still reduced to its sentence.
    expect(errorDetail('{"message":"Feature not found in project","status":404}', 'application/json')).toBe('Feature not found in project')
  })

  it('caps a JSON body at 2,000 characters and any other text at 500', () => {
    const refusal = JSON.stringify({ ok: false, results: Array.from({ length: 200 }, (_, i) => ({ index: i, summary: 'refused' })) })
    expect(errorDetail(refusal, 'application/json').length).toBe(2000)
    expect(errorDetail(refusal, 'application/json').startsWith('{"ok":false,"results":[')).toBe(true)
    const plain = errorDetail(`Behavior   engine\n\nunavailable ${'x'.repeat(5000)}`, 'text/plain')
    expect(plain.startsWith('Behavior engine unavailable xxx')).toBe(true)
    expect(plain).toHaveLength(500)
    expect(plain.endsWith('...')).toBe(true)
    expect(errorDetail('not a member', 'text/plain')).toBe('not a member')
    expect(errorDetail('', null)).toBe('')
  })
})

describe('LyriksClient errors', () => {
  afterEach(() => vi.unstubAllGlobals())
  const respond = (body: string, status: number, type: string) => new Response(body, { status, headers: { 'content-type': type } })

  it('throws a short error for a missing route, with the raw body kept aside', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(page, 404, 'text/html')))
    const err = await new LyriksClient().post('/api/sections/validate', {}).catch((e: unknown) => e) as HttpStatusError
    expect(err).toBeInstanceOf(HttpStatusError)
    expect(err.message.startsWith('lyriks 404 on POST /api/sections/validate: 404 404 Not Found')).toBe(true)
    expect(err.message.length).toBeLessThan(600)
    expect(err).toMatchObject({ status: 404, body: page })
  })

  it('keeps the message format the callers match on', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond('{"message":"unknown section \\"x\\""}', 400, 'application/json')))
    await expect(new LyriksClient().get('/api/sections?section=x')).rejects.toThrow('lyriks 400 on GET /api/sections?section=x: unknown section "x"')
  })

  it('still retries the dev server typegen race once, reading the raw text', async () => {
    const race = `<html><body>Error: ENOENT: no such file, open '.svelte-kit/types/proxy+server.ts' ${'x'.repeat(3000)}</body></html>`
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(race, 500, 'text/html'))
      .mockResolvedValueOnce(respond('{"ok":true}', 200, 'application/json'))
    vi.stubGlobal('fetch', fetchMock)
    expect(await new LyriksClient().get('/api/projects')).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    fetchMock.mockReset().mockImplementation(async () => respond(race, 500, 'text/html'))
    const err = await new LyriksClient().get('/api/projects').catch((e: unknown) => e) as Error
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(err.message).toContain('already retried once')
    expect(err.message.length).toBeLessThan(600)
  })

  it('lets a refused evolution batch through whole, however long its body', async () => {
    const body = { ok: false, applied: false, results: Array.from({ length: 80 }, (_, i) => ({ index: i, op: 'propose', ok: false, summary: `Operation ${i} is refused because the field is frozen.` })) }
    expect(JSON.stringify(body).length).toBeGreaterThan(500)
    vi.stubGlobal('fetch', vi.fn(async () => respond(JSON.stringify(body), 422, 'application/json')))
    const answer = await applyEvolutionBatchHandler({ project_id: 'p', operations: [{ op: 'propose' }] }, new LyriksClient()) as Record<string, unknown>
    expect(answer).toEqual({ ...body, httpStatus: 422 })
  })
})
