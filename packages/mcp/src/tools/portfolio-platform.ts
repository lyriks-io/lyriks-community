// Portfolio tools of the Community edition.
//
// The platform is then the only project store: every project is a wizard
// project addressed by its slug, and there is no workspace layer to list or to
// file a project under. Each handler answers the SAME tool as its Enterprise
// counterpart in portfolio.ts, so an agent's playbook works on either edition
// without knowing which one it talks to.

import type { LyriksClient } from '../lyriks-client.js'
import { createWizardProjectHandler, SECTIONS, type Section } from './sections.js'
import { updateWizardProjectHandler } from './lyriks-portfolio.js'
import { getPath, summarize } from '../util/shape.js'

/** Why there is nothing to file a project under on this install. */
export const NO_WORKSPACES_NOTE =
  'This install runs the Community edition: projects are not grouped into workspaces. Omit workspace_id.'

interface PortfolioCard {
  id: string
  name?: string
  [key: string]: unknown
}

interface PlatformPortfolio {
  portfolio?: {
    domains?: Array<{ projects?: PortfolioCard[] }>
    unassigned?: PortfolioCard[]
  }
}

export function listWorkspacesWithoutBack(): { workspaces: never[]; note: string } {
  return { workspaces: [], note: NO_WORKSPACES_NOTE }
}

/** Every wizard project card, flat, whatever domain it is filed under. */
async function wizardCards(lyriks: LyriksClient): Promise<PortfolioCard[]> {
  const read = (await lyriks.get('/api/projects')) as PlatformPortfolio
  const portfolio = read?.portfolio
  const cards = [
    ...(portfolio?.domains ?? []).flatMap((domain) => domain?.projects ?? []),
    ...(portfolio?.unassigned ?? []),
  ]
  return cards.filter((card): card is PortfolioCard => !!card && typeof card.id === 'string')
}

/** Same shape as the Back's list: an array of projects, each carrying its id and name. */
export async function listProjectsWithoutBack(lyriks: LyriksClient): Promise<unknown[]> {
  const cards = await wizardCards(lyriks)
  return cards.map((card) => ({ ...card, workspace_id: null, kernel_project_id: card.id }))
}

/**
 * Which sections a get_project read actually needs. A path under
 * `wizard_envelope.<section>` needs that section only; a path elsewhere on the
 * project needs none; a bare `wizard_envelope` (or a full / summary read) needs
 * them all. Reading only what is asked keeps a 13-section project cheap.
 */
export function sectionsFor(paths?: string[]): Section[] {
  if (!paths || paths.length === 0) return [...SECTIONS]
  const named = new Set<Section>()
  for (const path of paths) {
    if (path === 'wizard_envelope') return [...SECTIONS]
    if (!path.startsWith('wizard_envelope.')) continue
    const section = path.slice('wizard_envelope.'.length).split('.')[0]
    if (!(SECTIONS as string[]).includes(section)) return [...SECTIONS]
    named.add(section as Section)
  }
  return [...named]
}

/**
 * The project with its authored spec under `wizard_envelope`, keyed by section
 * wire id exactly as the Back's mirror presents it, assembled from the platform's
 * own section reads.
 */
export async function getProjectWithoutBack(
  args: { project_id: string; summary?: boolean; paths?: string[] },
  lyriks: LyriksClient,
): Promise<unknown> {
  const cards = await wizardCards(lyriks)
  const card =
    cards.find((c) => c.id === args.project_id) ?? cards.find((c) => c.name === args.project_id)
  if (!card) {
    throw new Error(
      `Project "${args.project_id}" is not a Lyriks project id on this install. ` +
        'Check list_wizard_projects (or list_projects) for the slug.',
    )
  }
  const envelope: Record<string, unknown> = {}
  await Promise.all(
    sectionsFor(args.paths).map(async (section) => {
      const qs = `projectId=${encodeURIComponent(card.id)}&section=${section}`
      try {
        const read = (await lyriks.get(`/api/sections?${qs}`)) as { draft?: unknown } | null
        envelope[section] = read?.draft ?? null
      } catch (err) {
        // A few wire ids are write-only on the platform's generic section read
        // (contract, generation): they are simply absent from the envelope, the
        // way they are absent from a Back mirror that never received them.
        if (!isUnknownSection(err)) throw err
      }
    }),
  )
  const project = {
    ...card,
    workspace_id: null,
    kernel_project_id: card.id,
    source_project_id: card.id,
    wizard_envelope: envelope,
  }
  if (args.summary) return { projectId: card.id, summary: summarize(project) }
  if (args.paths && args.paths.length > 0) {
    const selected: Record<string, unknown> = {}
    for (const p of args.paths) selected[p] = getPath(project, p)
    return { projectId: card.id, selected }
  }
  return project
}

/** On Community there is only one kind of project to create: the wizard one. */
export async function createProjectWithoutBack(
  args: { workspace_id?: string; name: string; description?: string },
  lyriks: LyriksClient,
): Promise<unknown> {
  const created = (await createWizardProjectHandler(
    { name: args.name, description: args.description },
    lyriks,
  )) as Record<string, unknown>
  return {
    ...created,
    hint:
      'Created as a Lyriks wizard project (Community edition): the section tools address it by this projectId.',
  }
}

export function updateProjectWithoutBack(
  args: { project_id: string; name?: string; description?: string },
  lyriks: LyriksClient,
): Promise<unknown> {
  return updateWizardProjectHandler(
    { project_id: args.project_id, name: args.name, description: args.description },
    lyriks,
  )
}

/** Deletion stays behind the guarded wizard flow: it needs the exact name as confirmation. */
export function deleteProjectWithoutBack(args: { project_id: string }): never {
  throw new Error(
    `This install runs the Community edition, so delete_project has nothing to delete for "${args.project_id}". ` +
      'Use delete_wizard_project with the exact project name as confirmation.',
  )
}


/** The platform answers 400 "unknown section" for a wire id its generic read does not serve. */
function isUnknownSection(err: unknown): boolean {
  return err instanceof Error && /\b400\b/.test(err.message) && /unknown section/i.test(err.message)
}
