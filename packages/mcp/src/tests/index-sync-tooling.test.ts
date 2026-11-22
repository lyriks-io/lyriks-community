// The index sync tooling (feat-100): the sync command handed with its own
// sign-in, the lookup of where index keys belong, the move of located lines,
// and the revision every write answers. A real MCP client drives the real
// gateway; the platform is a fake behind fetch that records what it was sent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeHttpService, PLATFORM_ORIGIN, connectAgent, reply, serveFetch } from './support/mcp-harness.js'
import { resolveAccessToken } from '../access-tokens.js'
import { issueIndexTicket } from '../index-ticket.js'
import { KEY_OWNERS_SEMANTICS, POSITIONS_SEMANTICS, SYNC_SEMANTICS, packKeyOwners } from '../tools/implementation.js'
import type { SelfInstallSource } from '../tools/skills.js'

const MCP_URL = 'https://lab.example/mcp'
let platform: FakeHttpService

beforeEach(() => {
  platform = new FakeHttpService(PLATFORM_ORIGIN)
  serveFetch(platform)
})
afterEach(() => vi.unstubAllGlobals())

/** The gateway as POST /mcp builds it, with what it hands the sync command. */
function gateway(indexTicket: SelfInstallSource['indexTicket']) {
  return connectAgent({ token: 'platform-session', selfInstall: { mcpUrl: MCP_URL, signIn: () => ({ token: null }), indexTicket } })
}

const CONFLICT = {
  message: 'The index of this project changed since revision 3: 1 of the units sent were written since by another sync or report (action:a1). Nothing was written. Read them back, keep what is still true, and send again with expected_revision 5.',
  expectedRevision: 3,
  currentRevision: 5,
  units: ['action:a1'],
  total: 1,
}

describe('hand out the sync command (action aa15bfce)', () => {
  it('hands the exact command, carrying a ticket for this project alone, where sign-in is enforced [criterion:2452b3d7]', async () => {
    platform.on('GET', '/api/behavior/implementation/index/revision', { projectId: 'p-shop', revision: 7 })
    const ticket = vi.fn((projectId: string) => issueIndexTicket('platform-session', 'user-1', projectId))
    const agent = await gateway(ticket)
    const answer = await agent.call('sync_implementation_index', { project_id: 'p-shop', command: true })
    expect(answer.isError).toBe(false)
    const handed = answer.json<{ command: string; ticket: string; expiresAt: string; revision: number; next: string }>()
    const token = /--token (\S+)$/.exec(handed.command)?.[1] ?? ''
    expect(handed.command).toBe(`node .lyriks/tools/sync-index.mjs --project p-shop --url ${MCP_URL} --token ${token}`)
    expect(handed).toMatchObject({ ticket: 'ticket', revision: 7 })
    expect(Date.parse(handed.expiresAt)).toBeGreaterThan(Date.now() + 11 * 3600_000)
    expect(resolveAccessToken(token)).toMatchObject({ scope: 'index-sync', projectId: 'p-shop', session: 'platform-session' })
    expect(handed.next).toContain('Run `command` as given')
    expect(handed.next).toContain('--since <commit>')
    // Asking for the command writes nothing: the platform was only asked who may write.
    expect(platform.requests.map((r) => `${r.method} ${r.url.pathname}`)).toEqual(['GET /api/behavior/implementation/index/revision'])
    expect(platform.requests[0].url.searchParams.get('projectId')).toBe('p-shop')
    await agent.close()
  })

  it('carries no ticket where the installation asks for no sign-in', async () => {
    platform.on('GET', '/api/behavior/implementation/index/revision', { projectId: 'p-shop', revision: 0 })
    const agent = await gateway(() => ({ token: null }))
    const handed = (await agent.call('sync_implementation_index', { project_id: 'p-shop', command: true })).json<{ command: string; ticket: string }>()
    expect(handed).toMatchObject({ command: `node .lyriks/tools/sync-index.mjs --project p-shop --url ${MCP_URL}`, ticket: 'none_needed' })
    await agent.close()
  })

  it('hands no command to a viewer [rule:010413db], nor to someone outside the workspace [rule:8999e3bd]', async () => {
    const ticket = vi.fn(() => ({ token: 'never' }))
    const agent = await gateway(ticket)
    platform.on('GET', '/api/behavior/implementation/index/revision', reply(403, { message: 'forbidden' }))
    const viewer = await agent.call('sync_implementation_index', { project_id: 'p-shop', command: true })
    expect(viewer.isError).toBe(true)
    expect(viewer.text).toContain('403')
    platform.on('GET', '/api/behavior/implementation/index/revision', reply(404, { message: 'Project not found' }))
    const outsider = await agent.call('sync_implementation_index', { project_id: 'p-shop', command: true })
    expect(outsider.isError).toBe(true)
    expect(outsider.text).toContain('Project not found')
    expect(ticket).not.toHaveBeenCalled()
    await agent.close()
  })
})

describe('find which feature and unit hold index keys (action af8d9001)', () => {
  const OWNERS = {
    projectId: 'p-shop',
    asked: 4,
    features: [
      { featureId: 'feat-cart', units: [{ unit: 'action:a1', keys: ['action:a1', 'rule:r1'] }, { unit: 'surface:s1', keys: ['surface:s1', 'state:cart.total'] }], alone: [] },
      { featureId: 'feat-pay', units: [{ unit: 'surface:s2', keys: ['surface:s2', 'state:cart.total', 'surface_rule:sr2'] }], alone: [] },
    ],
    orphans: ['rule:gone'],
  }

  it('reads the feature and the unit of every key, a shared state once per feature, a removed one as an orphan [criterion:60ba2862]', async () => {
    platform.on('POST', '/api/behavior/implementation/index/owners', OWNERS)
    const agent = await gateway(undefined)
    const keys = ['action:a1', 'rule:r1', 'state:cart.total', 'rule:gone']
    const answer = await agent.call('get_implementation_status', { project_id: 'p-shop', keys })
    expect(answer.isError).toBe(false)
    expect(answer.json()).toEqual({ ...OWNERS, semantics: KEY_OWNERS_SEMANTICS })
    expect(platform.requestsTo('POST', '/api/behavior/implementation/index/owners')[0].body).toEqual({ projectId: 'p-shop', keys })
    // No feature had to be read first.
    expect(platform.requests).toHaveLength(1)
    await agent.close()
  })

  it('still reads one feature when no keys are asked, and asks for one of the two', async () => {
    platform.on('GET', '/api/behavior/implementation/status', { available: true, ok: true, featureId: 'feat-cart', revision: 4 })
    const agent = await gateway(undefined)
    expect((await agent.call('get_implementation_status', { project_id: 'p-shop', feature_id: 'feat-cart' })).json()).toMatchObject({ featureId: 'feat-cart', revision: 4 })
    const neither = await agent.call('get_implementation_status', { project_id: 'p-shop' })
    expect(neither.isError).toBe(true)
    expect(neither.text).toContain('feature_id is required (or keys')
    await agent.close()
  })

  it('answers whole keys while they fit and names the rest, never a unit cut in half [criterion:25196523]', () => {
    const unit = (i: number) => ({ unit: `surface:s${i}`, keys: [`surface:s${i}`, 'state:shared', ...Array.from({ length: 40 }, (_, j) => `state:s${i}.field${j}`)] })
    const answer = {
      projectId: 'p-shop',
      asked: 3,
      features: Array.from({ length: 30 }, (_, i) => ({ featureId: `feat-${i}`, units: [unit(i)], alone: i === 0 ? ['criterion:c1'] : [] })),
      orphans: ['rule:gone'],
    }
    // One key every feature declares outweighs the cap alone: it is answered whole all the same.
    const first = packKeyOwners(answer, ['state:shared', 'criterion:c1', 'rule:gone'], 4000) as Record<string, unknown> & { features: Array<{ units: Array<{ keys: string[] }> }>; remainingKeys: string[] }
    expect(first.answered).toBe(1)
    expect(first.features).toHaveLength(30)
    expect(first.features.every((row) => row.units[0].keys.length === 42)).toBe(true)
    expect(first.remainingKeys).toEqual(['criterion:c1', 'rule:gone'])
    // Asked again, the rest fits.
    const rest = packKeyOwners({ ...answer, features: [{ featureId: 'feat-0', units: [], alone: ['criterion:c1'] }] }, first.remainingKeys, 4000) as Record<string, unknown>
    expect(rest).toMatchObject({ orphans: ['rule:gone'], features: [{ featureId: 'feat-0', alone: ['criterion:c1'] }] })
    expect(rest.remainingKeys).toBeUndefined()
  })
})

describe('a key an open request adds (criterion a501859a)', () => {
  const HELD = {
    projectId: 'p-shop',
    asked: 3,
    features: [{ featureId: 'feat-cart', units: [{ unit: 'action:a1', keys: ['action:a1', 'rule:r1'] }], alone: [] }],
    requests: [{ requestId: 'req-7', draftId: 'd-cart', units: [{ unit: 'action:a1', keys: ['action:a1', 'rule:r1', 'rule:r-new'] }], alone: ['criterion:ac-leaf-c9'] }],
    orphans: ['rule:gone'],
  }

  it('comes back with its request, its draft and the unit the draft places it in; nothing else is an orphan [criterion:a501859a]', async () => {
    platform.on('POST', '/api/behavior/implementation/index/owners', HELD)
    const agent = await gateway(undefined)
    const answer = await agent.call('get_implementation_status', { project_id: 'p-shop', keys: ['rule:r-new', 'criterion:ac-leaf-c9', 'rule:gone'] })
    expect(answer.json()).toEqual({ ...HELD, semantics: KEY_OWNERS_SEMANTICS })
    await agent.close()
  })

  it('is packed like a key a feature declares, whole with the draft unit, when the answer must be cut [criterion:a501859a] [criterion:25196523]', () => {
    const packed = packKeyOwners(HELD, ['rule:r-new', 'criterion:ac-leaf-c9', 'rule:gone'], 900) as Record<string, unknown>
    expect(packed.answered).toBe(1)
    expect(packed.requests).toEqual([{ requestId: 'req-7', draftId: 'd-cart', units: [HELD.requests[0].units[0]], alone: [] }])
    expect(packed.features).toEqual([])
    expect(packed.remainingKeys).toEqual(['criterion:ac-leaf-c9', 'rule:gone'])
  })
})

describe('update where located elements now stand (action f20cf75e)', () => {
  it('sends the entries as places only, with the revision expected, and reads the counters with their meaning [criterion:e9699cc6]', async () => {
    const moved = { available: true, ok: false, positionsOnly: true, sent: 2, moved: 1, units: { total: 1, entries: ['action:a1'] }, notLocated: { total: 1, entries: ['rule:new'] }, orphans: { total: 0, entries: [] }, failedAcks: [], revision: 6 }
    platform.on('POST', '/api/behavior/implementation/index/positions', moved)
    const agent = await gateway(undefined)
    const index = { 'rule:r1': { file: 'src/a.ts', line: 12, signature: 'x' }, 'rule:new': { file: 'src/a.ts', line: 30, signature: 'y' } }
    const answer = await agent.call('sync_implementation_index', { project_id: 'p-shop', index, positions_only: true, expected_revision: 5 })
    expect(answer.json()).toEqual({ ...moved, semantics: POSITIONS_SEMANTICS })
    expect(platform.requestsTo('POST', '/api/behavior/implementation/index/positions')[0].body).toEqual({ projectId: 'p-shop', index, expectedRevision: 5 })
    // Nothing went through the sync that replaces reports.
    expect(platform.requestsTo('POST', '/api/behavior/implementation/index')).toHaveLength(0)
    await agent.close()
  })
})

describe('the revision of the index (criteria fbe61ab1 and 93abb7df)', () => {
  it('relays the revision a sync leaves, says what it means, and sends the expected one back [criterion:fbe61ab1]', async () => {
    platform.on('POST', '/api/behavior/implementation/index', { available: true, ok: true, synced: 1, successes: 1, failures: 0, skipped: 0, acks: [], revision: 9 })
    const agent = await gateway(undefined)
    const answer = (await agent.call('sync_implementation_index', { project_id: 'p-shop', index: { 'action:a1': {} }, expected_revision: 8 })).json<Record<string, unknown>>()
    expect(answer.revision).toBe(9)
    expect((answer.semantics as Record<string, string>).revision).toBe(SYNC_SEMANTICS.revision)
    expect(platform.requestsTo('POST', '/api/behavior/implementation/index')[0].body).toEqual({ projectId: 'p-shop', index: { 'action:a1': {} }, expectedRevision: 8 })
    // Without one, the write is sent as it always was.
    await agent.call('sync_implementation_index', { project_id: 'p-shop', index: { 'action:a1': {} } })
    expect(platform.requestsTo('POST', '/api/behavior/implementation/index')[1].body).toEqual({ projectId: 'p-shop', index: { 'action:a1': {} } })
    await agent.close()
  })

  it('reads a sync refused where it overlaps as an answer naming the units and the current revision [criterion:93abb7df]', async () => {
    platform.on('POST', '/api/behavior/implementation/index', reply(409, CONFLICT))
    const agent = await gateway(undefined)
    const answer = await agent.call('sync_implementation_index', { project_id: 'p-shop', index: { 'action:a1': {} }, expected_revision: 3 })
    expect(answer.isError).toBe(false)
    expect(answer.json()).toEqual({ ok: false, refused: 'revision', ...CONFLICT })
    await agent.close()
  })

  it('sends a report with its expected revision and reads its refusal the same way [rule:fc406a24]', async () => {
    platform.on('POST', '/api/behavior/implementation/status', reply(409, CONFLICT))
    const agent = await gateway(undefined)
    const answer = await agent.call('report_implementation_status', { project_id: 'p-shop', feature_id: 'feat-cart', action_id: 'a1', found_entities: [], expected_revision: 3 })
    expect(answer.json()).toEqual({ ok: false, refused: 'revision', ...CONFLICT })
    expect(platform.requestsTo('POST', '/api/behavior/implementation/status')[0].body).toMatchObject({ projectId: 'p-shop', featureId: 'feat-cart', actionId: 'a1', expectedRevision: 3 })
    // Another 409 (a feature id two projects share) stays the error it was.
    platform.on('POST', '/api/behavior/implementation/status', reply(409, { message: 'Feature id "feat-cart" is also stored by p-other.' }))
    const clash = await agent.call('report_implementation_status', { project_id: 'p-shop', feature_id: 'feat-cart', action_id: 'a1', found_entities: [] })
    expect(clash.isError).toBe(true)
    expect(clash.text).toContain('also stored by p-other')
    await agent.close()
  })
})
