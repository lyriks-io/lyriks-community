// Authoring-skill distribution: the platform bundles the lyriks-* SKILL.md
// playbooks (build/design/behavior) and serves them read-only under
// /api/skills. These handlers let a connected LLM discover them, fetch the
// full content, and RECONCILE its locally installed copies (sync) — the
// install variant carries a `contentHash:` frontmatter line, so a client
// reports that line back and receives only what is new or stale.
//
// Installation is not Claude-specific: every response carries `installTargets`,
// one layout per agent runtime. A client that names itself in `client` gets its
// own layout alone; one that stays anonymous gets them all and picks.
//
// The binding's helper scripts and hook weigh tens of kilobytes and rarely
// change: `installed_tools` reports the ones the client holds (the hash read
// from each file's `// contentHash:` line) so the platform sends back only the
// stale or missing ones, the rest as `{ path, contentHash, unchanged: true }`.

import type { LyriksClient } from '../lyriks-client.js'

export async function listSkillsHandler(_args: unknown, lyriks: LyriksClient): Promise<unknown> {
  return lyriks.get('/api/skills')
}

export async function getSkillHandler(
  args: { skill_id: string; client?: string },
  lyriks: LyriksClient,
  cap = SKILL_SYNC_CONTENT_CAP,
): Promise<unknown> {
  return fitGuideAnswer(oneCopyOfTheGuide(await lyriks.get(`/api/skills/${encodeURIComponent(args.skill_id)}`)), args.client, cap)
}

type Target = Record<string, unknown> & { client?: unknown; pointerBlock?: unknown }

/**
 * One guide's answer, sized for the client: the layout of the named client
 * alone, or every layout. Five layouts carry the same pointer block four
 * times, which took lyriks-evolution to 46,068 characters; past the cap, that
 * block travels once at the top and each layout names its pointer file only.
 */
export function fitGuideAnswer(answer: unknown, client: string | undefined, cap = SKILL_SYNC_CONTENT_CAP): unknown {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return answer
  const body = answer as Record<string, unknown>
  const targets = Array.isArray(body.installTargets) ? (body.installTargets as Target[]) : null
  if (!targets) return answer
  const mine = client ? targets.filter((target) => target.client === client) : []
  if (mine.length > 0) return { ...body, installTargets: mine }
  if (JSON.stringify(body).length <= cap) return answer
  const pointerBlock = targets.find((target) => typeof target.pointerBlock === 'string')?.pointerBlock
  if (pointerBlock === undefined) return answer
  return {
    ...body,
    pointerBlock,
    installTargets: targets.map(({ pointerBlock: _shared, ...rest }) => rest),
    note: 'Every layout with a pointerPath merges the top-level pointerBlock into it; pass `client` to receive your layout alone.',
  }
}

/**
 * The platform answers a skill with the authored original in `content` AND the
 * install variant in `installContent`, the same guide twice: lyriks-build
 * alone then weighs 76,000 characters, past what one client answer accepts.
 * The install variant is the original plus its `contentHash:` line, so it is
 * the one copy kept.
 */
export function oneCopyOfTheGuide(answer: unknown): unknown {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return answer
  const body = answer as Record<string, unknown>
  if (typeof body.installContent !== 'string' || !('content' in body)) return answer
  const { content: _twin, ...rest } = body
  return rest
}

/**
 * How big one skill answer may be, in serialized characters, ALL of it
 * counted: the guides, the binding block, the hooks and the helper scripts.
 * Claude Code (2.1.318) takes an MCP answer without counting it only up to
 * half its 25,000-token limit at four characters a token, that is 50,000
 * characters; past that it counts the real tokens and refused a 59,056-character
 * sync that the former 60,000 cap had let through (criterion 526377e2). Past
 * the budget, a guide comes back deferred exactly as `include_content:false`
 * returns it, and a script comes back `deferred: true` without its content,
 * each with what to call to get it.
 */
export const SKILL_SYNC_CONTENT_CAP = Number(process.env.MCP_SKILL_SYNC_CAP ?? 45000)

/**
 * The installer and what it imports (criterion 3f42911b): sent before anything
 * else, so a first answer is enough to install every other file from the
 * disk instead of through the conversation.
 */
export const SELF_INSTALL_SCRIPTS: readonly string[] = [
  '.lyriks/tools/mcp-client.mjs',
  '.lyriks/tools/skills-apply.mjs',
  '.lyriks/tools/sync-skills.mjs',
]

/** The command a sync answer offers, and when its sign-in stops working. */
export interface SelfInstall {
  command: string
  expiresAt?: string
}

/**
 * Where the installer reaches this server and how it signs in: `signIn`
 * answers the token to pass (null where this server asks for none), or null
 * when no self-install can be offered (a caller that is the installer itself).
 */
export interface SelfInstallSource {
  mcpUrl: string
  signIn: () => { token: string | null; expiresAt?: string } | null
  /** The live session's waiting command signs in with this (session-ticket.ts, criterion 26c95cc1). */
  sessionTicket?: (sessionId: string) => { token: string | null; expiresAt?: string } | null
}

type SyncEntry = Record<string, unknown> & { id?: unknown; installContent?: unknown }
type ScriptEntry = Record<string, unknown> & { path?: unknown; content?: unknown }

/** Room left for the note that explains what was deferred and what to run. */
const NOTE_ROOM = 1600

/** What a text adds to the answer once serialized, with its key. */
const weight = (key: string, text: string) => JSON.stringify(text).length + key.length + 4

/** A hook of a binding target (Claude Code): written verbatim like a script, then wired. */
type HookEntry = ScriptEntry & { settingsPath?: unknown }
const HOOK_KEYS = ['hook', 'toolsHook'] as const

/**
 * Keep the installer first when one is offered, then whole guides in catalog
 * order, then the hooks, then whole scripts, while the whole answer fits the
 * budget; defer the rest. Splitting a SKILL.md or a script is never an option:
 * an install writes it verbatim, so half a file would install as a whole one.
 * A deferred script or hook keeps its path and hash only: its purpose comes
 * back with its content. `scripts: false` (a metadata-only sync) defers every
 * script and hook, as it defers every guide; `selfInstallOnly`
 * (self_install:true) defers everything but the installer, which then writes
 * the rest from the disk.
 */
export function budgetSkillContent(
  answer: unknown,
  cap = SKILL_SYNC_CONTENT_CAP,
  opts: { scripts?: boolean; selfInstall?: SelfInstall | null; selfInstallOnly?: boolean } = {},
): unknown {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return answer
  const offered = opts.selfInstall ? { selfInstall: opts.selfInstall } : {}
  const body: Record<string, unknown> = { ...(answer as Record<string, unknown>), ...offered }
  const entries = Array.isArray(body.skills) ? (body.skills as SyncEntry[]) : null
  const binding = body.binding && typeof body.binding === 'object' && !Array.isArray(body.binding) ? (body.binding as Record<string, unknown>) : null
  const scripts = binding && Array.isArray(binding.tools) ? (binding.tools as ScriptEntry[]) : null
  const targets = binding && Array.isArray(binding.targets) ? (binding.targets as Array<Record<string, unknown>>) : null
  if (!entries && !scripts) return opts.selfInstall ? body : answer
  // An answer that fits whole, note included, goes as it is: nothing to defer.
  if (!opts.selfInstallOnly && opts.scripts !== false && JSON.stringify(body).length + (opts.selfInstall ? NOTE_ROOM : 0) <= cap) {
    return opts.selfInstall ? { ...body, note: selfInstallNote(opts.selfInstall, (scripts ?? []).filter((entry) => typeof entry.content === 'string' && typeof entry.path === 'string' && SELF_INSTALL_SCRIPTS.includes(entry.path))) } : answer
  }

  const stubOf = (entry: ScriptEntry) => ({ path: entry.path, contentHash: entry.contentHash, deferred: true as const })
  const hookStub = (hook: HookEntry) => {
    const { content: _dropped, ...rest } = hook
    return { ...rest, deferred: true as const }
  }
  const bareSkills = entries?.map((entry) => {
    if (typeof entry.installContent !== 'string') return entry
    const { installContent: _dropped, ...rest } = entry
    return { ...rest, contentDeferred: true }
  })
  const bareScripts = scripts?.map((entry) => (typeof entry.content === 'string' ? stubOf(entry) : entry))
  const bareTargets = targets?.map((target) => {
    const next = { ...target }
    for (const key of HOOK_KEYS) {
      const hook = target[key] as HookEntry | undefined
      if (hook && typeof hook.content === 'string') next[key] = hookStub(hook)
    }
    return next
  })
  const withBinding = (tools: unknown, hookTargets: unknown) => (binding ? { binding: { ...binding, ...(tools ? { tools } : {}), ...(hookTargets ? { targets: hookTargets } : {}) } } : {})
  const bare = { ...body, ...(bareSkills ? { skills: bareSkills } : {}), ...withBinding(bareScripts, bareTargets) }
  // The lists of what was deferred are not in the bare answer: their worst case
  // (everything deferred) is set aside, so the answer can never pass the cap.
  const allIds = (entries ?? []).map((entry) => String(entry.id ?? ''))
  const allPaths = [
    ...(scripts ?? []).map((entry) => String(entry.path ?? '')),
    ...(targets ?? []).flatMap((target) => HOOK_KEYS.map((key) => (target[key] as HookEntry | undefined)?.path).filter((path) => path !== undefined).map(String)),
  ]
  const listsRoom = JSON.stringify({ deferredForSize: allIds, deferredScripts: allPaths }).length + allIds.join(', ').length
  let room = cap - JSON.stringify(bare).length - NOTE_ROOM - listsRoom
  const fits = (cost: number) => {
    if (cost > room) return false
    room -= cost
    return true
  }
  // A file whole instead of its stub: its content, plus whatever the stub had dropped.
  const fileCost = (whole: unknown, stub: unknown) => JSON.stringify(whole).length - JSON.stringify(stub).length
  const isInstaller = (entry: ScriptEntry) => typeof entry.path === 'string' && SELF_INSTALL_SCRIPTS.includes(entry.path)
  const sendScripts = opts.scripts !== false && !opts.selfInstallOnly

  const kept = new Set<unknown>()
  const installer = (scripts ?? []).filter((entry) => typeof entry.content === 'string' && isInstaller(entry))
  if (opts.selfInstall && opts.scripts !== false) for (const entry of installer) if (fits(fileCost(entry, stubOf(entry)))) kept.add(entry)
  // An installer that does not arrive whole cannot run: the command is not offered then.
  const offer = opts.selfInstall && installer.every((entry) => kept.has(entry)) ? opts.selfInstall : null

  const deferred: string[] = []
  const skills = entries?.map((entry, i) => {
    const content = entry.installContent
    if (typeof content !== 'string') return entry
    if (!opts.selfInstallOnly && fits(weight('installContent', content) - 22)) return entry // the stub's contentDeferred:true goes away
    deferred.push(String(entry.id ?? ''))
    return bareSkills![i]
  })
  const deferredScripts: string[] = []
  const hookTargets = targets?.map((target, i) => {
    const next = { ...bareTargets![i] }
    for (const key of HOOK_KEYS) {
      const hook = target[key] as HookEntry | undefined
      if (!hook || typeof hook.content !== 'string') continue
      if (sendScripts && fits(fileCost(hook, hookStub(hook)))) next[key] = hook
      else deferredScripts.push(String(hook.path ?? ''))
    }
    return next
  })
  const tools = scripts?.map((entry, i) => {
    if (typeof entry.content !== 'string' || kept.has(entry)) return entry
    if (sendScripts && fits(fileCost(entry, stubOf(entry)))) return entry
    deferredScripts.push(String(entry.path ?? ''))
    return bareScripts![i]
  })
  const finalBody = offer ? body : (answer as Record<string, unknown>)
  if (deferred.length === 0 && deferredScripts.length === 0) {
    return offer ? { ...body, note: selfInstallNote(offer, installer) } : answer
  }

  const notes: string[] = []
  if (offer) notes.push(selfInstallNote(offer, installer))
  if (deferred.length > 0) {
    notes.push(
      `${deferred.join(', ')} came back as metadata with contentDeferred:true: fetch each one when you need it, ` +
        'with get_skill, or with sync_skills again naming it in skill_ids. Never install or follow a deferred guide from its description alone.',
    )
  }
  if (deferredScripts.length > 0) {
    const how =
      opts.scripts === false
        ? 'this was a metadata-only sync: call sync_skills again without include_content:false, with installed_tools listing every file you hold (path and contentHash), to receive them. '
        : 'write the ones that carry content, then call sync_skills again with installed_tools listing every file you now hold (path and contentHash); the deferred ones come back in that answer, and a deferred hook is wired once it comes. '
    notes.push(
      `${deferredScripts.length} helper script(s) or hook(s) came back with deferred:true and no content: ${how}` +
        'The scripts import each other, so none of them runs until all are installed.',
    )
  }
  return {
    ...finalBody,
    ...(skills ? { skills } : {}),
    ...(deferred.length > 0 ? { deferredForSize: deferred } : {}),
    ...withBinding(tools, hookTargets),
    ...(deferredScripts.length > 0 ? { deferredScripts } : {}),
    note: `This answer is kept under ${cap} characters so every AI client accepts it. ${notes.join(' ')}`,
  }
}

/** What the agent does with the offered command, first among the notes. */
function selfInstallNote(offer: SelfInstall, installer: readonly ScriptEntry[]): string {
  const first = installer.length > 0 ? `write ${installer.map((entry) => entry.path).join(', ')} from this answer (verbatim), then ` : ''
  const until = offer.expiresAt ? ` Its sign-in reads playbooks only and works until ${offer.expiresAt}.` : ''
  return (
    `If you can run Node in the repository root, ${first}run selfInstall.command there: it installs every guide, block, hook and script of this sync, deferred ones included, ` +
    `exactly as published and without passing them through this conversation, and prints only what it wrote.${until} ` +
    'Without a shell, install from this answer as the tool description says.'
  )
}

/** Whether a sync answer leaves anything to write: a guide, a hook or a script the client lacks. */
export function hasFilesToWrite(answer: unknown): boolean {
  if (!answer || typeof answer !== 'object') return false
  const body = answer as Record<string, unknown>
  const skills = Array.isArray(body.skills) ? (body.skills as SyncEntry[]) : []
  if (skills.some((entry) => entry.status !== 'up-to-date')) return true
  const binding = (body.binding ?? {}) as Record<string, unknown>
  const tools = Array.isArray(binding.tools) ? (binding.tools as ScriptEntry[]) : []
  if (tools.some((entry) => !entry.unchanged)) return true
  const targets = Array.isArray(binding.targets) ? (binding.targets as Record<string, unknown>[]) : []
  return targets.some((target) => [target.hook, target.toolsHook].some((hook) => hook && typeof hook === 'object' && !(hook as Record<string, unknown>).unchanged))
}

/** Whether the platform ships the installer at all (an older one does not). */
function shipsInstaller(answer: unknown): boolean {
  const binding = (answer as { binding?: { tools?: ScriptEntry[] } } | null)?.binding
  return Array.isArray(binding?.tools) && binding.tools.some((entry) => entry.path === '.lyriks/tools/sync-skills.mjs')
}

/** The shell command that runs the installer, every value quoted when it needs to be. */
export function selfInstallCommand(o: { mcpUrl: string; token: string | null; client?: string; projectId?: string }): string {
  const quote = (value: string) => (/^[\w./:@=,+-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`)
  const parts = ['node', '.lyriks/tools/sync-skills.mjs', '--url', quote(o.mcpUrl)]
  if (o.client) parts.push('--client', quote(o.client))
  if (o.projectId) parts.push('--project', quote(o.projectId))
  if (o.token) parts.push('--token', quote(o.token))
  return parts.join(' ')
}

export async function syncSkillsHandler(
  args: {
    installed?: Array<{ id: string; content_hash?: string }>
    installed_tools?: Array<{ path: string; content_hash?: string }>
    client?: string
    project_id?: string
    skill_ids?: string[]
    include_content?: boolean
    self_install?: boolean
  },
  lyriks: LyriksClient,
  cap = SKILL_SYNC_CONTENT_CAP,
  selfInstall?: SelfInstallSource,
): Promise<unknown> {
  // MCP snake_case → platform camelCase.
  const installed = (args.installed ?? []).map((ref) => ({
    id: ref.id,
    contentHash: ref.content_hash,
  }))
  const answer = await lyriks.post('/api/skills/sync', {
    installed,
    client: args.client,
    projectId: args.project_id,
    ...(args.skill_ids !== undefined ? { skillIds: args.skill_ids } : {}),
    ...(args.include_content !== undefined ? { includeContent: args.include_content } : {}),
    ...(args.installed_tools !== undefined
      ? { installedTools: args.installed_tools.map((ref) => ({ path: ref.path, contentHash: ref.content_hash })) }
      : {}),
  })
  // The command is offered only when there is something to write and the
  // platform ships the installer; the sign-in is minted then, not before.
  const signIn = selfInstall && hasFilesToWrite(answer) && shipsInstaller(answer) ? selfInstall.signIn() : null
  const offer: SelfInstall | null =
    selfInstall && signIn
      ? {
          command: selfInstallCommand({ mcpUrl: selfInstall.mcpUrl, token: signIn.token, client: args.client, projectId: args.project_id }),
          ...(signIn.expiresAt ? { expiresAt: signIn.expiresAt } : {}),
        }
      : null
  return budgetSkillContent(answer, cap, { scripts: args.include_content !== false, selfInstall: offer, selfInstallOnly: offer !== null && args.self_install === true })
}
