import { afterEach, expect, it, vi } from 'vitest'
import { createMcpServer } from '../server.js'
import { SELF_INSTALL_SCRIPTS, SKILL_SYNC_CONTENT_CAP, fitGuideAnswer, getSkillHandler, selfInstallCommand, syncSkillsHandler } from '../tools/skills.js'
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

it('relays the binding and its helper scripts exactly as the platform sent them when they fit', async () => {
  const answer = bindingAnswer()
  const client = { post: vi.fn().mockResolvedValue(answer) } as unknown as LyriksClient
  expect(await syncSkillsHandler({ client: 'claude', project_id: 'p' }, client, 200000)).toBe(answer)
})

it('delivers each script whole or deferred through the registered tool, never cut', async () => {
  const answer = bindingAnswer()
  expect(JSON.stringify(answer).length).toBeGreaterThan(RESULT_CAP * 2)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } })))
  // @ts-expect-error calling the registered tool the way the SDK would
  const tool = createMcpServer(null)._registeredTools.sync_skills as { handler: (a: unknown, extra: unknown) => Promise<{ content: { text: string }[] }> }
  const text = (await tool.handler({ client: 'claude' }, {})).content[0].text
  const out = JSON.parse(text)
  // A capped answer would come back as { _capped, partial }: a script cut short installs broken.
  expect(out._capped).toBeUndefined()
  expect(text.length).toBeLessThanOrEqual(SKILL_SYNC_CONTENT_CAP)
  for (const [i, sent] of answer.binding.tools.entries()) {
    const got = out.binding.tools[i]
    // A deferred script keeps its path and hash; its purpose comes back with its content.
    if (got.deferred) expect(got).toEqual({ path: sent.path, contentHash: sent.contentHash, deferred: true })
    else expect(got).toEqual(sent)
  }
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
  const answer = { skills: [guide('lyriks-build', 6000), guide('lyriks-design', 6000), guide('lyriks-behavior', 6000)], unknown: [] }
  const client = { post: vi.fn().mockResolvedValue(answer) } as unknown as LyriksClient
  const capped = (await syncSkillsHandler({ client: 'claude' }, client, 9000)) as {
    skills: Array<{ id: string; installContent?: string; contentDeferred?: boolean }>
    deferredForSize: string[]
    note: string
  }
  expect(capped.skills[0].installContent).toHaveLength(6000)
  expect(sizeOf(capped)).toBeLessThanOrEqual(9000)
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

// The helper scripts ride along on every sync; a client that already holds them
// says so, and gets back only what changed.
it('forwards installed_tools as installedTools, and sends nothing when the client says nothing', async () => {
  const post = vi.fn().mockResolvedValue({ skills: [] })
  const client = { post } as unknown as LyriksClient
  await syncSkillsHandler({
    client: 'claude',
    installed_tools: [
      { path: '.lyriks/tools/sync-index.mjs', content_hash: '1a2b3c4d' },
      { path: '.claude/hooks/lyriks-bound-prompt.mjs' },
    ],
  }, client)
  expect(post.mock.calls[0][1].installedTools).toEqual([
    { path: '.lyriks/tools/sync-index.mjs', contentHash: '1a2b3c4d' },
    { path: '.claude/hooks/lyriks-bound-prompt.mjs', contentHash: undefined },
  ])
  await syncSkillsHandler({ client: 'claude' }, client)
  expect(post.mock.calls[1][1]).not.toHaveProperty('installedTools')
})

it('declares installed_tools and tells agents how to read the hash each installed file carries', () => {
  // @ts-expect-error testing the registered tool
  const tool = createMcpServer(null)._registeredTools.sync_skills as { description: string; inputSchema: { shape: Record<string, unknown> } }
  expect(tool.inputSchema.shape).toHaveProperty('installed_tools')
  expect(tool.description).toContain('`installed_tools`')
  expect(tool.description).toContain('`// contentHash: <hash>` line')
  expect(tool.description).toContain('`.claude/hooks/lyriks-bound-prompt.mjs`')
  expect(tool.description).toContain('`unchanged: true` has no `content`')
  expect(tool.description).toContain('Omit `installed_tools` and every file comes back with its content')
})

it('relays an unchanged helper as the platform sent it, without content', async () => {
  const answer = {
    skills: [],
    unknown: [],
    binding: { targets: [], tools: [{ path: '.lyriks/tools/sync-index.mjs', contentHash: '1a2b3c4d', unchanged: true, purpose: 'node .lyriks/tools/sync-index.mjs' }] },
  }
  const client = { post: vi.fn().mockResolvedValue(answer) } as unknown as LyriksClient
  expect(await syncSkillsHandler({ installed_tools: [{ path: '.lyriks/tools/sync-index.mjs', content_hash: '1a2b3c4d' }] }, client)).toBe(answer)
})

// Field run 2026-10-27 (criterion 526377e2): a metadata-only sync of a fresh
// repository answered 90,854 characters, 74,000 of them helper scripts that no
// budget counted, and Claude Code refused the whole answer.
const realisticAnswer = () => ({
  skills: ['lyriks-build', 'lyriks-design', 'lyriks-behavior', 'lyriks-retrospec', 'lyriks-delivery', 'lyriks-evolution'].map((id, i) => ({
    id, name: id, description: 'd'.repeat(500), contentHash: 'abc', status: 'new', installPath: `.claude/skills/${id}/SKILL.md`,
    installTargets: [{ client: 'claude', label: 'Claude Code', path: `.claude/skills/${id}/SKILL.md` }],
    installContent: `---\nname: ${id}\n---\n${'A "quoted" line of a real guide, long enough to weigh.\n'.repeat([640, 120, 500, 400, 420, 500][i])}`,
  })),
  unknown: [],
  binding: {
    projectId: 'kutt-c76982',
    targets: [{ client: 'claude', pointerPath: 'CLAUDE.md', pointerBlock: 'b'.repeat(4000), hook: { path: '.claude/hooks/lyriks-bound-prompt.mjs', content: 'h'.repeat(7000) } }],
    tools: Array.from({ length: 11 }, (_, i) => ({
      path: `.lyriks/tools/script-${i}.mjs`, contentHash: `h${i}`, purpose: 'p',
      content: `#!/usr/bin/env node\n${'console.log("a line of a real script");\n'.repeat(160)}`,
    })),
  },
})

const sizeOf = (x: unknown) => JSON.stringify(x).length

it('keeps a metadata-only sync under the budget by deferring every script too', async () => {
  const answer = realisticAnswer()
  for (const s of answer.skills) delete (s as { installContent?: string }).installContent
  expect(sizeOf(answer)).toBeGreaterThan(SKILL_SYNC_CONTENT_CAP)
  const client = { post: vi.fn().mockResolvedValue(answer) } as unknown as LyriksClient
  const out = (await syncSkillsHandler({ client: 'claude', include_content: false }, client)) as {
    binding: { tools: Array<{ content?: string; deferred?: boolean }>; targets: unknown[] }
    deferredScripts: string[]
    note: string
  }
  expect(sizeOf(out)).toBeLessThanOrEqual(SKILL_SYNC_CONTENT_CAP)
  expect(out.binding.tools.every((t) => t.deferred === true && t.content === undefined)).toBe(true)
  // The hook waits like the scripts: it comes back, and is wired, with its content.
  expect(out.deferredScripts).toHaveLength(12)
  expect(out.deferredScripts).toContain('.claude/hooks/lyriks-bound-prompt.mjs')
  const [target] = out.binding.targets as Array<{ pointerBlock: string; hook: { path: string; deferred?: boolean; content?: string } }>
  expect(target.pointerBlock).toBe(answer.binding.targets[0].pointerBlock)
  expect(target.hook).toEqual({ path: '.claude/hooks/lyriks-bound-prompt.mjs', deferred: true })
  expect(out.note).toContain('installed_tools')
})

it('brings a fresh full sync home in several answers, each under the budget, every file whole', async () => {
  const full = realisticAnswer()
  expect(sizeOf(full)).toBeGreaterThan(SKILL_SYNC_CONTENT_CAP * 2)
  const held = new Map<string, string>()
  const heldTools = new Map<string, string>()
  for (let call = 0; call < 12 && (held.size < full.skills.length || heldTools.size < full.binding.tools.length); call++) {
    // A guide too large to ride beside the others comes alone, as the note says (get_skill).
    const before = held.size
    // The platform answers with what the client does not hold yet.
    const answer = {
      ...full,
      skills: full.skills.map((s) => (held.has(s.id) ? (({ installContent: _c, ...rest }) => ({ ...rest, status: 'up-to-date' }))(s) : s)),
      binding: { ...full.binding, tools: full.binding.tools.map((t) => (heldTools.has(t.path) ? (({ content: _c, ...rest }) => ({ ...rest, unchanged: true }))(t) : t)) },
    }
    const client = { post: vi.fn().mockResolvedValue(answer) } as unknown as LyriksClient
    const out = (await syncSkillsHandler({ client: 'claude' }, client)) as typeof full
    expect(sizeOf(out)).toBeLessThanOrEqual(SKILL_SYNC_CONTENT_CAP)
    for (const s of out.skills) if (typeof s.installContent === 'string') held.set(s.id, s.installContent)
    for (const t of out.binding.tools) if (typeof t.content === 'string') heldTools.set(t.path, t.content)
    if (held.size > before) continue
    for (const id of (out as { deferredForSize?: string[] }).deferredForSize ?? []) {
      const { installContent: _c, ...stub } = full.skills.find((s) => s.id === id)!
      const get = vi.fn().mockResolvedValue({ ...stub, content: full.skills.find((s) => s.id === id)!.installContent, installContent: full.skills.find((s) => s.id === id)!.installContent })
      const alone = (await getSkillHandler({ skill_id: id, client: 'claude' }, { get } as unknown as LyriksClient)) as { installContent: string }
      expect(sizeOf(alone)).toBeLessThanOrEqual(SKILL_SYNC_CONTENT_CAP)
      held.set(id, alone.installContent)
    }
  }
  for (const s of full.skills) expect(held.get(s.id)).toBe(s.installContent)
  for (const t of full.binding.tools) expect(heldTools.get(t.path)).toBe(t.content)
})

it('answers get_skill with one copy of the guide', async () => {
  const guide = 'x'.repeat(30000)
  const get = vi.fn().mockResolvedValue({ id: 'lyriks-build', content: guide, installContent: `contentHash: 1\n${guide}`, installTargets: [] })
  const out = (await getSkillHandler({ skill_id: 'lyriks-build' }, { get } as unknown as LyriksClient)) as Record<string, unknown>
  expect(out).not.toHaveProperty('content')
  expect(out.installContent).toBe(`contentHash: 1\n${guide}`)
  const legacy = { id: 'old', content: guide }
  get.mockResolvedValueOnce(legacy)
  expect(await getSkillHandler({ skill_id: 'old' }, { get } as unknown as LyriksClient)).toBe(legacy)
})

// Owner request 2026-11-05 (criteria 526377e2 and 3f42911b): Claude Code takes an
// MCP answer without counting it only up to 50,000 characters, and refused a
// 59,056-character sync; installing through tool answers alone cost an agent
// about 250,000 tokens.
it('keeps every skill answer under 45,000 characters, below what Claude Code accepts unchecked [criterion:526377e2]', () => {
  expect(SKILL_SYNC_CONTENT_CAP).toBe(45000)
  expect(SKILL_SYNC_CONTENT_CAP).toBeLessThan(50000)
})

const withInstaller = () => {
  const answer = realisticAnswer()
  const installer = SELF_INSTALL_SCRIPTS.map((path) => ({ path, contentHash: 'i', purpose: 'p', content: `// ${path}\n${'x'.repeat(5000)}` }))
  return { ...answer, binding: { ...answer.binding, tools: [...answer.binding.tools, ...installer] } }
}
const source = (token: string | null = 'lyriks_mcp_ticket') => ({
  mcpUrl: 'https://studio.example/mcp',
  signIn: vi.fn(() => ({ token, expiresAt: '2026-11-05T12:10:00.000Z' })),
})
type Out = { selfInstall?: { command: string; expiresAt?: string }; note?: string; skills: Array<{ installContent?: string }>; binding: { tools: Array<{ path: string; content?: string }> } }

it('sends the installer first and offers the command that installs the rest from the disk [criterion:3f42911b]', async () => {
  const client = { post: vi.fn().mockResolvedValue(withInstaller()) } as unknown as LyriksClient
  const from = source()
  const out = (await syncSkillsHandler({ client: 'claude', project_id: 'kutt-c76982' }, client, undefined, from)) as Out
  expect(sizeOf(out)).toBeLessThanOrEqual(SKILL_SYNC_CONTENT_CAP)
  for (const path of SELF_INSTALL_SCRIPTS) expect(out.binding.tools.find((t) => t.path === path)!.content).toBeDefined()
  expect(out.selfInstall).toEqual({
    command: 'node .lyriks/tools/sync-skills.mjs --url https://studio.example/mcp --client claude --project kutt-c76982 --token lyriks_mcp_ticket',
    expiresAt: '2026-11-05T12:10:00.000Z',
  })
  expect(out.note).toContain('run selfInstall.command')
  expect(out.note).toContain(`write ${SELF_INSTALL_SCRIPTS.join(', ')} from this answer`)
  expect(from.signIn).toHaveBeenCalledTimes(1)
})

it('with self_install:true carries the installer alone, so the answer stays small [criterion:3f42911b]', async () => {
  const client = { post: vi.fn().mockResolvedValue(withInstaller()) } as unknown as LyriksClient
  const out = (await syncSkillsHandler({ client: 'claude', self_install: true }, client, undefined, source())) as Out
  expect(out.skills.every((s) => s.installContent === undefined)).toBe(true)
  expect(out.binding.tools.filter((t) => t.content).map((t) => t.path)).toEqual([...SELF_INSTALL_SCRIPTS])
  expect(sizeOf(out)).toBeLessThan(40000)
  expect(out.selfInstall!.command).toContain('sync-skills.mjs')
})

it('offers no command when everything is current, when the platform ships no installer, or to the installer itself', async () => {
  const current = { skills: [{ id: 'lyriks-build', name: 'lyriks-build', contentHash: 'a', status: 'up-to-date' }], unknown: [], binding: { targets: [], tools: SELF_INSTALL_SCRIPTS.map((path) => ({ path, contentHash: 'i', unchanged: true })) } }
  const from = source()
  const quiet = (await syncSkillsHandler({ client: 'claude' }, { post: vi.fn().mockResolvedValue(current) } as unknown as LyriksClient, undefined, from)) as Out
  expect(quiet.selfInstall).toBeUndefined()
  expect(from.signIn).not.toHaveBeenCalled()
  const older = (await syncSkillsHandler({ client: 'claude' }, { post: vi.fn().mockResolvedValue(realisticAnswer()) } as unknown as LyriksClient, undefined, from)) as Out
  expect(older.selfInstall).toBeUndefined()
  const itself = { mcpUrl: 'https://studio.example/mcp', signIn: () => null }
  const installer = (await syncSkillsHandler({ client: 'claude' }, { post: vi.fn().mockResolvedValue(withInstaller()) } as unknown as LyriksClient, undefined, itself)) as Out
  expect(installer.selfInstall).toBeUndefined()
})

it('writes a command without a token where the server asks for none, and quotes what needs it', () => {
  expect(selfInstallCommand({ mcpUrl: 'http://localhost:3055/mcp', token: null })).toBe('node .lyriks/tools/sync-skills.mjs --url http://localhost:3055/mcp')
  expect(selfInstallCommand({ mcpUrl: "https://x.example/mcp?a=1&b='2'", token: null })).toBe(`node .lyriks/tools/sync-skills.mjs --url 'https://x.example/mcp?a=1&b='\\''2'\\'''`)
})

it('answers get_skill with the layout of the named client, or the shared pointer block once when it would not fit [criterion:526377e2]', async () => {
  const block = 'b'.repeat(1500)
  const targets = [
    { client: 'claude', path: '.claude/skills/g/SKILL.md' },
    ...['codex', 'gemini', 'copilot', 'generic'].map((client) => ({ client, path: '.agents/skills/g/SKILL.md', pointerPath: 'AGENTS.md', pointerBlock: block })),
  ]
  const answer = { id: 'g', installContent: 'x'.repeat(40000), installTargets: targets }
  expect(fitGuideAnswer(answer, 'claude')).toEqual({ ...answer, installTargets: [targets[0]] })
  const shared = fitGuideAnswer(answer, undefined) as { pointerBlock: string; installTargets: Array<Record<string, unknown>> }
  expect(sizeOf(answer)).toBeGreaterThan(SKILL_SYNC_CONTENT_CAP)
  expect(sizeOf(shared)).toBeLessThanOrEqual(SKILL_SYNC_CONTENT_CAP)
  expect(shared.pointerBlock).toBe(block)
  expect(shared.installTargets.every((t) => !('pointerBlock' in t))).toBe(true)
  const small = { id: 'g', installContent: 'x', installTargets: targets }
  expect(fitGuideAnswer(small, undefined)).toBe(small)
  const get = vi.fn().mockResolvedValue({ ...answer, content: answer.installContent })
  expect(((await getSkillHandler({ skill_id: 'g', client: 'codex' }, { get } as unknown as LyriksClient)) as { installTargets: unknown[] }).installTargets).toEqual([targets[1]])
})
