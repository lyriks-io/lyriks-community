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

import type { LyriksClient } from '../lyriks-client.js'

export async function listSkillsHandler(_args: unknown, lyriks: LyriksClient): Promise<unknown> {
  return lyriks.get('/api/skills')
}

export async function getSkillHandler(
  args: { skill_id: string },
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.get(`/api/skills/${encodeURIComponent(args.skill_id)}`)
}

/**
 * How much skill content one sync answer may carry, in characters. The whole
 * catalog is far larger than that (seven playbooks, ~186k characters), and a
 * single answer that big is refused or truncated by several clients, which
 * costs the session the one call that installs the guides. Past the budget the
 * remaining entries come back deferred, exactly as `include_content:false`
 * returns them, with what to call to get them.
 */
export const SKILL_SYNC_CONTENT_CAP = Number(process.env.MCP_SKILL_SYNC_CAP ?? 80000)

type SyncEntry = Record<string, unknown> & { id?: unknown; installContent?: unknown }

/**
 * Keep whole skills, in catalog order, while they fit the budget; defer the
 * rest. Splitting a SKILL.md is never an option: an install writes it verbatim,
 * so half a guide would install as a whole one.
 */
export function budgetSkillContent(answer: unknown, cap = SKILL_SYNC_CONTENT_CAP): unknown {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return answer
  const body = answer as Record<string, unknown>
  if (!Array.isArray(body.skills)) return answer
  const entries = body.skills as SyncEntry[]
  let room = cap
  const deferred: string[] = []
  const skills = entries.map((entry) => {
    const content = entry.installContent
    if (typeof content !== 'string') return entry
    if (content.length <= room) {
      room -= content.length
      return entry
    }
    deferred.push(String(entry.id ?? ''))
    const { installContent: _dropped, ...rest } = entry
    return { ...rest, contentDeferred: true }
  })
  if (deferred.length === 0) return answer
  return {
    ...body,
    skills,
    deferredForSize: deferred,
    note:
      `This answer carries the guides that fit ${cap} characters of content. ` +
      `${deferred.join(', ')} came back as metadata with contentDeferred:true: fetch each one when you need it, ` +
      'with get_skill, or with sync_skills again naming it in skill_ids. Never install or follow a deferred guide from its description alone.',
  }
}

export async function syncSkillsHandler(
  args: {
    installed?: Array<{ id: string; content_hash?: string }>
    client?: string
    project_id?: string
    skill_ids?: string[]
    include_content?: boolean
  },
  lyriks: LyriksClient,
  cap = SKILL_SYNC_CONTENT_CAP,
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
  })
  return budgetSkillContent(answer, cap)
}
