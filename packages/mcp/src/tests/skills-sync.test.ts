import { afterEach, expect, it, vi } from 'vitest'
import { createMcpServer } from '../server.js'
import { syncSkillsHandler } from '../tools/skills.js'
import { RESULT_CAP } from '../util/shape.js'
import type { LyriksClient } from '../lyriks-client.js'

afterEach(() => vi.unstubAllGlobals())

it('forwards selective skill reads without changing the legacy default', async () => {
  const post = vi.fn().mockResolvedValue({ skills: [] })
  const client = { post } as unknown as LyriksClient
  await syncSkillsHandler({ client: 'codex', skill_ids: ['lyriks-build'], include_content: false }, client)
  expect(post).toHaveBeenLastCalledWith('/api/skills/sync', expect.objectContaining({ skillIds: ['lyriks-build'], includeContent: false }))
  await syncSkillsHandler({}, client)
  expect(post.mock.calls[1][1]).not.toHaveProperty('skillIds')
  expect(post.mock.calls[1][1]).not.toHaveProperty('includeContent')
})

// The helper scripts the platform ships under `binding.tools` are installed
// verbatim: one dropped character and a script no longer runs.
const script = (name: string) => `#!/usr/bin/env node\n// ${name}\nimport { loadIndexFile } from './index-file.mjs';\n${'console.log("a line of a real script, long enough to weigh");\n'.repeat(400)}`
const bindingAnswer = () => ({
  skills: [],
  unknown: [],
  binding: {
    targets: [{ client: 'claude', pointerPath: 'CLAUDE.md', pointerBlock: '<!-- lyriks-binding -->' }],
    tools: ['check-index.mjs', 'sync-index.mjs', 'apply-batch.mjs'].map((file) => ({
      path: `.lyriks/tools/${file}`, content: script(file), contentHash: 'fnv1a-0badc0de', purpose: `node .lyriks/tools/${file}`,
    })),
  },
})

it('relays the binding and its helper scripts exactly as the platform sent them', async () => {
  const answer = bindingAnswer()
  const client = { post: vi.fn().mockResolvedValue(answer) } as unknown as LyriksClient
  expect(await syncSkillsHandler({ client: 'claude', project_id: 'p' }, client)).toBe(answer)
})

it('delivers each script whole through the registered tool, far past the response cap', async () => {
  const answer = bindingAnswer()
  expect(JSON.stringify(answer).length).toBeGreaterThan(RESULT_CAP * 2)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } })))
  // @ts-expect-error calling the registered tool the way the SDK would
  const tool = createMcpServer(null)._registeredTools.sync_skills as { handler: (a: unknown, extra: unknown) => Promise<{ content: { text: string }[] }> }
  const out = JSON.parse((await tool.handler({ client: 'claude' }, {})).content[0].text)
  // A capped answer would come back as { _capped, partial }: a script cut short installs broken.
  expect(out._capped).toBeUndefined()
  expect(out.binding.tools).toEqual(answer.binding.tools)
})

it('tells agents to install the helper scripts, as a fifth step after the four it already listed', () => {
  // @ts-expect-error testing the registered description
  const { description } = createMcpServer(null)._registeredTools.sync_skills as { description: string }
  const at = ['(1)', '(2)', '(3)', '(4)', '(5)'].map((step) => description.indexOf(step))
  expect(at.every((position) => position > 0)).toBe(true)
  expect([...at].sort((a, b) => a - b)).toEqual(at)
  const step = description.slice(at[4])
  expect(step).toContain('`binding.tools`')
  expect(step).toContain('write `content` VERBATIM to `path` (create directories as needed)')
  expect(step).toContain('the same list for every runtime')
  expect(step).toContain('since they import each other')
  expect(step).toContain('syncing an index or applying a batch too large to type as a tool argument, and checking the index by signature text instead of by exact line')
  expect(step).toContain('an older platform sends none')
})

// A catalog is several playbooks of 10 to 40 KB: sent whole, one sync answer
// runs past the ceiling of several clients and the session loses the one call
// that installs the guides.
it('keeps whole guides while they fit the budget and defers the rest', async () => {
  const guide = (id: string, size: number) => ({ id, name: id, status: 'new', installContent: 'x'.repeat(size) })
  const answer = { skills: [guide('lyriks-build', 600), guide('lyriks-design', 600), guide('lyriks-behavior', 600)], unknown: [] }
  const client = { post: vi.fn().mockResolvedValue(answer) } as unknown as LyriksClient
  const capped = (await syncSkillsHandler({ client: 'claude' }, client, 1000)) as {
    skills: Array<{ id: string; installContent?: string; contentDeferred?: boolean }>
    deferredForSize: string[]
    note: string
  }
  expect(capped.skills[0].installContent).toHaveLength(600)
  expect(capped.skills[1].installContent).toBeUndefined()
  expect(capped.skills[1].contentDeferred).toBe(true)
  expect(capped.deferredForSize).toEqual(['lyriks-design', 'lyriks-behavior'])
  expect(capped.note).toContain('get_skill')
})

it('leaves an answer that fits exactly as the platform sent it', async () => {
  const answer = { skills: [{ id: 'lyriks-build', status: 'new', installContent: 'short' }], unknown: [] }
  const client = { post: vi.fn().mockResolvedValue(answer) } as unknown as LyriksClient
  expect(await syncSkillsHandler({ client: 'claude' }, client, 1000)).toBe(answer)
})
